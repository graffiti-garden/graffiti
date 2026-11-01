import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";

const marker = "\u001egraffiti-rpc:";
// Each iframe adds one prefix and removes it on return. Quoting the ID keeps
// routes distinct even when IDs contain delimiters or share a text prefix.
export const statePrefix = (id: string) => `${marker}${JSON.stringify(id)}:`;
const eventTypes = ["login", "logout", "initialized"] as const;

type SessionHistory = {
  sessions: Map<string, GraffitiSession>;
  initialized: boolean;
  replies: Set<CustomEvent>;
};
const histories = new WeakMap<EventTarget, SessionHistory>();

/** Capture replies before a page has constructed the iframe that will receive them. */
export function rememberSessionEvents(events: EventTarget): SessionHistory {
  const existing = histories.get(events);
  if (existing) return existing;
  const history: SessionHistory = { sessions: new Map(), initialized: false, replies: new Set() };
  histories.set(events, history);
  for (const type of eventTypes) events.addEventListener(type, event => {
    const detail = (event as CustomEvent).detail;
    if (type === "initialized") history.initialized = true;
    else {
      if (!detail.error) {
        if (type === "login") history.sessions.set(detail.session.actor, detail.session);
        else history.sessions.delete(detail.actor);
      }
      if (typeof detail.state === "string" && detail.state.startsWith(marker)) {
        history.replies.add(event as CustomEvent);
      }
    }
  });
  return history;
}

/**
 * A fresh event view for relaying Graffiti to a nested frame. Only that frame's
 * pending request results are replayed; existing app listeners are untouched.
 * Use the same stateId in serveGraffiti(...).connect and after a page reload.
 */
export function createGraffitiRelay(graffiti: Graffiti, stateId: string) {
  const history = rememberSessionEvents(graffiti.sessionEvents);
  const prefix = statePrefix(stateId);
  const sessionEvents = new EventTarget();
  const seen = new Set<string>();
  let initialized = false;

  const emit = (event: CustomEvent) => {
    let detail = event.detail;
    if (event.type === "login" || event.type === "logout") {
      const { state, ...rest } = detail;
      if (typeof state === "string" && state.startsWith(prefix)) {
        history.replies.delete(event);
      } else {
        if (rest.error && state !== undefined) return;
        detail = rest;
      }
      if (!detail.error) {
        if (event.type === "login") seen.add(detail.session.actor);
        else seen.delete(detail.actor);
      }
    }
    sessionEvents.dispatchEvent(new CustomEvent(event.type, { detail }));
  };

  const initialize = () => {
    if (initialized) return;
    initialized = true;
    for (const event of [...history.replies]) {
      if (!event.detail.state.startsWith(prefix)) continue;
      if (!history.replies.delete(event)) continue;
      let detail = event.detail;
      if (event.type === "login" && !detail.error) {
        const session = history.sessions.get(detail.session.actor);
        // Use current session data, or report a sign-out while the frame was absent.
        detail = session ? { ...detail, session } : {
          error: new Error("Login session is no longer active"), state: detail.state,
        };
      }
      emit(new CustomEvent(event.type, { detail }));
    }
    for (const session of history.sessions.values()) {
      if (!seen.has(session.actor)) emit(new CustomEvent("login", { detail: { session } }));
    }
    emit(new CustomEvent("initialized"));
  };
  const forward = (event: Event) => {
    if (event.type === "initialized") initialize();
    else emit(event as CustomEvent);
  };
  for (const type of eventTypes) graffiti.sessionEvents.addEventListener(type, forward);
  const replay = window.setTimeout(() => { if (history.initialized) initialize(); }, 0);

  return {
    stateId,
    graffiti: new Proxy(graffiti, {
      get(target, property) {
        if (property === "sessionEvents") return sessionEvents;
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
    destroy() {
      window.clearTimeout(replay);
      for (const type of eventTypes) graffiti.sessionEvents.removeEventListener(type, forward);
    },
  };
}
