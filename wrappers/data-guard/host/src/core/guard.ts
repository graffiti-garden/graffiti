import {
  GraffitiErrorForbidden,
  type Graffiti,
  type GraffitiMediaAccept,
  type GraffitiObject,
  type GraffitiObjectStream,
  type GraffitiPostMedia,
  type GraffitiSession,
} from "@graffiti-garden/api";
import type { GuardDB, Permission, Request } from "./db.js";
import type { GraffitiArgs, GraffitiMethod } from "./graffiti.js";
import { encodeGuardSiteId } from "../../../client/src/source.js";
import { readMedia, stampMedia } from "./media-provenance.js";
import { LoginAccess } from "./login-access.js";
import { latestDecision } from "./permissions.js";
import { isWithinSource, preparePost, viaSite, type SiteProvenance } from "./provenance.js";
import { actorFromArgs, sessionFromArgs, snapshotSession, sourceFromContext, type Source } from "./source.js";

export type GuardAnswer =
  | false
  | { allow: boolean; remember: boolean }
  | { logout: "site" | "device" }
  | { blockSite: true };

export type GuardQueueStatus = { pending: number; events: EventTarget };
export type GuardPromptContext = { queue: GuardQueueStatus; privateResult?: number };

/** One operation after its inputs have been snapshotted and its scope identified. */
type Prepared = {
  /** Forward these arguments after approval, even if the caller mutates theirs. */
  args: unknown[];
  /** Data shown if the operation needs a prompt; media bytes live in preview/args. */
  subject: unknown;
  preview?: unknown;
  /** A media read already fetched for inspection; release only after approval. */
  result?: unknown;
  /** Permission needed for this operation. Omit when access is automatic. */
  mode?: Request["mode"];
  /** Present only when a remembered decision could cover this operation. */
  grant?: Pick<Permission, "method" | "match">;
  /** An exact private read approval may be remembered for this page session. */
  itemKey?: string;
};

