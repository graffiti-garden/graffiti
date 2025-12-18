import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSessionInitializedEvent,
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
export class GraffitiLocalSessionManager {
  sessionEvents: Graffiti["sessionEvents"] = new EventTarget();

  constructor() {
    // Look for any existing sessions
    const sessionRestorer = async () => {
      // Allow listeners to be added first
      await Promise.resolve();

      // Restore previous sessions
      for (const actor of this.getLoggedInActors()) {
        const event: GraffitiLoginEvent = new CustomEvent("login", {
          detail: { session: { actor } },
        });
        this.sessionEvents.dispatchEvent(event);
      }

      const event: GraffitiSessionInitializedEvent = new CustomEvent(
        "initialized",
        { detail: {} },
      );
      this.sessionEvents.dispatchEvent(event);
    };
    sessionRestorer();
  }

  loggedInActors: string[] = [];

  protected getLoggedInActors(): string[] {
    if (typeof window !== "undefined") {
      const actorsString = window.localStorage.getItem("graffiti-actor");
      return actorsString
        ? actorsString.split(",").map(decodeURIComponent)
        : [];
    } else {
      return this.loggedInActors;
    }
  }

  protected setLoggedInActors(actors: string[]) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "graffiti-actor",
        actors.map(encodeURIComponent).join(","),
      );
    } else {
      this.loggedInActors = actors;
    }
  }

  login: Graffiti["login"] = async (actor) => {
    // Wait a tick for the browser to update the UI
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (typeof window !== "undefined") {
      const response = window.prompt("Choose a username to log in.", actor);
      actor = response ?? undefined;
    }

    if (!actor) {
      const detail: GraffitiLoginEvent["detail"] = {
        error: new Error("No username provided to login"),
      };
      const event: GraffitiLoginEvent = new CustomEvent("login", { detail });
      this.sessionEvents.dispatchEvent(event);
    } else {
      const existingActors = this.getLoggedInActors();
      if (!existingActors.includes(actor)) {
        this.setLoggedInActors([...existingActors, actor]);
      }
      // Refresh the page to simulate oauth
      window.location.reload();
    }
  };

  logout: Graffiti["logout"] = async (session) => {
    const existingActors = this.getLoggedInActors();
    const exists = existingActors.includes(session.actor);
    if (exists) {
      this.setLoggedInActors(
        existingActors.filter((actor) => actor !== session.actor),
      );
    }

    const detail: GraffitiLogoutEvent["detail"] = exists
      ? {
          actor: session.actor,
        }
      : {
          actor: session.actor,
          error: new Error("Not logged in with that actor"),
        };

    const event: GraffitiLogoutEvent = new CustomEvent("logout", { detail });
    this.sessionEvents.dispatchEvent(event);
  };
}
