import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { decodeBase64, encodeBase64 } from "./utilities";

const DID_LOCAL_PREFIX = "did:local:";

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

  handleToActor: Graffiti["handleToActor"] = async (handle: string) => {
    const bytes = new TextEncoder().encode(handle);
    const base64 = encodeBase64(bytes);
    return `${DID_LOCAL_PREFIX}${base64}`;
  };

  actorToHandle: Graffiti["actorToHandle"] = async (actor: string) => {
    if (!actor.startsWith(DID_LOCAL_PREFIX)) {
      throw new Error(`actor must start with ${DID_LOCAL_PREFIX}`);
    }
    const base64 = actor.slice(DID_LOCAL_PREFIX.length);
    const bytes = decodeBase64(base64);
    return new TextDecoder().decode(bytes);
  };

  constructor() {
    // Look for any existing sessions
    const sessionRestorer = async () => {
      // Allow listeners to be added first
      await Promise.resolve();

      // Restore previous sessions
      for (const handle of this.getLoggedInHandles()) {
        const event: GraffitiLoginEvent = new CustomEvent("login", {
          detail: { session: { actor: await this.handleToActor(handle) } },
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

  loggedInHandles: string[] = [];

  protected getLoggedInHandles(): string[] {
    if (typeof window !== "undefined") {
      const handlesString = window.localStorage.getItem("graffiti-handles");
      return handlesString
        ? handlesString.split(",").map(decodeURIComponent)
        : [];
    } else {
      return this.loggedInHandles;
    }
  }

  protected setLoggedInHandles(handles: string[]) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("graffiti-handles", handles.join(","));
    } else {
      this.loggedInHandles = handles;
    }
  }

  login: Graffiti["login"] = async (actor) => {
    // Wait a tick for the browser to update the UI
    await new Promise((resolve) => setTimeout(resolve, 0));

    let handle = actor ? await this.actorToHandle(actor) : undefined;

    if (typeof window !== "undefined") {
      const response = window.prompt("Choose a username to log in.", handle);
      handle = response ?? undefined;
    }

    if (!handle) {
      const detail: GraffitiLoginEvent["detail"] = {
        error: new Error("No handle provided to login"),
      };
      const event: GraffitiLoginEvent = new CustomEvent("login", { detail });
      this.sessionEvents.dispatchEvent(event);
    } else {
      const existingHandles = this.getLoggedInHandles();
      if (!existingHandles.includes(handle)) {
        this.setLoggedInHandles([...existingHandles, handle]);
      }
      // Refresh the page to simulate oauth
      window.location.reload();
    }
  };

  logout: Graffiti["logout"] = async (session) => {
    const handle = await this.actorToHandle(session.actor);
    const existingHandles = this.getLoggedInHandles();
    const exists = existingHandles.includes(handle);
    if (exists) {
      this.setLoggedInHandles(existingHandles.filter((h) => h !== handle));
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