/** Decide access from the requesting site and the data's creating site. */
export class Guard {
  private previousAuthorization = Promise.resolve();
  private readonly itemReads = new Set<string>();
  private readonly queue: GuardQueueStatus = { pending: 0, events: new EventTarget() };

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
    private readonly loginAccess?: LoginAccess,
  ) {}

  async authorize<Method extends GraffitiMethod>(
    method: Method,
    args: GraffitiArgs<Method>,
    source: Source = sourceFromContext(this.origin, {}),
  ) {
    const actor = actorFromArgs(args, method);
    if (actor) this.requireLogin(source, actor);
    // Signing out must work even when data access is blocked or its rules cannot load.
    if (actor && method !== "logout") {
      await this.db.load(source, sessionFromArgs(args, method)!);
      if (await this.db.isSourceBlocked(source, actor)) throw sourceBlocked();
      this.requireLogin(source, actor);
    }
    if (method === "discover" || method === "continueDiscover") return undefined;
    const prepared = await this.prepare(method, args as unknown[], source);
    if (!prepared) return undefined;
    const logout = actor ? await this.authorizePrepared(source, actor, method, prepared) : undefined;
    if (method === "getMedia" && actor && prepared.itemKey) {
      // Remember files already disclosed to this site for this page session.
      this.itemReads.add(`${actor}\n${source.key}\n${prepared.itemKey}`);
    }
    // Execute the snapshotted inputs, never the caller's possibly mutated data.
    return { source, args: prepared.args, result: prepared.result, logout };
  }

  /** Filter both live objects and deletion notices without changing the cursor. */
  async *filterDiscovery(
    stream: GraffitiObjectStream<{}>,
    args: GraffitiArgs<"discover"> | GraffitiArgs<"continueDiscover">,
    source: Source = sourceFromContext(this.origin, {}),
  ): GraffitiObjectStream<{}> {
    const method = Array.isArray(args[0]) ? "discover" : "continueDiscover";
    const session = sessionFromArgs(args, method);
    let privateResult = 0;
    let complete = false;
    try {
      while (true) {
        const next = await stream.next();
        if (next.done) {
          complete = true;
          return next.value;
        }
        const result = next.value;
        if (!result.error) {
          const object = result.object;
          if (object.allowed != null) {
            if (!session) continue;
            const actor = session.actor;
            try {
              this.requireLogin(source, actor);
              await this.db.load(source, session);
              const prepared = this.prepareObjectRead(object, source, args as unknown[]);
              if (result.tombstone) {
                // Deletion notices never prompt: the private value must already
                // be readable under an existing item approval or site grant.
                if (await this.state(source, actor, prepared) !== "allow") continue;
                if (await this.db.isSourceBlocked(source, actor)) continue;
                this.requireLogin(source, actor);
              } else {
                await this.authorizePrepared(source, actor, "get", prepared, ++privateResult);
              }
            } catch (error) {
              if (!(error instanceof GraffitiErrorForbidden)) throw error;
              // Do not reveal how many private results were withheld.
              continue;
            }
          }
        }
        yield result;
      }
    } finally {
      if (!complete) await stream.return({ cursor: "" });
    }
  }

  private authorizePrepared(
    source: Source,
    actor: string,
    method: GraffitiMethod,
    prepared: Prepared,
    privateResult?: number,
  ) {
    let counted = false;
    const count = this.state(source, actor, prepared).then((state) => {
      counted = state === "ask";
      if (counted) this.updatePending(1);
    });
    // Recheck when this reaches the front: an earlier prompt may have saved a
    // grant that covers this request while it was waiting.
    const authorization = this.previousAuthorization.then(async () => {
      await count;
      return this.decide(source, actor, method, prepared, privateResult);
    });
    const tracked = authorization.finally(() => {
      if (counted) this.updatePending(-1);
    });
    this.previousAuthorization = tracked.then(() => undefined, () => undefined);
    return tracked;
  }

  private updatePending(change: number) {
    this.queue.pending += change;
    this.queue.events.dispatchEvent(new Event("change"));
  }

  private async state(source: Source, actor: string, prepared: Prepared) {
    if (prepared.mode === "confirm") return "ask" as const;
    if (!prepared.mode) return "allow" as const;
    if (prepared.grant) {
      const decision = latestDecision(
        await this.db.permissions(source, actor, prepared.grant.method),
        prepared.grant.match,
      );
      if (decision) return decision;
    }
    if (prepared.itemKey) {
      if (this.itemReads.has(`${actor}\n${source.key}\n${prepared.itemKey}`)) {
        return "allow" as const;
      }
    }
    return "ask" as const;
  }

  private async decide(
    source: Source,
    actor: string,
    method: GraffitiMethod,
    prepared: Prepared,
    privateResult?: number,
  ) {
    const state = await this.state(source, actor, prepared);
    if (method !== "logout" && await this.db.isSourceBlocked(source, actor)) throw sourceBlocked();
    // Login can be revoked while fetching data or waiting behind another prompt.
    this.requireLogin(source, actor);
    if (state === "allow") return;
    if (state === "deny") throw denied(method);

    const request: Request = {
      source, actor, method,
      subject: prepared.subject,
      mode: prepared.mode,
      originSite: prepared.grant?.match,
    };
    const canRemember = Boolean(prepared.grant);
    const answer = await this.ask(request, canRemember, prepared.preview, {
      queue: this.queue,
      privateResult,
    });
    if (method !== "logout" && await this.db.isSourceBlocked(source, actor)) {
      throw sourceBlocked();
    }
    this.requireLogin(source, actor);
    if (answer && "blockSite" in answer) {
      await this.db.blockSource(source, actor);
      throw sourceBlocked();
    }
    if (prepared.mode === "logout") {
      if (answer && "logout" in answer) return answer.logout;
      throw denied(method);
    }
    const allow = Boolean(answer && "allow" in answer && answer.allow);
    const remember = Boolean(answer && "remember" in answer && answer.remember && canRemember);
    if (prepared.itemKey && prepared.mode === "read" && allow && !remember) {
      // Re-reading a value already disclosed adds no access. Keep this exact
      // item in memory only; broad remembered grants live in the rule store.
      this.itemReads.add(`${actor}\n${source.key}\n${prepared.itemKey}`);
    }
    if (remember && prepared.grant) {
      await this.db.remember({
        source, actor, ...prepared.grant, decision: allow ? "allow" : "deny",
      });
    }
    if (!allow) throw denied(method);
    this.requireLogin(source, actor);
  }

  private requireLogin(source: Source, actor: string) {
    if (this.loginAccess && !this.loginAccess.allows(actor, source)) {
      throw new GraffitiErrorForbidden("Log in to use your account on this site.");
    }
  }

  private async prepare(
    method: GraffitiMethod,
    args: unknown[],
    source: Source,
  ): Promise<Prepared | undefined> {
    const session = snapshotSession(sessionFromArgs(args, method));
    if (method === "post") {
      const { object, confirm } = preparePost(args[0], source);
      return {
        args: [object, session],
        subject: { kind: "object", object },
        ...(confirm ? { mode: "confirm" as const } : {}),
      };
    }
    if (method === "get" || method === "delete") {
      const url = objectUrl(args[0]);
      // Do not evaluate an app-supplied schema until private-read approval.
      // Otherwise schema mismatch becomes an oracle for a known private URL.
      const object = await this.graffiti.get(url, {}, session);
      if (method === "get") {
        return this.prepareObjectRead(object, source, [url, args[1], session]);
      }
      return this.prepareDelete(
        { kind: "object", object },
        viaSite(object),
        source,
        [url, session],
      );
    }
    if (method === "postMedia") {
      const media = snapshotMedia(args[0]);
      return {
        args: [{ ...media, data: stampMedia(media.data, source) }, session],
        subject: mediaSubject(media),
      };
    }
    if (method === "getMedia" || method === "deleteMedia") {
      const url = objectUrl(args[0]);
      const accept = method === "getMedia"
        ? structuredClone(args[1] ?? {}) as GraffitiMediaAccept
        : {};
      // Preserve the caller's limits: the stamp changes neither bytes nor the
      // base MIME type. This one read supplies both provenance and file bytes.
      const { media, from } = readMedia(await this.graffiti.getMedia(url, accept, session));
      const subject = mediaSubject(media, url);
      if (method === "getMedia") {
        const prepared: Prepared = {
          args: [url, accept, session],
          subject,
          preview: { media },
          result: media,
          itemKey: `media:${url}`,
        };
        if (media.allowed != null && from && !isWithinSource(source, from.id)) {
          prepared.mode = "read";
          prepared.grant = { method: "get", match: siteMatch(from) };
        }
        return prepared;
      }
      return this.prepareDelete(subject, from, source, [url, session], { media });
    }
    if (method === "logout") {
      return {
        args: [session, structuredClone(args[1])],
        subject: { kind: "logout" },
        mode: "logout",
      };
    }
    if (method === "login" || method === "actorToHandle" || method === "handleToActor") {
      return undefined;
    }
    throw new Error(`Unsupported authenticated Graffiti method ${String(method)}.`);
  }

  private prepareObjectRead(object: GraffitiObject<{}>, source: Source, args: unknown[]): Prepared {
    const from = viaSite(object);
    const prepared: Prepared = {
      args,
      subject: { kind: "object", object },
    };
    // Unknown origin is allowed. For stamped private data, the producing site
    // and its ancestors may read; other sites need approval.
    if (object.allowed != null && from && !isWithinSource(source, from.id)) {
      prepared.mode = "read";
      prepared.grant = { method: "get", match: siteMatch(from) };
      prepared.itemKey = `object:${object.url}`;
    }
    return prepared;
  }

  private prepareDelete(
    subject: unknown,
    from: SiteProvenance | undefined,
    source: Source,
    args: unknown[],
    preview?: unknown,
  ): Prepared {
    const prepared: Prepared = {
      args,
      subject,
      preview,
    };
    // Unstamped objects and media are allowed. Provenance is stored with the
    // data, so editing the URL cannot remove it.
    if (from && !isWithinSource(source, from.id)) {
      prepared.mode = "delete";
      prepared.grant = { method: "delete", match: siteMatch(from) };
    }
    return prepared;
  }
}


