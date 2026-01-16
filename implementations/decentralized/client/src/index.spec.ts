import type {
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
} from "@graffiti-garden/api";
import { DecentralizedIdentifiers } from "./1-services/1-dids";
import { Authorization } from "./1-services/2-authorization";
import { StorageBuckets } from "./1-services/3-storage-buckets";
import { Inboxes } from "./1-services/4-inboxes";
import { Sessions } from "./3-protocol/1-sessions";
import { afterAll, describe, test } from "vitest";
import { Handles } from "./3-protocol/2-handles";
import { didTests } from "./1-services/1-dids-tests";

describe("GraffitiDecentralized Tests", async () => {
  // Initialize structures for log in/out
  const dids = new DecentralizedIdentifiers();
  const sessions = new Sessions({
    dids,
    authorization: new Authorization(),
    inboxes: new Inboxes(),
    storageBuckets: new StorageBuckets(),
  });
  const handles = new Handles({ dids });

  // Login
  const session1 = await login("localhost%3A5173:app:handles:handle:test1");
  // const session2 = await login("localhost:5173/app/handles/handle/test2");

  // Logout on cleanup
  afterAll(async () => {
    await logout(session1.actor);
    // await logout(session2.actor);
  });

  // Run the tests
  didTests();

  // How to log in/out vvv
  async function login(handle: string) {
    const actor = await handles.handleToActor(handle);

    return await new Promise<GraffitiSession>((resolve, reject) => {
      const listener = (e: unknown) => {
        if (!(e instanceof CustomEvent)) return;
        const detail = e.detail as GraffitiLoginEvent["detail"];
        if (detail.error) {
          reject(detail.error);
        } else {
          resolve(detail.session);
        }
      };
      sessions.sessionEvents.addEventListener("login", listener);

      setTimeout(
        () => {
          sessions.sessionEvents.removeEventListener("login", listener);
          reject(new Error("Authorization timed out"));
        },
        5 * 60 * 1000,
      ); // 5 minutes timeout

      sessions.login(actor);
    });
  }

  async function logout(actor: string) {
    return await new Promise<void>((resolve, reject) => {
      const listener = (e: unknown) => {
        if (!(e instanceof CustomEvent)) return;
        const detail = e.detail as GraffitiLogoutEvent["detail"];

        if (detail.error) {
          reject(detail.error);
        } else {
          resolve();
        }
      };
      sessions.sessionEvents.addEventListener("logout", listener);

      setTimeout(
        () => {
          sessions.sessionEvents.removeEventListener("logout", listener);
          reject(new Error("Logout timed out"));
        },
        5 * 60 * 1000,
      ); // 5 minutes timeout

      sessions.logout(actor);
    });
  }
});
