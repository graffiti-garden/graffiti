import {
  GraffitiErrorForbidden,
  type Graffiti,
  type GraffitiObject,
} from "@graffiti-garden/api";
import { GuardDB, type Permission, type Request } from "./db.js";
import type { GraffitiArgs, GraffitiMethod } from "./graffiti.js";
import { exactReadMatch, matches } from "./permissions.js";
import { logoutRequest } from "./requests/identity.js";
import { mediaRequest } from "./requests/media.js";
import {
  objectRequest,
  prepareObjectRequest,
} from "./requests/objects.js";
import {
  actorFromArgs,
  sessionFromArgs,
  sourceFromArgs,
} from "./source.js";

export type GuardAnswer =
  | false
  | { allow: boolean; remember: boolean }
  | { blockSite: true };

export type GuardQueueStatus = {
  pending: number;
  events: EventTarget;
};

export type GuardPromptContext = {
  queue: GuardQueueStatus;
  privateResult?: number;
};

export class Guard {
  private previousAuthorization = Promise.resolve();
  private readonly queue: GuardQueueStatus = {
    pending: 0,
    events: new EventTarget(),
  };

  constructor(
    private readonly graffiti: Graffiti,
    private readonly db: GuardDB,
    private readonly origin: string,
    private readonly ask: (
      request: Request,
      canRemember: boolean,
      preview?: unknown,
      context?: GuardPromptContext,
    ) => Promise<GuardAnswer>,
  ) {}

  async authorize<Method extends GraffitiMethod>(
    method: Method,
    args: GraffitiArgs<Method>,
  ) {
    if (method === "discover" || method === "continueDiscover") {
      return undefined;
    }
    const actor = actorFromArgs(args);
    if (!actor) return undefined;
    const session = sessionFromArgs(args)!;
    const source = sourceFromArgs(this.origin, args);
    await this.db.load(source, session);
    if (await this.db.isSourceBlocked(source, actor)) throw sourceBlocked();
    const prepared = await this.prepare(method, args as any[]);
    if (!prepared) return undefined;
    return this.authorizePrepared(source, actor, method, prepared);
  }

  async authorizeDiscovered(
    args: GraffitiArgs<"discover"> | GraffitiArgs<"continueDiscover">,
    object: GraffitiObject<{}>,
    privateResult = 1,
  ) {
    if (object.allowed == null) return undefined;
    const actor = actorFromArgs(args);
    if (!actor) {
      throw new GraffitiErrorForbidden(
        "A private discovery result requires an authenticated session.",
      );
    }
    const source = sourceFromArgs(this.origin, args);
    const session = sessionFromArgs(args)!;
    await this.db.load(source, session);
    if (await this.db.isSourceBlocked(source, actor)) throw sourceBlocked();
    const prepared = prepareObjectRequest(object);
    const handle = await this.authorizePrepared(
      source,
      actor,
      "get",
      prepared,
      privateResult,
    );
    // Once the object crosses into the app, retaining its exact URL requires
    // no broader authority than the disclosure which has already occurred.
    await this.db.ensurePermission(
      objectReadPermission(source, actor, prepared.subject.object.url),
    );
    return handle;
  }

  private authorizePrepared(
    source: ReturnType<typeof sourceFromArgs>,
    actor: string,
    method: GraffitiMethod,
    prepared: any,
    privateResult?: number,
  ) {
    let counted = false;
    const countIfPromptCandidate = this.couldPrompt(
      source,
      actor,
      method,
      prepared,
    ).then((couldPrompt) => {
      counted = couldPrompt;
      if (couldPrompt) this.updatePending(1);
    });
    // Recheck saved permissions only when this request reaches the front of
    // the queue, so a broad grant from the preceding prompt can authorize it.
    const authorization = this.previousAuthorization.then(async () => {
      await countIfPromptCandidate;
      return this.decide(source, actor, method, prepared, privateResult);
    });
    const tracked = authorization.finally(() => {
      if (counted) this.updatePending(-1);
    });
    this.previousAuthorization = tracked.then(
      () => undefined,
      () => undefined,
    );
    return tracked;
  }

  private async couldPrompt(
    source: ReturnType<typeof sourceFromArgs>,
    actor: string,
    method: GraffitiMethod,
    prepared: any,
  ) {
    if (isPublicRead(method, prepared)) return false;
    return !(await this.db.permissions(source, actor, method)).some(
      (permission) => matches(permission, prepared.subject),
    );
  }

  private updatePending(change: number) {
    this.queue.pending += change;
    this.queue.events.dispatchEvent(new Event("change"));
  }