function siteMatch(from: SiteProvenance): Permission["match"] {
  return { kind: "site", site: encodeGuardSiteId(from.id), ...(from.name ? { name: from.name } : {}) };
}

function snapshotMedia(value: unknown): GraffitiPostMedia {
  if (!value || typeof value !== "object" || !("data" in value) || !(value.data instanceof Blob)) {
    throw new TypeError("A media upload needs Blob data.");
  }
  const original = value as GraffitiPostMedia;
  // Blob and File bytes are immutable; only the surrounding metadata needs a copy.
  return {
    data: original.data,
    ...(original.allowed !== undefined
      ? { allowed: original.allowed == null ? null : [...original.allowed] }
      : {}),
  };
}

function mediaSubject(media: { data: Blob; actor?: string; allowed?: string[] | null }, url?: string) {
  return {
    kind: "media", ...(url ? { url } : {}),
    type: media.data.type || "application/octet-stream",
    size: media.data.size,
    ...(typeof File !== "undefined" && media.data instanceof File ? { name: media.data.name } : {}),
    ...(media.actor ? { actor: media.actor } : {}),
    ...(media.allowed !== undefined ? { allowed: media.allowed } : {}),
  };
}

function objectUrl(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "url" in value && typeof value.url === "string") return value.url;
  throw new TypeError("Expected a Graffiti URL.");
}

function denied(method: GraffitiMethod) {
  return new GraffitiErrorForbidden(`The user denied the ${method} request.`);
}

function sourceBlocked() {
  return new GraffitiErrorForbidden("The user blocked all requests from this site.");
}
