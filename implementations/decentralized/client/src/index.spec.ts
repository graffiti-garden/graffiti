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
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { decode as dagCborDecode, encode as dagCborEncode } from "@ipld/dag-cbor";
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
import {
  DecentralizedTestEnvironment,
  decentralizedSharedInbox,
  decentralizedTestUsers,
} from "../test/environment";

describe("GraffitiDecentralized Tests", () => {
  const environment = new DecentralizedTestEnvironment();
  const handles = decentralizedTestUsers.map((user) => user.handle);
  let sessions: GraffitiSession[] = [];
  let sessionMethods: Sessions;
  let handleMethods: Handles;

  beforeAll(async () => {
    await environment.start();

    const dids = new DecentralizedIdentifiers();
    sessionMethods = new Sessions({
      dids,
      authorization: new Authorization(),
      inboxes: new Inboxes(),
      storageBuckets: new StorageBuckets(),
    });
    handleMethods = new Handles({ dids });

    for (const handle of handles) {
      sessions.push(await login(handle));
    }
  });

  afterAll(async () => {
    try {
      for (const session of sessions) {
        await logout(session.actor);
      }
    } finally {
      await environment.stop();
    }
  });

  // Service tests
  didTests();
  storageBucketTests(
    decentralizedTestUsers[0].bucketEndpoint,
    decentralizedTestUsers[0].token,
  );
  inboxTests(
    decentralizedTestUsers[0].inboxEndpoint,
    decentralizedTestUsers[0].token,
  );

  // Primitive tests
  stringEncodingTests();
  contentAddressesTests();
  channelAttestationTests();
  allowedAttestationTests();

  // Protocol tests
  handleTests(handles[0]);
  objectEncodingTests();

  const useGraffiti = () =>
    new GraffitiDecentralized({
      defaultInboxEndpoints: [decentralizedSharedInbox],
    });
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

  test("deleting a bucket removes its values and rejects requests to its old URL", async () => {
    const account = decentralizedTestUsers[0];
    const smallKey = crypto.randomUUID();
    const largeKey = crypto.randomUUID();
    const largeValue = new Uint8Array(32 * 1024 + 1).fill(7);
    const authorization = { Authorization: `Bearer ${account.token}` };

    for (const [key, value] of [
      [smallKey, new Uint8Array([1, 2, 3])],
      [largeKey, largeValue],
    ] as const) {
      const response = await fetch(`${account.bucketEndpoint}/value/${key}`, {
        method: "PUT",
        headers: authorization,
        body: value,
      });
      expect(response.status).toBe(201);
    }

    const r2Key = `${account.bucketId}/${largeKey}`;
    expect(await environment.storedR2ObjectExists(r2Key)).toBe(true);

    const deletion = await fetch(
      `https://localhost:5173/app/service-instances/bucket/service/${account.bucketId}`,
      {
        method: "DELETE",
        headers: {
          Cookie: `account_${account.accountId}=${account.token}`,
          "X-Graffiti-Account": String(account.accountId),
        },
      },
    );
    expect(deletion.status).toBe(200);

    expect(await environment.storedR2ObjectExists(r2Key)).toBe(false);
    for (const key of [smallKey, largeKey]) {
      const response = await fetch(`${account.bucketEndpoint}/value/${key}`);
      expect(response.status).toBe(404);
    }
    const batch = await fetch(`${account.bucketEndpoint}/values`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: dagCborEncode({ keys: [smallKey, largeKey], maxValueBytes: largeValue.length }).slice(),
    });
    expect((dagCborDecode(await batch.arrayBuffer()) as { results: { status: number }[] }).results)
      .toEqual([{ status: 404 }, { status: 404 }]);

    const putAfterDeletion = await fetch(`${account.bucketEndpoint}/value/${smallKey}`, {
      method: "PUT",
      headers: authorization,
      body: new Uint8Array([4]),
    });
    expect(putAfterDeletion.status).toBe(404);
  });

  // How to log in/out vvv
  async function login(handle: string) {
    const actor = await handleMethods.handleToActor(handle);

    return await new Promise<GraffitiSession>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timeout);
        sessionMethods.sessionEvents.removeEventListener("login", listener);
      };
      const listener = (e: unknown) => {
        if (!(e instanceof CustomEvent)) return;
        const detail = e.detail as GraffitiLoginEvent["detail"];
        if (detail.session?.actor !== actor) return;
        cleanup();
        if (detail.error) {
          reject(detail.error);
        } else {
          resolve(detail.session);
        }
      };
      sessionMethods.sessionEvents.addEventListener("login", listener);

      timeout = setTimeout(
        () => {
          cleanup();
          reject(new Error("Authorization timed out"));
        },
        30 * 1000,
      );

      void sessionMethods.login(actor);
    });
  }

  async function logout(actor: string) {
    return await new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timeout);
        sessionMethods.sessionEvents.removeEventListener("logout", listener);
      };
      const listener = (e: unknown) => {
        if (!(e instanceof CustomEvent)) return;
        const detail = e.detail as GraffitiLogoutEvent["detail"];
        if (detail.actor !== actor) return;
        cleanup();

        if (detail.error) {
          reject(detail.error);
        } else {
          resolve();
        }
      };
      sessionMethods.sessionEvents.addEventListener("logout", listener);

      timeout = setTimeout(
        () => {
          cleanup();
          reject(new Error("Logout timed out"));
        },
        30 * 1000,
      );

      void sessionMethods.logout(actor);
    });
  }
});
