import ActorManager from "@graffiti-garden/actor-manager-client";
import BYOStorage from "@graffiti-garden/byo-storage";
import type { BYOStorageOptions } from "@graffiti-garden/byo-storage";
import dialogHTML from "./login.html?raw";
import defaultStyle from "./login.css?raw";
import type { ActorManagerOptions } from "@graffiti-garden/actor-manager-client";

export interface LoginOptions {
  style?: string;
  actorManagerURL?: string;
  onChosenActor?: ActorManagerOptions["onChosenActor"];
  onStorageStateChange?: BYOStorageOptions["onLoginStateChange"];
  storageAuthentication: BYOStorageOptions["authentication"];
}

export default class LoginManager {
  hasUsedGraffiti: boolean;
  usingActorManager = false;
  dialog = document.createElement("dialog");
  main: HTMLElement;
  nickname: string = "";
  actorURI: string | null = null;
  byoStorage: BYOStorage;
  actorManager: ActorManager;

  constructor(options: LoginOptions) {
    // See if the user has used graffiti on this site before
    this.hasUsedGraffiti = !!localStorage.getItem("graffiti-has-logged-in");

    this.dialog.className = "graffiti-login";
    this.dialog.innerHTML = dialogHTML;
    document.body.prepend(this.dialog);

    // Click outside of dialog to close
    this.dialog.addEventListener("click", (e) => {
      const rect = this.dialog.getBoundingClientRect();
      if (
        rect.top > e.clientY ||
        rect.left > e.clientX ||
        e.clientY > rect.top + rect.height ||
        e.clientX > rect.left + rect.width
      ) {
        this.close();
      }
    });

    // Or click the close button to close
    const closeBtn = this.dialog.querySelector("#graffiti-login-close");
    closeBtn?.addEventListener("click", () => this.close());

    this.main = this.dialog.querySelector(
      "#graffiti-login-main",
    ) as HTMLElement;

    const style = options.style ? options.style : defaultStyle;
    if (style.length) {
      const styleEl = document.createElement("style");
      styleEl.textContent = style;
      document.head.append(styleEl);
    }

    this.byoStorage = new BYOStorage({
      authentication: options.storageAuthentication,
      onLoginStateChange: (state) => {
        this.redraw();
        // If logged in to storage and never used graffiti before,
        // show the dialog
        if (state && !this.hasUsedGraffiti) {
          this.open();
        }
        options.onStorageStateChange?.(state);
      },
    });

    this.actorManager = new ActorManager({
      actorManagerURL: options.actorManagerURL,
      onUICancel: () => {
        this.usingActorManager = false;
        // If everything is complete, mark that the user
        // has gone through initial setup
        this.redraw();
      },
      onChosenActor: (
        actor:
          | {
              uri: string;
              nickname: string;
            }
          | {
              uri: null;
            },
      ) => {
        this.actorURI = actor.uri;
        if (actor.uri) {
          this.usingActorManager = false;
          this.nickname = actor.nickname;
        }
        this.redraw();
        options.onChosenActor?.(actor);
      },
    });

    // Add the iframe to the
    this.actorManager.iframe.id = "graffiti-actor-manager";
    this.actorManager.iframe.style.display = "none";
    this.main.appendChild(this.actorManager.iframe);

    this.redraw();
  }

  get loggedIn(): boolean {
    return this.byoStorage.loggedIn && this.actorManager.chosenActor !== null;
  }

  open(): void {
    this.dialog.showModal();
    this.dialog.focus();
  }

  close(): void {
    this.dialog.close();
    if (
      !this.hasUsedGraffiti &&
      this.byoStorage.loggedIn &&
      this.actorManager.chosenActor
    ) {
      this.hasUsedGraffiti = true;
      localStorage.setItem("graffiti-has-logged-in", "true");
    }
    this.redraw();
  }

