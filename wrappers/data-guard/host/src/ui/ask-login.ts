import type { Graffiti } from "@graffiti-garden/api";
import { sourceLabel, type Source } from "../core/source.js";
import LoginPrompt from "./LoginPrompt.vue";
import { show, withPrompt } from "./show.js";

/** A chosen actor, null for another account, or undefined for cancellation. */
export function askLogin(graffiti: Graffiti, source: Source, actors: string[], returning: boolean) {
  // Use the same queue as data approvals; login needs no separate queue.
  return withPrompt(() => new Promise<string | null | undefined>(resolve => {
    let open = true;
    const finish = (choice?: string | null) => {
      if (!open) return;
      open = false;
      resolve(choice);
    };
    const props = {
      site: sourceLabel(source),
      accounts: actors.map(actor => ({ actor })),
      choose: finish,
      loginAnother: returning ? undefined : () => finish(null),
      cancel: () => finish(),
    };
    show(LoginPrompt, props);
    // Show account buttons immediately. Slow lookups must neither delay choice
    // nor replace a newer dialog after this one has closed.
    void Promise.all(actors.map(async actor => ({
      actor, handle: await graffiti.actorToHandle(actor).catch(() => undefined),
    }))).then(accounts => {
      if (open) show(LoginPrompt, { ...props, accounts });
    });
  }));
}
