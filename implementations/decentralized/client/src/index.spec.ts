import type {
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
} from "@graffiti-garden/api";
import {
  graffitiCRUDTests,
  graffitiDiscoverTests,
  graffitiMediaTests,
} from "@graffiti-garden/api/tests";
import { DecentralizedIdentifiers } from "./1-services/2-dids";
import { Authorization } from "./1-services/1-authorization";
import { StorageBuckets } from "./1-services/3-storage-buckets";
import { Inboxes } from "./1-services/4-inboxes";
import { Sessions } from "./3-protocol/1-sessions";
import { afterAll, describe } from "vitest";
import { Handles } from "./3-protocol/2-handles";
import { didTests } from "./1-services/2-dids-tests";
import { storageBucketTests } from "./1-services/3-storage-buckets-tests";
import { inboxTests } from "./1-services/4-inboxes-tests";
import { stringEncodingTests } from "./2-primitives/1-string-encoding-tests";
import { contentAddressesTests } from "./2-primitives/2-content-addresses-tests";
import { channelAttestationTests } from "./2-primitives/3-channel-attestations-tests";
import { allowedAttestationTests } from "./2-primitives/4-allowed-attestations-tests";
import { handleTests } from "./3-protocol/2-handles-tests";
import { objectEncodingTests } from "./3-protocol/3-object-encoding-tests";
import { GraffitiDecentralized } from "./3-protocol/4-graffiti";

describe("GraffitiDecentralized Tests", async () => {
  // Initialize structures for log in/out
  const dids = new DecentralizedIdentifiers();
  const sessionMethods = new Sessions({
    dids,
    authorization: new Authorization(),
    inboxes: new Inboxes(),
    storageBuckets: new StorageBuckets(),
  });
  const handleMethods = new Handles({ dids });

  // Login
  const handles = [
    "localhost%3A5173:app:handles:handle:test1",
    "localhost%3A5173:app:handles:handle:test2",
  ];
  let sessions: GraffitiSession[] = [];
  for (const handle of handles) {
    sessions.push(await login(handle));
  }
  const resolvedSessions = sessions.map((s) => {
    const resolved = sessionMethods.resolveSession(s);
    if (!resolved) throw new Error("Error logging in");
    return resolved;
  });
  // Logout on cleanup
  afterAll(async () => {
    for (const session of sessions) {
      await logout(session.actor);
    }
  });

  // Service tests
  didTests();
  storageBucketTests(
    resolvedSessions[0].storageBucket.serviceEndpoint,
    resolvedSessions[0].storageBucket.token,
  );
  inboxTests(
    resolvedSessions[0].personalInbox.serviceEndpoint,
    resolvedSessions[0].personalInbox.token,
  );

  // Primitive tests
  stringEncodingTests();
  contentAddressesTests();
  channelAttestationTests();
  allowedAttestationTests();

  // Protocol tests
  handleTests(handles[0]);
  objectEncodingTests();

  const useGraffiti = () => {
    return new GraffitiDecentralized(
      {
        defaultInboxEndpoints: ["https://localhost:5173/i/shared"],
      },
    );
  };
  graffitiCRUDTests(
    useGraffiti,
    () => sessions[0],
    () => sessions[1],
  );
  graffitiMediaTests(
    useGraffiti,
    () => sessions[0],
    () => sessions[1],
  );
  graffitiDiscoverTests(
    useGraffiti,
    () => sessions[0],
    () => sessions[1],
  );

  // How to log in/out vvv
  async function login(handle: string) {
    const actor = await handleMethods.handleToActor(handle);

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
      sessionMethods.sessionEvents.addEventListener("login", listener);

      setTimeout(
        () => {
          sessionMethods.sessionEvents.removeEventListener("login", listener);
          reject(new Error("Authorization timed out"));
        },
        5 * 60 * 1000,
      ); // 5 minutes timeout

      sessionMethods.login(actor);
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
      sessionMethods.sessionEvents.addEventListener("logout", listener);

      setTimeout(
        () => {
          sessionMethods.sessionEvents.removeEventListener("logout", listener);
          reject(new Error("Logout timed out"));
        },
        5 * 60 * 1000,
      ); // 5 minutes timeout

      sessionMethods.logout(actor);
    });
  }
});
