import {
  type Graffiti,
  type GraffitiLoginEvent,
  type GraffitiLogoutEvent,
} from "@graffiti-garden/api";

/**
 * A class that implements the login methods
 * of the [Graffiti API]() for use in the browser.
 * It is completely insecure and should only be used
 * for testing and demonstrations.
 *
 * It uses `localStorage` to store login state and
 * window prompts rather than an oauth flow for log in.
 * It can be used in node.js but will not persist
 * login state and a proposed username must be provided.
 */
export class GraffitiSessionManagerLocal {
  sessionEvents: Graffiti["sessionEvents"] = new EventTarget();

  constructor() {
    // Look for any existing sessions
    const sessionRestorer = async () => {
      // Allow listeners to be added first
      await Promise.resolve();

      if (typeof window === "undefined") return;
      const actor = window.localStorage.getItem("graffitiActor");
      if (actor) {
        const event: GraffitiLoginEvent = new CustomEvent("login", {
          detail: { session: { actor } },
        });
        this.sessionEvents.dispatchEvent(event);
      }
    };
    sessionRestorer();
  }

  login: Graffiti["login"] = async (proposal, state) => {
    let actor = proposal?.actor;
    if (!actor && typeof window !== "undefined") {
      const response = window.prompt(
        `This is an insecure implementation of the Graffiti API \
  for *demo purposes only*. Do not store any sensitive information \
  here.\
  \n\n\
  Simply choose a username to log in.`,
      );
      if (response) actor = response;
    }

    let detail: GraffitiLoginEvent["detail"];
    if (!actor) {
      detail = {
        state,
        error: new Error("No actor ID provided to login"),
      };
    } else {
      // try to store it in the database
      const session = { actor };

      if (typeof window !== "undefined") {
        window.localStorage.setItem("graffitiActor", actor);
      }

      detail = {
        state,
        session,
      };
    }

    const event: GraffitiLoginEvent = new CustomEvent("login", { detail });
    this.sessionEvents.dispatchEvent(event);
  };

  logout: Graffiti["logout"] = async (session, state) => {
    let exists = true;
    if (typeof window !== "undefined") {
      exists = !!window.localStorage.getItem("graffitiActor");
      if (exists) {
        window.localStorage.removeItem("graffitiActor");
      }
    }

    const detail: GraffitiLogoutEvent["detail"] = exists
      ? {
          state,
          actor: session.actor,
        }
      : {
          state,
          actor: session.actor,
          error: new Error("Not logged in with that actor"),
        };

    const event: GraffitiLogoutEvent = new CustomEvent("logout", { detail });
    this.sessionEvents.dispatchEvent(event);
  };
}
