import type { Graffiti } from "@graffiti-garden/api";
import { reactive } from "vue";
import { sourceLabel, type Source } from "../core/source.js";
import LoginPrompt from "./LoginPrompt.vue";
import { show, withPrompt } from "./show.js";

/** A chosen actor, null for another account, or undefined for cancellation. */
export function askLogin(graffiti: Graffiti, source: Source, actors: string[]) {
  // Use the same queue as data approvals; login needs no separate queue.
  return withPrompt(() => new Promise<string | null | undefined>(resolve => {
    const accounts = reactive<{ actor: string; handle?: string | null }[]>(
      actors.map(actor => ({ actor })),
    );
    show(LoginPrompt, {
      site: sourceLabel(source),
      accounts,
      choose: resolve,
      loginAnother: () => resolve(null),
      cancel: () => resolve(undefined),
    });
    // Enable each account only once it can be identified. Updating these rows
    // cannot replace a newer dialog if a lookup finishes after cancellation.
    accounts.forEach(async account => {
      account.handle = await graffiti.actorToHandle(account.actor).catch(() => null);
    });
  }));
}
