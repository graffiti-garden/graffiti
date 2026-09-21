import type { Component } from "vue";
import { setVisible } from "../bootstrap/protocol.js";
import type { Request } from "../core/db.js";
import type {
  GuardPromptContext,
  GuardQueueStatus,
} from "../core/guard.js";
import DeleteMediaPrompt from "./prompts/DeleteMediaPrompt.vue";
import DeletePrompt from "./prompts/DeletePrompt.vue";
import GetMediaPrompt from "./prompts/GetMediaPrompt.vue";
import GetPrompt from "./prompts/GetPrompt.vue";
import LogoutPrompt from "./prompts/LogoutPrompt.vue";
import PostMediaPrompt from "./prompts/PostMediaPrompt.vue";
import PostPrompt from "./prompts/PostPrompt.vue";
import {
  clear,
  pendingRequests,
  privateResult,
  show,
} from "./show.js";

let observedQueue: GuardQueueStatus | undefined;
let stopObservingQueue: (() => void) | undefined;

function observeQueue(queue?: GuardQueueStatus) {
  if (!queue || observedQueue === queue) return;
  stopObservingQueue?.();
  const update = () => (pendingRequests.value = queue.pending);
  observedQueue = queue;
  queue.events.addEventListener("change", update);
  stopObservingQueue = () => queue.events.removeEventListener("change", update);
  update();
}

const prompts: Record<string, Component> = {
  post: PostPrompt,
  get: GetPrompt,
  delete: DeletePrompt,
  postMedia: PostMediaPrompt,
  getMedia: GetMediaPrompt,
  deleteMedia: DeleteMediaPrompt,
  logout: LogoutPrompt,
};

export function ask(
  request: Request,
  canRemember: boolean,
  preview?: unknown,
  context?: GuardPromptContext,
) {
  // Guard serializes authorization decisions before they reach this surface.
  observeQueue(context?.queue);
  if (!context) pendingRequests.value = 1;
  privateResult.value = context?.privateResult;
  setVisible(true);
  return new Promise<any>((resolve) => {
    show(prompts[request.method], {
      request,
      canRemember,
      preview,
      resolve(answer: unknown) {
        clear();
        setVisible(false);
        resolve(answer);
      },
    });
  });
}
