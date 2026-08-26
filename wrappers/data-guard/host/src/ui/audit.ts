import type { Guard } from "../core/guard.js";
import type { Source } from "../core/source.js";
import AuditPanel from "./AuditPanel.vue";
import { show } from "./show.js";

export function openAudit(
  guard: Guard,
  options: { source?: Source; actor?: string; redirectUrl?: string } = {},
) {
  show(AuditPanel, {
    guard,
    initialSource: options.source,
    initialActor: options.actor,
    redirectUrl: options.redirectUrl,
  });
}
