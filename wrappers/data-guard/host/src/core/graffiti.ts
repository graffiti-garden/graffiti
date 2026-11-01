import {
  Graffiti,
  type GraffitiLoginEvent,
  type GraffitiLogoutEvent,
  type GraffitiObjectStream,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { requestLoginRedirect } from "../bootstrap/protocol.js";
import { askLogin } from "../ui/ask-login.js";
import { sessionArgumentIndex, type GuardLoginOptions, type GuardSession } from "../../../client/src/source.js";
import type { Guard } from "./guard.js";
import { LoginAccess } from "./login-access.js";
import { sessionFromArgs, snapshotSession, sourceFromContext, type Source } from "./source.js";

export type GraffitiMethod = {
  [Key in keyof Graffiti]: Graffiti[Key] extends (...args: never[]) => unknown
    ? Key
    : never;
}[keyof Graffiti] & string;

export type GraffitiArgs<Method extends GraffitiMethod> = Parameters<Graffiti[Method]>;

type Method = (...args: unknown[]) => unknown;
type LoginOptions = GuardLoginOptions | undefined;

/** Expose Graffiti with site login, protected calls, and filtered discovery streams. */
// @ts-expect-error Abstract methods are supplied dynamically by the proxy.
export class GuardedGraffiti extends Graffiti {
  readonly sessionEvents: EventTarget;
  private readonly activeActors = new Set<string>();
  private readonly visibleActors = new Set<string>();
  private sessionsInitialized = false;

  constructor(
    private readonly graffiti: Graffiti,
    private readonly guard: Guard,
    private readonly loginAccess?: LoginAccess,
    private readonly origin?: string,
    initialLogin?: GraffitiLoginEvent["detail"] & { source?: Source["path"] },
  ) {
    super();
    this.sessionEvents = loginAccess ? new EventTarget() : graffiti.sessionEvents;
    if (loginAccess && origin) {
      graffiti.sessionEvents.addEventListener("login", (event) => {
        if (!loginAccess.available) return;
        if (!(event instanceof CustomEvent)) return;
        const detail = event.detail as GraffitiLoginEvent["detail"];
        if (detail.error) return;
        // Apps receive the actor, not implementation-specific session credentials.
        const actor = detail.session.actor;
        this.activeActors.add(actor);
        const visible = this.visibleSession(actor);
        if (visible) this.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: { session: visible } }));
      });
      graffiti.sessionEvents.addEventListener("logout", (event) => {
        if (!(event instanceof CustomEvent)) return;
        const detail = event.detail as GraffitiLogoutEvent["detail"];
        const visible = detail.error || this.visibleActors.delete(detail.actor);
        if (!detail.error) this.endLogin(detail.actor);
        if (visible || detail.state !== undefined) {
          this.sessionEvents.dispatchEvent(new CustomEvent("logout", {
            detail: detail.error ? { error: detail.error, state: detail.state } : detail,
          }));
        }
      });
      graffiti.sessionEvents.addEventListener("initialized", async (event) => {
        this.sessionsInitialized = true;
        if (initialLogin) {
          const { source = [], ...detail } = initialLogin;
          const result = await this.approveReturnedLogin(detail, source)
            .catch(error => ({ error, state: detail.state }));
          this.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: result }));
        }
        this.sessionEvents.dispatchEvent(new CustomEvent("initialized", {
          detail: event instanceof CustomEvent ? event.detail : undefined,
        }));
      }, { once: true });
    }
    const implementation: object = graffiti;
    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (Reflect.has(target, property)) {
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        }
        const value = Reflect.get(implementation, property);
        if (typeof value !== "function") return value;
        // Restore the method/argument relationship lost at this reflection boundary.
        const method = String(property) as GraffitiMethod;
        const implementationMethod = value as Method;
        return (...args: unknown[]) => {
          const source = this.origin
            ? sourceFromContext(this.origin, sessionFromArgs(args, method))
            : undefined;
          if (method === "discover" || method === "continueDiscover") {
            return this.stream(method, implementationMethod,
              args as GraffitiArgs<"discover"> | GraffitiArgs<"continueDiscover">, source);
          }
          return this.call(method, implementationMethod, args as GraffitiArgs<typeof method>, source);
        };
      },
    });
  }

  private visibleSession(actor: string): GuardSession | undefined {
    if (!this.activeActors.has(actor) || !this.origin) return;
    const guardSites = this.loginAccess?.paths(actor, this.origin) ?? [];
    // Do not expose any account until this site or one of its children is approved.
    if (!guardSites.length) return;
    this.visibleActors.add(actor);
    return { actor, guardSites };
  }

  login = async (options?: GuardLoginOptions) => {
    const scope = this.origin ? sourceFromContext(this.origin, options).path : [];
    const result = await this.requestLogin(options, scope);
    if (result && "redirect" in result) {
      requestLoginRedirect({ ...options, source: scope, ...result.redirect });
    } else if (result) {
      this.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: result }));
    }
  };

  /** The origin-bound, one-use login result already records an explicit account choice. */
  private async approveReturnedLogin(detail: GraffitiLoginEvent["detail"], scope: Source["path"]) {
    if (detail.error || !this.loginAccess || !this.origin) return detail;
    const actor = detail.session.actor;
    if (!this.activeActors.has(actor)) {
      return { error: new Error("Login session is no longer active"), state: detail.state };
    }
    // Save approval here, using the embedded guard's storage after cookie access.
    // It need not share localStorage with the top-level login page.
    this.loginAccess.grant(actor, sourceFromContext(this.origin, { source: scope }));
    return { ...detail, session: this.visibleSession(actor)! };
  }

  // A fresh sign-in uses the guard's existing top-level navigation protocol.
  private async requestLogin(
    options: LoginOptions,
    scope: Source["path"],
  ): Promise<GraffitiLoginEvent["detail"] | { redirect: { actor?: string; chooseAccount?: boolean } } | undefined> {
    if (!this.loginAccess || !this.origin) {
      await this.graffiti.login(options);
      return;
    }
    // Public browsing does not wait for shared storage or account restoration.
    // Establish storage during the top-level login visit instead.
    if (!this.loginAccess.available) {
      return { redirect: { actor: options?.actor, chooseAccount: true } };
    }
    if (!this.sessionsInitialized) {
      await new Promise<void>((resolve) =>
        this.sessionEvents.addEventListener("initialized", () => resolve(), { once: true })
      );
    }
    const source = sourceFromContext(this.origin, { source: scope });
    const actors = [...this.activeActors];
    const actor = options?.actor;
    // A fresh account sign-in already asks the user to choose an identity.
    // Keep the decentralized implementation's familiar same-tab redirect.
    if (!actors.length || (actor && !this.activeActors.has(actor))) {
      return { redirect: { actor, chooseAccount: true } };
    }
    const choice = await askLogin(this.graffiti, source, actors);
    if (choice === null) return { redirect: { actor: undefined } };
    if (choice) {
      // The account may have signed out while the chooser was open.
      if (!this.activeActors.has(choice)) return { error: new Error("Login session is no longer active"), state: options?.state };
      this.loginAccess.grant(choice, source);
      return { session: this.visibleSession(choice)!, ...(options?.state === undefined ? {} : { state: options.state }) };
    }
    return { error: new Error("Login canceled"), state: options?.state };
  }

  private endLogin(actor: string) {
    this.activeActors.delete(actor);
    this.loginAccess?.clear(actor);
  }

  private async call<CallMethod extends GraffitiMethod>(
    method: CallMethod,
    implementation: Method,
    args: GraffitiArgs<CallMethod>,
    source?: Source,
  ) {
    const authorization = await this.guard.authorize(method, args, source);
    // The guard applied the caller's limits and inspected this exact media read.
    if (method === "getMedia") return authorization?.result;
    const forwardedArgs = authorization?.args ?? args;
    if (authorization?.logout === "site" && !this.loginAccess) {
      throw new Error("Site login is unavailable.");
    }
    if (method === "logout" && this.loginAccess) {
      const session = forwardedArgs[0] as GraffitiSession;
      if (authorization?.logout === "site") {
        this.loginAccess.revoke(session.actor, authorization.source);
        // Publish the remaining approvals as a session update. Guard clients
        // turn this into logout at the revoked site and its descendants; RPC
        // continues to carry the unchanged sessions of parents and siblings.
        const options = forwardedArgs[1] as Parameters<Graffiti["logout"]>[1];
        this.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: {
          session: { actor: session.actor, guardSites: this.loginAccess.paths(session.actor, authorization.source.origin) },
          guardLogout: true,
          state: options?.state,
        } }));
        return;
      }
      // OAuth logout may navigate away before its completion event. Revoke the
      // site grant as soon as the guard approves the sign-out request.
      this.loginAccess.clear(session.actor);
    }
    return await implementation.apply(this.graffiti, forwardedArgs);
  }

  private async *stream(
    method: "discover" | "continueDiscover",
    implementation: Method,
    args: GraffitiArgs<"discover"> | GraffitiArgs<"continueDiscover">,
    source?: Source,
  ): GraffitiObjectStream<{}> {
    const forwarded = [...args] as typeof args;
    const index = sessionArgumentIndex[method];
    if (forwarded[index] != null) forwarded[index] = snapshotSession(sessionFromArgs(args, method));
    // Check site login and blocking before the implementation starts any work.
    await this.guard.authorize(method, forwarded, source);
    const stream = implementation.apply(this.graffiti, forwarded) as GraffitiObjectStream<{}>;
    return yield* this.guard.filterDiscovery(stream, forwarded, source);
  }
}
