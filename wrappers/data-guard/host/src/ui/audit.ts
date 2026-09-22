import type { Source } from "../core/source.js";
import AuditPanel from "./AuditPanel.vue";
import { show } from "./show.js";

export function openAudit(
  options: { source?: Source; actor?: string; redirectUrl?: string } = {},
) {
  show(AuditPanel, {
    initialSource: options.source,
    initialActor: options.actor,
    redirectUrl: options.redirectUrl,
  });
}
