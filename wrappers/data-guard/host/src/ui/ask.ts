import type { Component } from "vue";
import { setVisible } from "../bootstrap/protocol.js";
import type { Request } from "../core/db.js";
import DeleteMediaPrompt from "./prompts/DeleteMediaPrompt.vue";
import DeletePrompt from "./prompts/DeletePrompt.vue";
import DiscoverPrompt from "./prompts/DiscoverPrompt.vue";
import GetMediaPrompt from "./prompts/GetMediaPrompt.vue";
import GetPrompt from "./prompts/GetPrompt.vue";
import LogoutPrompt from "./prompts/LogoutPrompt.vue";
import PostMediaPrompt from "./prompts/PostMediaPrompt.vue";
import PostPrompt from "./prompts/PostPrompt.vue";
import { clear, show } from "./show.js";

const prompts: Record<string, Component> = {
  post: PostPrompt,
  get: GetPrompt,
  delete: DeletePrompt,
  discover: DiscoverPrompt,
  postMedia: PostMediaPrompt,
  getMedia: GetMediaPrompt,
  deleteMedia: DeleteMediaPrompt,
  logout: LogoutPrompt,
};

export function ask(request: Request, canRemember: boolean, preview?: unknown) {
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
