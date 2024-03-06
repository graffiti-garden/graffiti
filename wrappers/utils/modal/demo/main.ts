import Graffiti from "../src/index";

declare global {
  interface Window {
    graffiti: Graffiti;
    post: () => void;
    subscribe: () => void;
  }
}

window.graffiti = new Graffiti({
  byoStorage: {
    authentication: {
      clientId: "h4bnq16igcef7tg",
    },
    onLoginStateChange(loginState) {
      const loginEl = document.getElementById("storage-login");
      if (loginEl) {
        loginEl.textContent = loginState
          ? "Log out of storage"
          : "Log in to storage";
      }
    },
  },
  actorManager: {
    onChosenActor(actorURI) {
      const actorEl = document.getElementById("actor-id");
      if (actorEl) {
        actorEl.textContent = actorURI;
      }
    },
  },
});

window.post = async () => {
  const contextEl = document.getElementById("context") as HTMLInputElement;
  const messageEl = document.getElementById("message") as HTMLInputElement;
  const data = new TextEncoder().encode(messageEl.value);
  await window.graffiti.update(contextEl.value, data);
};

let abortController: AbortController | null = null;
window.subscribe = async () => {
  const contextEl = document.getElementById("context") as HTMLInputElement;

  // Stop the existing subscription
  if (abortController) abortController.abort();

  const postsEl = document.getElementById("posts");
  if (postsEl) {
    postsEl.innerHTML = "";
  }

  // Start a new subscription
  abortController = new AbortController();
  for await (const result of window.graffiti.subscribe(
    contextEl.value,
    abortController.signal,
  )) {
    if (result.type === "update") {
      const postEl =
        document.getElementById(result.uuid) ?? document.createElement("li");
      const text = new TextDecoder().decode(result.data);
      postEl.textContent = `"${text}" - ${result.actor}`;
      postEl.id = result.uuid;
      // If not already in the post list, add it
      if (!document.getElementById(result.uuid)) postsEl?.appendChild(postEl);
    } else if (result.type === "delete") {
      const postEl = document.getElementById(result.uuid);
      postEl?.remove();
    }
  }
};
