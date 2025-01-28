import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
} from "@graffiti-garden/api";
import { getDefaultSession } from "@inrupt/solid-client-authn-browser";
import type { GraffitiSolidOIDCInterfaceOptions } from "../types";

export type { GraffitiSolidOIDCInterfaceOptions };

export class GraffitiSolidOIDCInterface
  implements Pick<Graffiti, "login" | "logout" | "sessionEvents">
{
  login: Graffiti["login"] = async (proposal, state) => {
    if (state) {
      localStorage.setItem("graffiti-login-state", state);
    } else {
      localStorage.removeItem("graffiti-login-state");
    }
    this.open();
  };

  logout: Graffiti["logout"] = async (session, state) => {
    if ("fetch" in session) {
      if (state) {
        localStorage.setItem("graffiti-logout-state", state);
      } else {
        localStorage.removeItem("graffiti-logout-state");
      }
      await this.solidSession.logout();
    } else {
      const existingActor = localStorage.getItem("graffiti-login-actor");
      if (existingActor === session.actor) {
        localStorage.removeItem("graffiti-login-actor");
      }
      const detail: GraffitiLogoutEvent["detail"] = {
        state,
        actor: session.actor,
      };
      const event: GraffitiLogoutEvent = new CustomEvent("logout", { detail });
      this.sessionEvents.dispatchEvent(event);
    }
  };

  protected cancelLogin() {
    const state = localStorage.getItem("graffiti-login-state") ?? undefined;
    if (state) localStorage.removeItem("graffiti-login-state");
    const detail: GraffitiLoginEvent["detail"] = {
      state,
      error: new Error("User cancelled login"),
    };
    const event: GraffitiLoginEvent = new CustomEvent("login", { detail });
    this.sessionEvents.dispatchEvent(event);
    this.close();
  }

  protected onSolidLoginEvent(error?: Error) {
    const state = localStorage.getItem("graffiti-login-state") ?? undefined;
    if (state) localStorage.removeItem("graffiti-login-state");
    let detail: GraffitiLoginEvent["detail"] & {
      session?: {
        fetch: typeof fetch;
      };
    };
    if (
      !error &&
      this.solidSession.info.isLoggedIn &&
      this.solidSession.info.webId
    ) {
      detail = {
        state,
        session: {
          actor: this.solidSession.info.webId,
          fetch: this.solidSession.fetch,
        },
      };
    } else {
      detail = {
        state,
        error: error ?? new Error("Login with solid failed"),
      };
    }
    const event: GraffitiLoginEvent = new CustomEvent("login", { detail });
    this.sessionEvents.dispatchEvent(event);
  }

  protected onSolidLogoutEvent() {
    const state = localStorage.getItem("graffiti-logout-state") ?? undefined;
    if (state) localStorage.removeItem("graffiti-logout-state");
    let detail: GraffitiLogoutEvent["detail"];
    if (this.solidSession.info.webId) {
      detail = { state, actor: this.solidSession.info.webId };
    } else {
      detail = {
        state,
        error: new Error("Logged out, but no actor given"),
        actor: "",
      };
    }
    const event: GraffitiLogoutEvent = new CustomEvent("logout", { detail });
    this.sessionEvents.dispatchEvent(event);
  }

  sessionEvents: Graffiti["sessionEvents"] = new EventTarget();

  protected dialog = document.createElement("dialog");
  protected main: Promise<HTMLElement>;
  protected solidSession = getDefaultSession();
  constructor(options?: GraffitiSolidOIDCInterfaceOptions) {
    this.solidSession.events.on("sessionRestore", () =>
      this.onSolidLoginEvent(),
    );
    this.solidSession.events.on("login", () => this.onSolidLoginEvent());
    this.solidSession.events.on("logout", () => this.onSolidLogoutEvent());
    this.solidSession.events.on("error", (error) => {
      this.onSolidLoginEvent(error ? new Error(error) : undefined);
    });

    const sessionRestorer = async () => {
      // Allow listeners to be added first
      await Promise.resolve();

      const actor = window.localStorage.getItem("graffiti-login-actor");
      if (actor) {
        const event: GraffitiLoginEvent = new CustomEvent("login", {
          detail: { session: { actor } },
        });
        this.sessionEvents.dispatchEvent(event);
      }
      await this.solidSession.handleIncomingRedirect({
        restorePreviousSession: true,
      });
    };
    sessionRestorer();

    this.dialog.className = "graffiti-login";

    // Click outside of dialog to close
    this.dialog.addEventListener("click", (e) => {
      if ("pointerType" in e && !e.pointerType) return;
      const rect = this.dialog.getBoundingClientRect();
      if (
        rect.top > e.clientY ||
        rect.left > e.clientX ||
        e.clientY > rect.top + rect.height ||
        e.clientX > rect.left + rect.width
      ) {
        this.cancelLogin();
      }
    });

    document.body.prepend(this.dialog);

    const scriptPath = import.meta.url;
    const scriptDir = scriptPath.substring(0, scriptPath.lastIndexOf("/"));

    this.main = fetch(scriptDir + "/index.html")
      .then((res) => res.text())
      .then((dialogHTML) => {
        this.dialog.innerHTML = dialogHTML;

        const closeBtn = this.dialog.querySelector("#graffiti-login-close");
        closeBtn?.addEventListener("click", () => this.cancelLogin());

        return this.dialog.querySelector("#graffiti-login-main") as HTMLElement;
      });

    if (options?.useDefaultStyle !== false) {
      const styleEl = document.createElement("link");
      styleEl.rel = "stylesheet";
      styleEl.href = scriptDir + "/style.css";
      document.head.append(styleEl);
    }

    this.onWelcome();
  }

  protected open() {
    this.onWelcome();
    this.dialog.showModal();
    this.dialog.focus();
  }

  protected close() {
    this.dialog.close();
  }

  protected async displayTemplate(id: string) {
    // Remove all children
    (await this.main).querySelectorAll("*").forEach((child) => {
      child.remove();
    });
    const template = this.dialog.querySelector("#" + id) as HTMLTemplateElement;
    const content = template.content.cloneNode(true);
    (await this.main).appendChild(content);
  }

  protected addLocalLoginButton() {
    const localLoginButton = this.dialog.querySelector(
      "#graffiti-login-local-button",
    ) as HTMLButtonElement;
    localLoginButton.addEventListener("click", (evt) => {
      evt.preventDefault();
      this.onLocalLogin();
    });
  }

  protected addSolidLoginButton() {
    const solidLoginButton = this.dialog.querySelector(
      "#graffiti-login-solid-button",
    ) as HTMLButtonElement;
    solidLoginButton.addEventListener("click", (evt) => {
      evt.preventDefault();
      this.onSolidLogin();
    });
  }

  protected async onWelcome() {
    await this.displayTemplate("graffiti-login-welcome");
    this.addLocalLoginButton();
    this.addSolidLoginButton();
  }

  protected async onLocalLogin() {
    await this.displayTemplate("graffiti-login-local");
    this.addSolidLoginButton();

    const form = this.dialog.querySelector(
      "#graffiti-login-local-form",
    ) as HTMLFormElement;
    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      const formData = new FormData(form);
      const actor = formData.get("actor") as string;
      if (actor.startsWith("http")) {
        alert(
          "Local usernames cannot start with 'http' so they don't conflict with Solid WebIDs.",
        );
        return;
      }

      const state = localStorage.getItem("graffiti-login-state") ?? undefined;
      if (state) localStorage.removeItem("graffiti-login-state");
      const detail: GraffitiLoginEvent["detail"] = {
        state,
        session: { actor },
      };
      const event: GraffitiLoginEvent = new CustomEvent("login", { detail });
      this.sessionEvents.dispatchEvent(event);

      // Save the actor for later
      localStorage.setItem("graffiti-login-actor", actor);

      this.close();
    });

    const input = this.dialog.querySelector(
      "#graffiti-login-local-actor",
    ) as HTMLInputElement;
    input.focus();
  }

  protected async onSolidLogin() {
    await this.displayTemplate("graffiti-login-solid");
    this.addLocalLoginButton();

    const form = this.dialog.querySelector(
      "#graffiti-login-solid-form",
    ) as HTMLFormElement;
    form.addEventListener("submit", async (evt) => {
      evt.preventDefault();

      // Change the login button to "Logging in..."
      const submitButton = form.querySelector(
        "input[type=submit]",
      ) as HTMLButtonElement;
      submitButton.value = "Logging in...";
      submitButton.disabled = true;

      const formData = new FormData(form);
      const oidcIssuer = formData.get("solid-issuer") as string;
      try {
        await this.solidSession.login({
          oidcIssuer,
          redirectUrl: window.location.href,
          clientName: "Graffiti Application",
        });
      } catch (error) {
        if (error instanceof Error) {
          alert(error.message);
        } else {
          alert(JSON.stringify(error));
        }
      }
    });

    const input = this.dialog.querySelector(
      "#graffiti-login-solid-issuer",
    ) as HTMLInputElement;
    input.focus();
  }
}
