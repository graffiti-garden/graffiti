import type { Component } from "vue";
import type { Request } from "../core/db.js";
import type {
  GuardAnswer,
  GuardPromptContext,
} from "../core/guard.js";
import MediaPromptBody from "./prompts/MediaPromptBody.vue";
import ObjectPromptBody from "./prompts/ObjectPromptBody.vue";
import LogoutPrompt from "./prompts/LogoutPrompt.vue";
import {
  pendingRequests,
  privateResult,
  show,
  withPrompt,
} from "./show.js";

const prompts: Record<string, Component> = {
  post: ObjectPromptBody,
  get: ObjectPromptBody,
  delete: ObjectPromptBody,
  getMedia: MediaPromptBody,
  deleteMedia: MediaPromptBody,
  logout: LogoutPrompt,
};

export function ask(
  request: Request,
  canRemember: boolean,
  preview?: unknown,
  context?: GuardPromptContext,
) {
  return withPrompt(() => {
    const queue = context?.queue;
    const update = () => (pendingRequests.value = queue?.pending ?? 1);
    queue?.events.addEventListener("change", update);
    update();
    privateResult.value = context?.privateResult;
    return new Promise<GuardAnswer>((resolve) => {
      show(prompts[request.method], {
        request,
        canRemember,
        preview,
        resolve,
      });
    }).finally(() => queue?.events.removeEventListener("change", update));
  });
}
