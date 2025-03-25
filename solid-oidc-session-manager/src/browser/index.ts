import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import type { Session } from "@inrupt/solid-client-authn-browser";
import type { GraffitiSolidOIDCSessionManagerOptions } from "../types";
import { GraffitiLocalSessionManager } from "@graffiti-garden/implementation-local/session-manager";
import { GraffitiModal } from "@graffiti-garden/modal";

const SOLID_CLIENT_STORAGE_PREFIX = "solidClient";

export type { GraffitiSolidOIDCSessionManagerOptions } from "../types";

export class GraffitiSolidOIDCSessionManager
  implements Pick<Graffiti, "login" | "logout" | "sessionEvents">
{
  protected modal: GraffitiModal;
  protected sessionManagerLocal = new GraffitiLocalSessionManager();
  sessionEvents: EventTarget;

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

    this.modal = new GraffitiModal({
      useTemplateHTML: () =>
        import("./dialog.html").then(({ default: dialogHTML }) => dialogHTML),
      onManualClose: () => {
        const event: GraffitiLoginEvent = new CustomEvent("login", {
          detail: { error: new Error("User cancelled login") },
        });
        this.sessionEvents.dispatchEvent(event);
      },
    });
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
    this.modal.open();
  };

  logout: Graffiti["logout"] = async (session) => {
    if (session.actor.startsWith("http") && "fetch" in session) {
      return await (await this.useSolidSession()).logout();
    } else {
      return this.sessionManagerLocal.logout(session);
    }
  };

  protected cancelLogin() {
    this.modal.close();
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

  protected addLocalLoginButton(content: HTMLElement) {
    const localLoginButtons = content.querySelectorAll(
      "#graffiti-login-local-button",
    );
    localLoginButtons.forEach((localLoginButton) => {
      localLoginButton.addEventListener("click", (evt) => {
        evt.preventDefault();
        this.onLocalLogin();
      });
    });
  }

  protected addSolidLoginButton(content: HTMLElement) {
    const solidLoginButtons = content.querySelectorAll(
      "#graffiti-login-solid-button",
    );
    solidLoginButtons.forEach((solidLoginButton) => {
      solidLoginButton.addEventListener("click", (evt) => {
        evt.preventDefault();
        this.onSolidLogin();
      });
    });
  }

  protected async onWelcome() {
    const content = await this.modal.displayTemplate("graffiti-login-welcome");
    this.addLocalLoginButton(content);
    this.addSolidLoginButton(content);
  }

  protected async onLocalLogin(proposedActor?: string) {
    const content = await this.modal.displayTemplate("graffiti-login-local");
    this.addSolidLoginButton(content);

    const form = content.querySelector(
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
      this.modal.close();
    });

    const input = content.querySelector(
      "#graffiti-login-local-actor",
    ) as HTMLInputElement;
    input.addEventListener("focus", () => input.select());
    input.value = proposedActor ?? "test-user";
    input.focus();
  }

  protected async onSolidLogin() {
    const content = await this.modal.displayTemplate("graffiti-login-solid");
    this.addLocalLoginButton(content);

    const form = content.querySelector(
      "#graffiti-login-solid-form",
    ) as HTMLFormElement;
    const text = form.querySelector("input[type=text]") as HTMLInputElement;
    text.addEventListener("focus", () => text.select());
    text.focus();
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
        // Strip out the hash from the URL
        const redirectUrl = new URL(window.location.href);
        redirectUrl.hash = "";
        await (
          await this.useSolidSession()
        ).login({
          oidcIssuer,
          redirectUrl: redirectUrl.toString(),
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

    const input = content.querySelector(
      "#graffiti-login-solid-issuer",
    ) as HTMLInputElement;
    input.focus();
  }
}
