import Graffiti from "../src/index";
import "./style.css";

declare global {
  interface Window {
    graffiti: Graffiti;
    post: (event: Event) => void;
    subscribe: (event: Event) => void;
  }
}

window.graffiti = new Graffiti({
  storageAuthentication: {
    clientId: "6hy9svekk1qo41w",
  },
  onStorageStateChange() {
    showOrHideStuff();
  },
  onChosenActor() {
    showOrHideStuff();
  },
});

const showOrHideStuff = () => {
  const stuffEl = document.getElementById("stuff");
  if (!stuffEl) return;
  if (window.graffiti.loggedIn) {
    stuffEl.style.display = "block";
  } else {
    stuffEl.style.display = "none";
  }
};

window.post = async (event) => {
  event.preventDefault();
  const contextEl = document.getElementById("context") as HTMLInputElement;
  const messageEl = document.getElementById("message") as HTMLInputElement;
  const data = new TextEncoder().encode(messageEl.value);
  messageEl.value = "";
  await window.graffiti.update(contextEl.value, data);
};

let abortController: AbortController | null = null;
window.subscribe = async (event) => {
  event.preventDefault();
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
      postEl.innerHTML = `
        <h2>${result.actor}</h2>
        <p>${text}</p>`;
      postEl.id = result.uuid + result.actor;

      if (result.actor === window.graffiti.myActor) {
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
      }

      // If not already in the post list, add it
      if (!document.getElementById(result.uuid)) postsEl?.appendChild(postEl);
    } else if (result.type === "delete") {
      const postEl = document.getElementById(result.uuid + result.actor);
      postEl?.remove();
    }
  }
};
