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

// The app has one prompt surface. Serialize prompts so concurrent Graffiti
// calls cannot replace one another and leave an authorization unresolved.
let previousPrompt = Promise.resolve();

export function ask(request: Request, canRemember: boolean, preview?: unknown) {
  const answer = previousPrompt.then(() => open(request, canRemember, preview));
  previousPrompt = answer.then(() => undefined, () => undefined);
  return answer;
}

function open(request: Request, canRemember: boolean, preview?: unknown) {
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
