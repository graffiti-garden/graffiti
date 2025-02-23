import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import type { Session } from "@inrupt/solid-client-authn-browser";
import type { GraffitiSolidOIDCSessionManagerOptions } from "../types";
import { GraffitiLocalSessionManager } from "@graffiti-garden/implementation-local/session-manager";

const SOLID_CLIENT_STORAGE_PREFIX = "solidClient";

export type { GraffitiSolidOIDCSessionManagerOptions } from "../types";

export class GraffitiSolidOIDCSessionManager
  implements Pick<Graffiti, "login" | "logout" | "sessionEvents">
{
  protected sessionManagerLocal = new GraffitiLocalSessionManager();
  sessionEvents: EventTarget;

  protected dialog = document.createElement("dialog");
  protected shadow: ShadowRoot;
  protected main_: Promise<HTMLElement> | undefined;
  protected solidSession: Promise<Session> | undefined;
  protected options: GraffitiSolidOIDCSessionManagerOptions | undefined;

  protected useSolidSession() {
    if (!this.solidSession) {
      this.solidSession = (async () => {
        const { getDefaultSession } = await import(
          "@inrupt/solid-client-authn-browser"
        );
        const session = getDefaultSession();

        session.events.on("login", () => this.onSolidLoginEvent());
        session.events.on("logout", () => this.onSolidLogoutEvent());
        session.events.on("error", (error) => {
          this.onSolidLoginEvent(error ? new Error(error) : undefined);
        });
        let restoreHref: string | undefined = undefined;
        session.events.on("sessionRestore", (href) => {
          this.onSolidLoginEvent();
          restoreHref = href;
        });
        session
          .handleIncomingRedirect({
            restorePreviousSession:
              this.options?.restorePreviousSession ?? true,
          })
          .then(() => {
            const event: GraffitiSessionInitializedEvent = new CustomEvent(
              "initialized",
              {
                detail: { href: restoreHref },
              },
            );
            this.sessionEvents.dispatchEvent(event);
          });
        return session;
      })();
    }
    return this.solidSession;
  }

  constructor(options?: GraffitiSolidOIDCSessionManagerOptions) {
    this.options = options;
    this.sessionEvents = options?.sessionEvents ?? new EventTarget();

    // Check for local storage starting with
    // the solid prefix
    // to trigger the import (it's big)
    let loadingSolid = false;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(SOLID_CLIENT_STORAGE_PREFIX)) {
        this.useSolidSession();
        loadingSolid = true;
        break;
      }
    }
    if (!loadingSolid) {
      // Dispatch as a promise to
      // allow event listeners to be added
      Promise.resolve().then(() => {
        this.sessionEvents.dispatchEvent(new CustomEvent("initialized"));
      });
    }

    // Forward local login/logout events (but not initialization)
    for (const event of ["login", "logout"] as const) {
      this.sessionManagerLocal.sessionEvents.addEventListener(event, (evt) => {
        if (!("detail" in evt)) return;
        this.sessionEvents.dispatchEvent(
          new CustomEvent(event, {
            detail: evt.detail,
          }),
        );
      });
    }

    this.dialog.className = "graffiti-login";
    this.dialog.innerHTML = "Loading...";

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

    const host = document.createElement("div");
    host.id = "graffiti-login-host";

    this.shadow = host.attachShadow({ mode: "closed" });
    this.shadow.appendChild(this.dialog);

    document.body.append(host);
  }

  protected get main() {
    if (!this.main_) {
      this.main_ = Promise.all([
        import("./dialog.html"),
        import("./style.css"),
        import("./graffiti.webp"),
        import("./rock-salt.woff2"),
      ]).then(
        ([
          { default: dialogHTML },
          { default: style },
          { default: image },
          { default: font },
        ]) => {
          this.dialog.innerHTML = dialogHTML;

          const closeBtn = this.dialog.querySelector("#graffiti-login-close");
          closeBtn?.addEventListener("click", () => this.cancelLogin());

          const main = this.dialog.querySelector(
            "#graffiti-login-main",
          ) as HTMLElement;

          style = style.replace("url(graffiti.jpg)", `url(${image})`);
          style = style.replace("url(rock-salt.woff2)", `url(${font})`);

          const sheet = new CSSStyleSheet();
          sheet.replace(style).then(() => {
            this.shadow.adoptedStyleSheets = [sheet];
          });

          return main;
        },
      );
    }
    return this.main_;
  }

  login: Graffiti["login"] = async (proposal) => {
    if (proposal?.actor) {
      if (proposal.actor.startsWith("http")) {
        await this.onSolidLogin();
      } else {
        await this.onLocalLogin(proposal.actor);
      }
    } else {
      await this.onWelcome();
    }
    this.open();
  };

  logout: Graffiti["logout"] = async (session) => {
    if (session.actor.startsWith("http") && "fetch" in session) {
      return await (await this.useSolidSession()).logout();
    } else {
      return this.sessionManagerLocal.logout(session);
    }
  };

  protected cancelLogin() {
    const event: GraffitiLoginEvent = new CustomEvent("login", {
      detail: { error: new Error("User cancelled login") },
    });
    this.sessionEvents.dispatchEvent(event);
    this.close();
  }

  protected async onSolidLoginEvent(error?: Error) {
    let detail: GraffitiLoginEvent["detail"] & {
      session?: {
        fetch: typeof fetch;
      };
    };
    const session = await this.useSolidSession();
    if (!error && session.info.isLoggedIn && session.info.webId) {
      detail = {
        session: {
          actor: session.info.webId,
          fetch: session.fetch,
        },
      };
    } else {
      detail = {
        error: error ?? new Error("Login with solid failed"),
      };
    }
    const event: GraffitiLoginEvent = new CustomEvent("login", { detail });
    this.sessionEvents.dispatchEvent(event);
  }

  protected async onSolidLogoutEvent() {
    let detail: GraffitiLogoutEvent["detail"];
    const session = await this.useSolidSession();
    if (session.info.webId) {
      detail = { actor: session.info.webId };
    } else {
      detail = {
        error: new Error("Logged out, but no actor given"),
      };
    }
    const event: GraffitiLogoutEvent = new CustomEvent("logout", { detail });
    this.sessionEvents.dispatchEvent(event);
  }

  protected open() {
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

  protected async onLocalLogin(proposedActor?: string) {
    await this.displayTemplate("graffiti-login-local");
    this.addSolidLoginButton();

    const form = this.dialog.querySelector(
      "#graffiti-login-local-form",
    ) as HTMLFormElement;
    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      const formData = new FormData(form);
      const actor = formData.get("actor") as string;
      if (!actor) return;
      if (actor.startsWith("http")) {
        alert(
          "Local usernames cannot start with 'http' so they don't conflict with Solid WebIDs.",
        );
        return;
      }

      this.sessionManagerLocal.login({ actor });
      this.close();
    });

    const input = this.dialog.querySelector(
      "#graffiti-login-local-actor",
    ) as HTMLInputElement;
    input.focus();
    input.value = proposedActor ?? "";
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
        await (
          await this.useSolidSession()
        ).login({
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
        submitButton.value = "Login";
        submitButton.disabled = false;
      }
    });

    const input = this.dialog.querySelector(
      "#graffiti-login-solid-issuer",
    ) as HTMLInputElement;
    input.focus();
  }
}