  private async decide(
    source: ReturnType<typeof sourceFromArgs>,
    actor: string,
    method: GraffitiMethod,
    prepared: any,
    privateResult?: number,
  ) {
    if (await this.db.isSourceBlocked(source, actor)) throw sourceBlocked();
    const request = await this.db.request(
      source,
      actor,
      method,
      prepared.subject,
    );
    // A successful preparatory fetch proves data is public when it has no
    // allowed list. Keep the authenticated read auditable, but do not ask the
    // user to authorize access to data available without their session.
    if (isPublicRead(method, prepared)) {
      await this.db.allow(request);
      return { request, prepared };
    }
    let permission = (await this.db.permissions(source, actor, method))
      .filter((candidate) => matches(candidate, prepared.subject))
      .sort((left, right) => right.createdAt - left.createdAt)[0];

    if (permission) {
      if (permission.decision === "deny") {
        await this.db.deny(request);
        throw new GraffitiErrorForbidden(
          `The user denied the ${method} request.`,
        );
      }
      await this.db.allow(request);
      return { request, prepared, permission };
    }

    const answer = await this.ask(
      request,
      Boolean(prepared.createMatch),
      prepared.preview,
      { queue: this.queue, privateResult },
    );
    if (await this.db.isSourceBlocked(source, actor)) {
      await this.db.deny(request);
      throw sourceBlocked();
    }
    if (answer && "blockSite" in answer) {
      await this.db.blockSource(source, actor);
      await this.db.deny(request);
      throw sourceBlocked();
    }
    const rememberSimilar = Boolean(answer && answer.remember);
    const retainExactRead = Boolean(
      answer && !answer.remember && ["get", "getMedia"].includes(method),
    );
    const match =
      prepared.createMatch && (rememberSimilar || retainExactRead)
        ? retainExactRead
          ? exactReadMatch(prepared.subject)
          : prepared.createMatch()
        : undefined;

    if (!answer || !answer.allow) {
      if (match) {
        await this.db.block(request, {
          source,
          actor,
          method,
          match,
        });
      } else {
        await this.db.deny(request);
      }
      throw new GraffitiErrorForbidden(`The user denied the ${method} request.`);
    }

    if (match) {
      permission = await this.db.grant(request, {
        source,
        actor,
        method,
        match,
      });
    } else {
      await this.db.allow(request);
    }
    return { request, prepared, permission };
  }

  async succeed(handle: any, value: any) {
    if (!handle) return;
    const request = handle.request as Request;
    await this.db.finish(
      request,
      implicitReadPermission(request, value),
    );
  }

  async fail(handle: any, error: unknown) {
    if (!handle) return;
    void error;
    await this.db.finish(handle.request);
  }

  async revoke(id: string) {
    await this.db.revoke(id);
  }

  async unblockSource(key: string) {
    await this.db.unblockSource(key);
  }

  private async prepare(method: GraffitiMethod, args: any[]): Promise<any> {
    switch (method) {
      case "post":
      case "get":
      case "delete":
        return await objectRequest(this.graffiti, method, args);
      case "postMedia":
      case "getMedia":
      case "deleteMedia":
        return await mediaRequest(this.graffiti, method, args);
      case "logout":
        return logoutRequest();
      case "discover":
      case "continueDiscover":
      case "login":
      case "actorToHandle":
      case "handleToActor":
        return undefined;
      default:
        return unsupportedMethod(method);
    }
  }

}

function isPublicRead(method: GraffitiMethod, prepared: any) {
  return (
    (method === "get" && prepared.subject.object.allowed == null) ||
    (method === "getMedia" && prepared.subject.allowed == null)
  );
}

function implicitReadPermission(request: Request, value: any) {
  // The calling app necessarily learns the URL returned by its own write, so
  // asking again before it reads that exact URL cannot protect information.
  const subject = request.subject as any;
  if (request.method === "post") {
    if (subject.object.allowed == null) return undefined;
    return objectReadPermission(
      request.source,
      request.actor,
      value.url,
    );
  }
  if (request.method === "postMedia") {
    if (subject.allowed == null) return undefined;
    return {
      source: request.source,
      actor: request.actor,
      method: "getMedia" as const,
      match: exactReadMatch({ ...subject, url: value }),
    };
  }
  return undefined;
}

function objectReadPermission(
  source: Request["source"],
  actor: string,
  url: string,
) {
  return {
    source,
    actor,
    method: "get" as const,
    match: exactReadMatch({ kind: "object", object: { url } }),
  };
}

function unsupportedMethod(method: never): never {
  throw new Error(`Unsupported authenticated Graffiti method ${String(method)}.`);
}

function sourceBlocked() {
  return new GraffitiErrorForbidden(
    "The user blocked all requests from this site.",
  );
}
