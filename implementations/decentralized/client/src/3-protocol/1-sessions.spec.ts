import type {
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
} from "@graffiti-garden/api";
import { DecentralizedIdentifiers } from "../1-services/1-dids";
import { Authorization } from "../1-services/2-authorization";
import { StorageBuckets } from "../1-services/3-storage-buckets";
import { Inboxes } from "../1-services/4-inboxes";
import { Sessions } from "./1-sessions";
import { afterAll, describe, test } from "vitest";

const sessions = new Sessions({
  dids: new DecentralizedIdentifiers(),
  authorization: new Authorization(),
  inboxes: new Inboxes(),
  storageBuckets: new StorageBuckets(),
});

export async function testLogin(actor: string) {
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

export async function testLogout(actor: string) {
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

const actor = "did:plc:numtqzbw74lmrguyvpzq6uf5";

describe("Login/out", async () => {
  const session = await testLogin(actor);

  afterAll(async () => {
    await testLogout(session.actor);
  });

  test("Resolve session", () => console.log(sessions.resolveSession(session)));
});