  redraw() {
    // Remove all children except the actor manager,
    // which needs to stay in the DOM to keep its state
    this.main
      .querySelectorAll(":not(#graffiti-actor-manager)")
      .forEach((child) => {
        child.remove();
      });

    // Hide the actor manager
    this.actorManager.iframe.style.display = "none";

    if (this.usingActorManager) {
      this.actorManager.iframe.style.display = "block";
    } else {
      this.actorManager.iframe.style.display = "none";

      if (!this.hasUsedGraffiti) {
        if (!this.byoStorage.loggedIn) {
          this.onWelcome1();
        } else if (!this.actorManager.chosenActor) {
          this.onWelcome2();
        } else {
          this.onSetupComplete();
        }
      } else {
        this.onRegular();
      }
    }
  }

  onWelcome1() {
    const welcomeTemplate = this.dialog.querySelector(
      "#graffiti-login-welcome-1",
    ) as HTMLTemplateElement;
    const welcomeContent = welcomeTemplate.content.cloneNode(true);
    this.main.appendChild(welcomeContent);

    const byoStorageButton = this.dialog.querySelector(
      "#graffiti-login-byo-storage",
    );
    byoStorageButton?.addEventListener("click", () =>
      this.byoStorage.toggleLogIn(),
    );
  }

  onWelcome2() {
    const loggedInTemplate = this.dialog.querySelector(
      "#graffiti-login-welcome-2",
    ) as HTMLTemplateElement;
    const loggedInContent = loggedInTemplate.content.cloneNode(true);
    this.main.appendChild(loggedInContent);

    const actorManagerButton = this.dialog.querySelector(
      "#graffiti-login-actor-manager",
    );
    actorManagerButton?.addEventListener("click", () => {
      this.usingActorManager = true;
      this.redraw();
    });
  }

  onSetupComplete() {
    const setupCompleteTemplate = this.dialog.querySelector(
      "#graffiti-login-setup-complete",
    ) as HTMLTemplateElement;
    const setupCompleteContent = setupCompleteTemplate.content.cloneNode(true);
    this.main.appendChild(setupCompleteContent);
    const closeBtn = this.dialog.querySelector("#graffiti-login-setup-close");
    closeBtn?.addEventListener("click", () => this.close());
  }

  onRegular() {
    const regularTemplate = this.dialog.querySelector(
      "#graffiti-login-regular",
    ) as HTMLTemplateElement;
    const regularContent = regularTemplate.content.cloneNode(true);
    this.main.appendChild(regularContent);

    const forgetButton = this.dialog.querySelector("#graffiti-login-forget");
    forgetButton?.addEventListener("click", () => {
      localStorage.removeItem("graffiti-has-logged-in");
      this.hasUsedGraffiti = false;
      if (this.byoStorage.loggedIn) {
        this.byoStorage.toggleLogIn();
      }
      this.redraw();
      this.dialog.close();
    });

    const actorManagerButton = this.dialog.querySelector(
      "#graffiti-login-actor-manager",
    );
    actorManagerButton?.addEventListener("click", () => {
      this.usingActorManager = true;
      this.redraw();
    });

    const actorInfoEl = this.dialog.querySelector("#graffiti-login-actor-info");
    if (actorInfoEl) {
      if (this.actorURI) {
        actorInfoEl.innerHTML = `
          <h3>You are using an actor nicknamed</h3>
          <h2>${this.nickname}</h2>
        `;
      } else {
        actorInfoEl.innerHTML = `
          <h3>You have not selected an actor!</h3>
        `;
      }
    }

    const storageInfoEl = this.dialog.querySelector(
      "#graffiti-login-storage-info",
    );
    if (storageInfoEl) {
      if (this.byoStorage.loggedIn) {
        storageInfoEl.innerHTML = `
          <h3>You are using storage provider</h3>
          <h2>Dropbox</h2>
        `;
      } else {
        storageInfoEl.innerHTML = `
          <h3>You are not connected to a storage provider</h3>
        `;
      }
    }
    const byoStorageButton = this.dialog.querySelector(
      "#graffiti-login-byo-storage",
    );
    if (byoStorageButton) {
      byoStorageButton.addEventListener("click", () =>
        this.byoStorage.toggleLogIn(),
      );
      if (this.byoStorage.loggedIn) {
        byoStorageButton.textContent = "Disconnect Storage Provider";
      } else {
        byoStorageButton.textContent = "Connect Storage Provider";
      }
    }
  }
}
