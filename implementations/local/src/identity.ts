import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { decodeBase64, encodeBase64 } from "./utilities";

const DID_LOCAL_PREFIX = "did:local:";
const PENDING_LOGIN_KEY = "graffiti-local-pending-login";

/**
 * A class that implements the login methods
 * of the [Graffiti API]() for use in the browser.
 * It is completely insecure and should only be used
 * for testing and demonstrations.
 *
 * It uses `localStorage` to store login state and a simple
 * dialog rather than an oauth flow for log in.
 * It can be used in node.js but will not persist
 * login state and a proposed username must be provided.
 */
export class GraffitiLocalIdentity {
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
      // Correlate the explicit login across its reload, then forget the request ID.
      let pending: { handle: string; requestId: string } | undefined;
      if (typeof window !== "undefined") {
        const saved = window.sessionStorage.getItem(PENDING_LOGIN_KEY);
        window.sessionStorage.removeItem(PENDING_LOGIN_KEY);
        if (saved) {
          try {
            const value: unknown = JSON.parse(saved);
            if (value && typeof value === "object" &&
                "handle" in value && typeof value.handle === "string" &&
                "requestId" in value && typeof value.requestId === "string") {
              pending = { handle: value.handle, requestId: value.requestId };
            }
          } catch { /* Ignore an invalid pending login. */ }
        }
      }

      // Allow listeners to be added first
      await Promise.resolve();

      // Restore previous sessions
      const handles = this.getLoggedInHandles();
      for (const handle of handles) {
        const event: GraffitiLoginEvent = new CustomEvent("login", {
          detail: {
            session: { actor: await this.handleToActor(handle) },
            ...(pending?.handle === handle ? { requestId: pending.requestId } : {}),
          },
        });
        this.sessionEvents.dispatchEvent(event);
      }

      if (pending && !handles.includes(pending.handle)) {
        this.sessionEvents.dispatchEvent(new CustomEvent("login", {
          detail: { error: new Error("Login session is no longer active"), requestId: pending.requestId },
        }));
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
      window.localStorage.setItem("graffiti-handles", handles.map(encodeURIComponent).join(","));
    } else {
      this.loggedInHandles = handles;
    }
  }

  private loggingIn = false;

  login: Graffiti["login"] = async (options) => {
    if (this.loggingIn) {
      this.sessionEvents.dispatchEvent(new CustomEvent("login", {
        detail: { error: new Error("A login is already in progress"), requestId: options?.requestId },
      }));
      return;
    }
    this.loggingIn = true;
    let detail: GraffitiLoginEvent["detail"] | undefined;
    try {
      detail = await this.login_(options);
    } catch (error) {
      detail = { error: error instanceof Error ? error : new Error(String(error)) };
    } finally {
      this.loggingIn = false;
    }
    if (detail) this.sessionEvents.dispatchEvent(new CustomEvent("login", {
      detail: { ...detail, requestId: options?.requestId },
    }));
  };

  private async login_(options: Parameters<Graffiti["login"]>[0]) {
    // Wait a tick for the browser to update the UI
    await new Promise((resolve) => setTimeout(resolve, 0));

    let handle = options?.actor ? await this.actorToHandle(options.actor) : undefined;

    if (typeof window !== "undefined") {
      const dialog = document.createElement("dialog");
      dialog.innerHTML = `<form method="dialog"><label>Username <input required></label> <button value="login">Log in</button> <button value="cancel" formnovalidate>Cancel</button></form>`;
      const input = dialog.querySelector("input")!;
      input.value = handle ?? "";
      document.body.append(dialog);
      handle = await new Promise<string | undefined>((resolve) => {
        dialog.addEventListener("close", () => {
          const chosen = dialog.returnValue === "login" ? input.value.trim() : "";
          dialog.remove();
          resolve(chosen || undefined);
        }, { once: true });
        dialog.showModal();
        input.focus();
      });
    }

    if (!handle) throw new Error("No handle provided to login");

    const existingHandles = this.getLoggedInHandles();
    if (!existingHandles.includes(handle)) {
      this.setLoggedInHandles([...existingHandles, handle]);
    }
    if (typeof window === "undefined") {
      return { session: { actor: await this.handleToActor(handle) } };
    }
    // Otherwise store the login for after refresh, then refresh
    window.sessionStorage.removeItem(PENDING_LOGIN_KEY);
    if (options?.requestId !== undefined) {
      window.sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify({
        handle, requestId: options.requestId,
      }));
    }
    // Refresh the page to simulate oauth
    window.location.reload();
  }

  logout: Graffiti["logout"] = async (session, options) => {
    let detail: GraffitiLogoutEvent["detail"] = {
      actor: session.actor,
      requestId: options?.requestId,
    };
    try {
      const handle = await this.actorToHandle(session.actor);
      const existingHandles = this.getLoggedInHandles();
      if (!existingHandles.includes(handle)) throw new Error("Not logged in with that actor");
      this.setLoggedInHandles(existingHandles.filter((h) => h !== handle));
    } catch (error) {
      detail = { ...detail, error: error instanceof Error ? error : new Error(String(error)) };
    }
    this.sessionEvents.dispatchEvent(new CustomEvent("logout", { detail }));
  };
}
