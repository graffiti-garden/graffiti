import type { Graffiti, GraffitiLoginEvent, GraffitiLogoutEvent, GraffitiSession } from "@graffiti-garden/api";
import { shallowReactive } from "vue";
import type { Source } from "../core/source.js";
import AuditPanel from "./AuditPanel.vue";
import { show } from "./show.js";

/** Subscribe before restoration; the audit panel opens after initialized. */
export function trackAuditSessions(graffiti: Graffiti) {
  const sessions = shallowReactive(new Map<string, GraffitiSession>());
  graffiti.sessionEvents.addEventListener("login", (event) => {
    const detail = (event as GraffitiLoginEvent).detail;
    if (!detail.error) sessions.set(detail.session.actor, detail.session);
  });
  graffiti.sessionEvents.addEventListener("logout", (event) => {
    const detail = (event as GraffitiLogoutEvent).detail;
    if (!detail.error) sessions.delete(detail.actor);
  });
  return sessions;
}

export function openAudit(
  sessions: ReadonlyMap<string, GraffitiSession>,
  options: { source?: Source; actor?: string; redirectUrl?: string } = {},
) {
  show(AuditPanel, {
    sessions,
    initialSource: options.source,
    initialActor: options.actor,
    redirectUrl: options.redirectUrl,
  });
}
