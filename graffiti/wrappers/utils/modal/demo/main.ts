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
  const context = contextEl.value;

  // Stop the existing subscription
  if (abortController) abortController.abort();

  const postsEl = document.getElementById("posts");
  if (postsEl) {
    postsEl.innerHTML = "";
  }

  // Start a new subscription
  abortController = new AbortController();
  for await (const result of window.graffiti.subscribe(
    context,
    abortController.signal,
  )) {
    if (result.type === "update") {
      const postEl =
        document.getElementById(result.uuid + result.actor) ??
        document.createElement("li");
      const text = new TextDecoder().decode(result.data);
      postEl.textContent = `"${text}" - ${result.actor}`;
      postEl.id = result.uuid + result.actor;

      const delButton = document.createElement("button");
      delButton.textContent = "Delete";
      delButton.onclick = async () => {
        await window.graffiti.delete(context, result.uuid);
      };
      postEl.appendChild(delButton);

      const editButton = document.createElement("button");
      editButton.textContent = "Edit";
      editButton.onclick = async () => {
        const newText = prompt("Enter new text", text);
        if (newText) {
          const newData = new TextEncoder().encode(newText);
          await window.graffiti.update(context, newData, result.uuid);
        }
      };
      postEl.appendChild(editButton);

      // If not already in the post list, add it
      if (!document.getElementById(result.uuid)) postsEl?.appendChild(postEl);
    } else if (result.type === "delete") {
      const postEl = document.getElementById(result.uuid + result.actor);
      postEl?.remove();
    }
  }
};
