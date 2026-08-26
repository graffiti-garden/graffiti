import {
  GraffitiErrorForbidden,
  type Graffiti,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { GuardDB, type Request } from "./db.js";
import type { GraffitiArgs, GraffitiMethod } from "./graffiti.js";
import { matches } from "./permissions.js";
import { discoveryRequest } from "./requests/discovery.js";
import { logoutRequest } from "./requests/identity.js";
import { mediaRequest } from "./requests/media.js";
import { objectRequest } from "./requests/objects.js";
import {
  actorFromArgs,
  sourceFromArgs,
} from "./source.js";

export class Guard {
  private readonly sessions = new Map<string, GraffitiSession>();

  constructor(
    private readonly graffiti: Graffiti,
    private readonly db: GuardDB,
    private readonly origin: string,
    private readonly ask: (
      request: Request,
      canRemember: boolean,
      preview?: unknown,
    ) => Promise<false | { remember: boolean; anyChannels?: boolean; anyAllowed?: boolean }>,
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
    if (method === "continueDiscover") return undefined;
    const actor = actorFromArgs(args);
    if (!actor) return undefined;
    const source = sourceFromArgs(this.origin, args);
    const prepared = await this.prepare(method, args as any[]);
    if (!prepared) return undefined;

    const request = await this.db.request(
      source,
      actor,
      method,
      prepared.subject,
    );
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

    if (answer.remember && prepared.createMatch) {
      permission = await this.db.grant(request, {
        source,
        actor,
        method,
        match: prepared.createMatch(answer),
      });
    } else {
      await this.db.allow(request);
    }
    return { request, prepared, permission };
  }

  async succeed(handle: any, method: string, value: any) {
    if (!handle) return;
    await this.db.finish(handle.request, {
      ok: true,
      value: resultValue(method, value, handle.request.subject),
    });
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
    if ((await this.db.recoveries(id)).length) {
      throw new Error("This request has already been recovered.");
    }
    const original = entry.request;
    const session = this.sessions.get(original.actor);
    if (!session) throw new Error("Log in as the original actor first.");
    const method = recoveryMethod(original.method);
    if (!method) throw new Error(`${original.method} cannot be recovered.`);
    const request = await this.db.request(
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

  private async prepare(method: string, args: any[]): Promise<any> {
    if (["post", "get", "delete"].includes(method)) {
      return await objectRequest(this.graffiti, method, args);
    }
    if (["postMedia", "getMedia", "deleteMedia"].includes(method)) {
      return await mediaRequest(this.graffiti, method, args);
    }
    if (method === "discover") {
      return discoveryRequest(args as GraffitiArgs<"discover">);
    }
    if (method === "logout") return logoutRequest();
    return undefined;
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
  if (method === "post") return { url: value.url };
  if (method === "postMedia") return { url: value };
  if (["get", "delete"].includes(method)) return { url: subject.object.url };
  if (["getMedia", "deleteMedia"].includes(method)) return { url: subject.url };
  if (method === "discover") return { complete: true };
  return undefined;
}

function recoveryMethod(method: string) {
  if (method === "post") return "delete";
  if (method === "postMedia") return "deleteMedia";
  if (method === "delete") return "post";
  return undefined;
}
