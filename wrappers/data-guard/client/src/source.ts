import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";

export type GuardSourceSegment = { id: string; name: string; url?: string };

/** Guard-specific context; other Graffiti implementations may ignore it. */
export type GuardLoginOptions = NonNullable<Parameters<Graffiti["login"]>[0]> & {
  source?: GuardSourceSegment[];
};

export type GuardSession = GraffitiSession & {
  source?: GuardSourceSegment[];
  /** Approved paths, relative to the receiving page. [] means this page. IDs only. */
  guardSites?: string[][];
};

export const sessionArgumentIndex: Readonly<Record<string, number>> = {
  post: 1, get: 2, delete: 1, discover: 2, continueDiscover: 1,
  postMedia: 1, getMedia: 2, deleteMedia: 1, logout: 0,
};

/**
 * Give a child an ordinary Graffiti instance with its own site context and
 * identity events. Construct it before the parent's session restoration events;
 * use a fresh RPC relay when the child may appear after those events arrived.
 * The containing page assigns the segment; a child cannot remove that prefix.
 */
export function withGuardSource(
  graffiti: Graffiti,
  source: () => GuardSourceSegment | undefined,
) {
  const sessionEvents = new EventTarget();
  const visibleActors = new Set<string>();
  const forward = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    let detail = event.detail;
    // Failed operations need no identity payload. In particular, an unrelated
    // account's error must not reveal that account to an anonymous child.
    if (detail?.error) {
      const { session: _session, actor: _actor, ...failure } = detail;
      detail = failure;
    }
    if (event.type === "login" && !detail.error) {
      const session = detail.session as GuardSession;
      const segment = source();
      if (session.guardSites) {
        const guardSites = segment ? session.guardSites
          .filter(path => path[0] === segment.id).map(path => path.slice(1)) : session.guardSites;
        if (!guardSites.length) {
          // A site logout arrives as updated approvals so other sites keep
          // their sessions. Turn it into an ordinary logout at this boundary
          // only when this site (and therefore all its children) lost access.
          if (detail.guardLogout && (visibleActors.delete(session.actor) || detail.state !== undefined)) {
            sessionEvents.dispatchEvent(new CustomEvent("logout", {
              detail: { actor: session.actor, state: detail.state },
            }));
          } else if (detail.state !== undefined) sessionEvents.dispatchEvent(new CustomEvent("login", {
            detail: { error: new Error("This page is no longer signed in"), state: detail.state },
          }));
          return;
        }
        detail = { ...detail, session: { ...session, guardSites } };
      }
      visibleActors.add(session.actor);
    } else if (event.type === "logout" && !detail.error) {
      // A correlated logout can complete after a reload, when the actor is
      // already gone from restoration. The relay supplies only this caller's state.
      if (!visibleActors.delete(detail.actor) && detail.state === undefined) return;
    }
    sessionEvents.dispatchEvent(new CustomEvent(event.type, { detail }));
  };
  const eventTypes = ["login", "logout", "initialized"];
  for (const type of eventTypes) graffiti.sessionEvents.addEventListener(type, forward);

  function addSource<T extends { source?: GuardSourceSegment[] }>(context: T): T {
    const segment = source();
    return { ...context, source: [...(segment ? [segment] : []), ...(context.source ?? [])] };
  }

  const child = new Proxy(graffiti, {
    get(target, property) {
      if (property === "sessionEvents") return sessionEvents;
      if (property === "login") {
        return (options: GuardLoginOptions = {}) => target.login(addSource(options));
      }
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      const index = sessionArgumentIndex[String(property)];
      return (...args: unknown[]) => {
        if (index !== undefined && args[index] != null) {
          args[index] = addSource(args[index] as GuardSession);
        }
        return value.apply(target, args);
      };
    },
  });
  return {
    graffiti: child,
    destroy() {
      for (const type of eventTypes) graffiti.sessionEvents.removeEventListener(type, forward);
    },
  };
}
