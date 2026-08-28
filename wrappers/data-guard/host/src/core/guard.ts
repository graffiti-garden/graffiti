import {
  GraffitiErrorForbidden,
  type Graffiti,
  type GraffitiObject,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { GuardDB, type Request } from "./db.js";
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
  sourceFromArgs,
} from "./source.js";

export class Guard {
  private readonly sessions = new Map<string, GraffitiSession>();
  private previousAuthorization = Promise.resolve();

  constructor(
    private readonly graffiti: Graffiti,
    private readonly db: GuardDB,
    private readonly origin: string,
    private readonly ask: (
      request: Request,
      canRemember: boolean,
      preview?: unknown,
    ) => Promise<false | { remember: boolean }>,
  ) {
    graffiti.sessionEvents.addEventListener("login", (event) => {
      if (!(event instanceof CustomEvent) || event.detail?.error) return;
      this.sessions.set(event.detail.session.actor, event.detail.session);
    });
    graffiti.sessionEvents.addEventListener("logout", (event) => {
      if (!(event instanceof CustomEvent) || event.detail?.error) return;
      this.sessions.delete(event.detail.actor);
    });
  }

  async authorize<Method extends GraffitiMethod>(
    method: Method,
    args: GraffitiArgs<Method>,
  ) {
    if (method === "discover" || method === "continueDiscover") {
      return undefined;
    }
    const actor = actorFromArgs(args);
    if (!actor) return undefined;
    const source = sourceFromArgs(this.origin, args);
    const prepared = await this.prepare(method, args as any[]);
    if (!prepared) return undefined;
    return this.authorizePrepared(source, actor, method, prepared);
  }

  async authorizeDiscovered(
    args: GraffitiArgs<"discover"> | GraffitiArgs<"continueDiscover">,
    object: GraffitiObject<{}>,
  ) {
    if (object.allowed == null) return undefined;
    const actor = actorFromArgs(args);
    if (!actor) {
      throw new GraffitiErrorForbidden(
        "A private discovery result requires an authenticated session.",
      );
    }
    const source = sourceFromArgs(this.origin, args);
    const prepared = prepareObjectRequest(object);
    const handle = await this.authorizePrepared(
      source,
      actor,
      "get",
      prepared,
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
  ) {
    // Recheck saved permissions only when this request reaches the front of
    // the queue, so a broad grant from the preceding prompt can authorize it.
    const authorization = this.previousAuthorization.then(() =>
      this.decide(source, actor, method, prepared),
    );
    this.previousAuthorization = authorization.then(
      () => undefined,
      () => undefined,
    );
    return authorization;
  }

  private async decide(
    source: ReturnType<typeof sourceFromArgs>,
    actor: string,
    method: GraffitiMethod,
    prepared: any,
  ) {
    const request = await this.db.request(
      source,
      actor,
      method,
      prepared.subject,
    );
    // A successful preparatory fetch proves data is public when it has no
    // allowed list. Keep the authenticated read auditable, but do not ask the
    // user to authorize access to data available without their session.
    if (
      (method === "get" && prepared.subject.object.allowed == null) ||
      (method === "getMedia" && prepared.subject.allowed == null)
    ) {
      await this.db.allow(request);
      return { request, prepared };
    }
    let permission = (await this.db.permissions(source, actor, method)).find(
      (candidate) => matches(candidate, prepared.subject),
    );

    if (permission) {
      await this.db.allow(request, permission);
      return { request, prepared, permission };
    }

    const answer = await this.ask(
      request,
      Boolean(prepared.createMatch),
      prepared.preview,
    );
    if (!answer) {
      await this.db.deny(request);
      throw new GraffitiErrorForbidden(`The user denied the ${method} request.`);
    }

    const retainExactRead =
      !answer.remember && ["get", "getMedia"].includes(method);
    if ((answer.remember || retainExactRead) && prepared.createMatch) {
      permission = await this.db.grant(request, {
        source,
        actor,
        method,
        match: retainExactRead
          ? exactReadMatch(prepared.subject)
          : prepared.createMatch(),
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
      {
        ok: true,
        value: resultValue(request.method, value, request.subject),
      },
      implicitReadPermission(request, value),
    );
  }

  async fail(handle: any, error: unknown) {
    if (!handle) return;
    await this.db.finish(handle.request, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  audit() {
    return this.db.audit();
  }

  hasSession(actor?: string) {
    return Boolean(actor && this.sessions.has(actor));
  }

  async revoke(id: string) {
    await this.db.revoke(id);
  }

  async recover(id: string) {
    const entry = await this.db.entry(id);
    if (!entry?.result?.execution?.ok) {
      throw new Error("Only successful requests can be recovered.");
    }
    const original = entry.request;
    const session = this.sessions.get(original.actor);
    if (!session) throw new Error("Log in as the original actor first.");
    const method = recoveryMethod(original.method);
    if (!method) throw new Error(`${original.method} cannot be recovered.`);
    const request = await this.db.recovery(
      original.source,
      original.actor,
      method,
      original.subject,
      original.id,
    );
    await this.db.allow(request);
    try {
      const value = await this.performRecovery(original, entry.result.execution.value, session);
      await this.db.finish(request, { ok: true, value });
    } catch (error) {
      await this.db.finish(request, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  clearHistory() {
    return this.db.clearHistory();
  }

  clearEverything() {
    return this.db.clearEverything();
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

  private async performRecovery(
    request: Request,
    result: unknown,
    session: GraffitiSession,
  ) {
    const value = result as any;
    const subject = request.subject as any;
    if (request.method === "post") {
      await this.graffiti.delete(value.url, session);
      return { deletedUrl: value.url };
    }
    if (request.method === "postMedia") {
      await this.graffiti.deleteMedia(value.url, session);
      return { deletedUrl: value.url };
    }
    const object = subject.object;
    const restored = await this.graffiti.post(
      {
        value: object.value,
        channels: object.channels,
        ...(object.allowed !== undefined ? { allowed: object.allowed } : {}),
      },
      session,
    );
    return { url: restored.url, replacesUrl: object.url };
  }
}

function resultValue(method: string, value: any, subject: any) {
  // Audit results retain only identifiers needed for recovery, never private
  // response bodies, session credentials, or media bytes.
  if (method === "post") return { url: value.url };
  if (method === "postMedia") return { url: value };
  if (["get", "delete"].includes(method)) return { url: subject.object.url };
  if (["getMedia", "deleteMedia"].includes(method)) return { url: subject.url };
  return undefined;
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

function recoveryMethod(method: string) {
  if (method === "post") return "delete";
  if (method === "postMedia") return "deleteMedia";
  if (method === "delete") return "post";
  return undefined;
}
