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
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { decode as dagCborDecode, encode as dagCborEncode } from "@ipld/dag-cbor";
import { Handles } from "./3-protocol/2-handles";
import { authorizationTests } from "./1-services/1-authorization-tests";
import { didTests } from "./1-services/2-dids-tests";
import { storageBucketTests } from "./1-services/3-storage-buckets-tests";
import { inboxTests, inboxUnitTests } from "./1-services/4-inboxes-tests";
import { stringEncodingTests } from "./2-primitives/1-string-encoding-tests";
import { contentAddressesTests } from "./2-primitives/2-content-addresses-tests";
import { channelAttestationTests } from "./2-primitives/3-channel-attestations-tests";
import { allowedAttestationTests } from "./2-primitives/4-allowed-attestations-tests";
import { sessionTests } from "./3-protocol/1-sessions-tests";
import { handleTests } from "./3-protocol/2-handles-tests";
import { objectEncodingTests } from "./3-protocol/3-object-encoding-tests";
import { GraffitiDecentralized } from "./3-protocol/4-graffiti";
import {
  DecentralizedTestEnvironment,
  decentralizedSharedInbox,
  decentralizedTestUsers,
} from "../test/environment";

// Copy native ESM exports so each test can replace and restore them with spies.
vi.mock("openid-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("openid-client")>(),
}));

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
  test("accepts layered Graffiti URL addendums for object and media lookups and deletion", async () => {
    const graffiti = useGraffiti();
    const session = sessions[0];
    const object = await graffiti.post(
      { value: { text: "layered URL" }, channels: [session.actor] },
      session,
    );
    const objectUrl = `${object.url}#graffiti.guard.receipt=graffiti%3Areceipt?another.layer=one%3Ftwo`;
    expect((await graffiti.get({ url: objectUrl }, {}, session)).url).toBe(object.url);
    expect((await graffiti.delete(objectUrl, session)).url).toBe(object.url);

    const mediaUrl = await graffiti.postMedia(
      { data: new Blob(["media data"], { type: "text/plain" }), allowed: [] },
      session,
    );
    const layeredMediaUrl = `${mediaUrl}?other.layer=one#graffiti.guard.receipt=graffiti%3Areceipt?third.layer=two`;
    await expect((await graffiti.getMedia(layeredMediaUrl, {}, session)).data.text()).resolves.toBe("media data");
    await expect(graffiti.deleteMedia(layeredMediaUrl, session)).resolves.toBeUndefined();
  });

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

  test("OAuth codes require approval from the selected account", async () => {
    const account = decentralizedTestUsers[0];
    const redirectUri = "https://client.example/callback";
    const endpoint = "https://localhost:5173/app/oauth/authorize";
    const cookie = `account_${account.accountId}=${account.token}`;
    const headers = {
      Cookie: cookie,
      "X-Graffiti-Account": String(account.accountId),
      "Content-Type": "application/json",
      Origin: "https://localhost:5173",
    };
    const request = (scope: string[], requestHeaders: HeadersInit = headers) =>
      fetch(endpoint, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ redirect_uri: redirectUri, state: "test-state", scope }),
      });

    const navigation = await fetch(
      `${endpoint}?account=${account.accountId}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      { headers: { Cookie: cookie } },
    );
    expect(navigation.status).toBe(404);

    expect((await request([account.bucketEndpoint], { Cookie: cookie })).status).toBe(401);
    expect((await request([account.bucketEndpoint], {
      ...headers,
      Origin: "https://attacker.example",
    })).status).toBe(403);
    expect((await request([decentralizedTestUsers[1].bucketEndpoint])).status).toBe(403);

    const approval = await request([account.bucketEndpoint]);
    expect(approval.status).toBe(200);
    const { redirectUri: callback } = await approval.json() as { redirectUri: string };
    const code = new URL(callback).searchParams.get("code");
    expect(code).toBeTruthy();
    expect(new URL(callback).searchParams.get("state")).toBe("test-state");

    const exchange = await fetch("https://localhost:5173/app/oauth/token", {
      method: "POST",
      body: new URLSearchParams({ code: code!, redirect_uri: redirectUri }),
    });
    expect(exchange.status).toBe(200);
    expect((await exchange.json()).access_token).toBeTypeOf("string");
  });

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

  test("login state belongs to an explicit request, not restored sessions", async () => {
    const actor = sessions[1].actor;
    const restored = new Sessions({
      dids: new DecentralizedIdentifiers(),
      authorization: new Authorization(),
      inboxes: new Inboxes(),
      storageBuckets: new StorageBuckets(),
    });
    const restoredEvents: GraffitiLoginEvent["detail"][] = [];
    restored.sessionEvents.addEventListener("login", (event) => {
      restoredEvents.push((event as GraffitiLoginEvent).detail);
    });
    await new Promise<void>((resolve) =>
      restored.sessionEvents.addEventListener("initialized", () => resolve(), { once: true }));
    expect(restoredEvents.some((detail) => !detail.error && detail.session.actor === actor)).toBe(true);
    expect(restoredEvents.every((detail) => !("state" in detail))).toBe(true);

    const selected = new Promise<GraffitiLoginEvent["detail"]>((resolve) =>
      restored.sessionEvents.addEventListener("login", (event) =>
        resolve((event as GraffitiLoginEvent).detail), { once: true }));
    await restored.login(actor, restored.loginAttempts.begin("selected-account"));
    expect((await selected).state).toBe("selected-account");

    await logout(actor);
    const completed = new Promise<GraffitiLoginEvent["detail"]>((resolve) => {
      const listener = (event: Event) => {
        const detail = (event as GraffitiLoginEvent).detail;
        if (detail.session?.actor !== actor) return;
        sessionMethods.sessionEvents.removeEventListener("login", listener);
        resolve(detail);
      };
      sessionMethods.sessionEvents.addEventListener("login", listener);
    });
    sessions[1] = await login(handles[1], "fresh-authorization");
    expect((await completed).state).toBe("fresh-authorization");
  });

  // How to log in/out vvv
  async function login(handle: string, state?: string) {
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

      void sessionMethods.login(actor, sessionMethods.loginAttempts.begin(state));
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

authorizationTests();
inboxUnitTests();
sessionTests();
