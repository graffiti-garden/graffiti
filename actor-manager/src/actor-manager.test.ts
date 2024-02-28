import { describe, expect, it, vi, assert } from "vitest";
import ActorManager, {
  base64Encode,
  base64Decode,
  actorURIEncode,
  actorURIDecode,
} from "./actor-manager";
import { randomBytes } from "@noble/hashes/utils";
import type { ActorAnnouncement } from "./actor-manager";
import { ed25519 as curve } from "@noble/curves/ed25519";
import { cookieStore } from "cookie-store";

async function clearCookies() {
  await Promise.all(
    (await cookieStore.getAll()).map(
      async (cookie) => await cookieStore.delete(cookie.name),
    ),
  );
}

describe("Actor Manager", () => {
  it("base 64 encode decode", () => {
    for (const numBytes of [0, 1, 10, 32, 128]) {
      const bytes = randomBytes(numBytes);

      const encoding = base64Encode(bytes);
      const decoding = base64Decode(encoding);

      expect(bytes.length).toEqual(decoding.length);
      for (const [i, byte] of Object.entries(bytes)) {
        expect(byte).toEqual(decoding[i]);
      }
    }
  });

  it("actor uri encode decode", () => {
    const bytes = randomBytes(32);
    const encoding = actorURIEncode(bytes);
    const decoding = actorURIDecode(encoding);
    expect(bytes.length).toEqual(decoding.length);
    for (const [i, byte] of Object.entries(bytes)) {
      expect(byte).toEqual(decoding[i]);
    }
  });

  it("create and delete account", async () => {
    const am = new ActorManager();
    const nickname = crypto.randomUUID();
    const actorURI = await am.createActor(nickname);

    const actor = await am.getActor(actorURI);
    expect(actor.nickname).toEqual(nickname);
    expect(actor.rootSecretBase64).toBeDefined();

    // Delete, with confirmation
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await am.deleteActor(actorURI);
    await expect(am.getActor(actorURI)).rejects.toEqual(
      `Actor with ID "${actorURI}" does not exist`,
    );
  });

  it("delete without confirmation", async () => {
    const am = new ActorManager();
    const nickname = crypto.randomUUID();
    const actorURI = await am.createActor(nickname);

    vi.spyOn(window, "confirm").mockReturnValue(false);
    await expect(am.deleteActor(actorURI)).rejects.toContain(
      "User interaction denied",
    );

    const actor = await am.getActor(actorURI);
    expect(actor.nickname).toEqual(nickname);
  });

  it("non-existant account", async () => {
    const am = new ActorManager();
    const uri = crypto.randomUUID();
    await expect(am.getActor(uri)).rejects.toEqual(
      `Actor with ID "${uri}" does not exist`,
    );
  });

  it("rename", async () => {
    const am = new ActorManager();
    const nickname1 = crypto.randomUUID();
    const actorURI = await am.createActor(nickname1);
    const nickname2 = crypto.randomUUID();
    await am.renameActor(actorURI, nickname2);
    const actor = await am.getActor(actorURI);
    expect(actor.nickname).toEqual(nickname2);
  });

  it("access across instances with local storage", async () => {
    const am1 = new ActorManager();
    const nickname1 = crypto.randomUUID();
    const actorURI = await am1.createActor(nickname1);

    const am2 = new ActorManager();
    const actor = await am2.getActor(actorURI);
    expect(actor.nickname).toEqual(nickname1);

    const nickname2 = crypto.randomUUID();
    await am2.renameActor(actorURI, nickname2);
    await expect(am1.getActor(actorURI)).resolves.toHaveProperty(
      "nickname",
      nickname2,
    );

    // Delete from 2, cannot get in 1
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await am2.deleteActor(actorURI);
    await expect(am1.getActor(actorURI)).rejects.toEqual(
      `Actor with ID "${actorURI}" does not exist`,
    );
  });

  it("initial actor events", async () => {
    // Clear and generate a bunch of actors
    await clearCookies();
    const am1 = new ActorManager();
    const nicknames: Array<string> = [];
    for (let i = 0; i < 5; i++) {
      const nickname = crypto.randomUUID();
      nicknames.push(nickname);
      await am1.createActor(nickname);
    }

    const et = new EventTarget();
    const gotten = new Set<string>();
    const callback = (e: ActorAnnouncement) => {
      if (e.uri) gotten.add(e.uri);
    };
    et.addEventListener("update", callback as EventListener);
    const am2 = new ActorManager(et);
    await am2.tilInitialized();

    expect(gotten.size).toEqual(5);
    for (const got of gotten) {
      const actor = await am2.getActor(got);
      expect(nicknames).toContain(actor.nickname);
    }
  });

  it("update events", async () => {
    await clearCookies();

    const gotten: Array<string> = [];
    const callback = (e: ActorAnnouncement) => {
      if (e.uri) gotten.push(e.uri);
    };

    const et = new EventTarget();
    et.addEventListener("update", callback as EventListener);

    const am = new ActorManager(et);
    await am.tilInitialized();
    expect(gotten.length).toEqual(0);
    const uri = await am.createActor(crypto.randomUUID());
    expect(gotten.length).toEqual(1);
    expect(gotten[0]).toEqual(uri);

    // rename
    gotten.pop();
    expect(gotten.length).toEqual(0);
    const nickname = crypto.randomUUID();
    await am.renameActor(uri, nickname);
    expect(gotten.length).toEqual(1);
    expect(gotten[0]).toEqual(uri);
  });

  it("delete events", async () => {
    const gotten: Array<string> = [];
    const callback = (e: ActorAnnouncement) => {
      if (e.uri) gotten.push(e.uri);
    };

    const et = new EventTarget();
    et.addEventListener("delete", callback as EventListener);

    const am = new ActorManager(et);
    await am.tilInitialized();
    expect(gotten.length).toEqual(0);
    const uri = await am.createActor(crypto.randomUUID());
    expect(gotten.length).toEqual(0);
    await am.deleteActor(uri);
    expect(gotten.length).toEqual(1);
    expect(gotten[0]).toEqual(uri);

    // Delete again
    gotten.pop();
    expect(gotten.length).toEqual(0);
    await expect(am.deleteActor(uri)).rejects.toEqual(
      `Actor with ID "${uri}" does not exist`,
    );
    expect(gotten.length).toEqual(0);
  });

  it("generate one time public keys", async () => {
    const am = new ActorManager();
    const uri = await am.createActor(crypto.randomUUID());
    await am.chooseActor(uri);

    const nonce = randomBytes(24);

    const pk1 = await am.getPublicKey(nonce);
    const pk2 = await am.getPublicKey(nonce);

    // Make sure they're equal
    Object.entries(pk1).forEach(([i, v]) => {
      expect(pk2[i]).toEqual(v);
    });

    // Make sure a secret with a different nonce is different
    const pk3 = await am.getPublicKey(randomBytes(24));
    let equal = true;
    Object.entries(pk1).forEach(([i, v]) => {
      equal &&= pk3[i] == v;
    });
    assert(!equal);
  });

  it("one time signature same nonce", async () => {
    const am = new ActorManager();
    const uri = await am.createActor(crypto.randomUUID());
    await am.chooseActor(uri);

    // Works with the same nonce
    const nonce = randomBytes(24);
    const pk = await am.getPublicKey(nonce);
    const message = randomBytes(100);
    const sig = await am.sign(message, nonce);
    assert(curve.verify(sig, message, pk));
  });

  it("one time signature different nonce", async () => {
    const am = new ActorManager();
    const uri = await am.createActor(crypto.randomUUID());
    await am.chooseActor(uri);

    // Doesn't work with different nonces
    const nonce1 = randomBytes(24);
    const nonce2 = randomBytes(24);
    const pk = await am.getPublicKey(nonce1);
    const message = randomBytes(100);
    const sig = await am.sign(message, nonce2);
    assert(!curve.verify(sig, message, pk));
  });

  it("one time signature different users", async () => {
    const am = new ActorManager();
    const nonce = randomBytes(24);

    // Generate pk from one user
    const uri1 = await am.createActor(crypto.randomUUID());
    await am.chooseActor(uri1);
    const pk = await am.getPublicKey(nonce);

    // And sig from the other
    const uri2 = await am.createActor(crypto.randomUUID());
    await am.chooseActor(uri2);
    const message = randomBytes(100);
    const sig = await am.sign(message, nonce);

    assert(!curve.verify(sig, message, pk));
  });

  it("sign without nonce", async () => {
    const message = randomBytes(32);
    const am = new ActorManager();
    const uri = await am.createActor(crypto.randomUUID());
    await am.chooseActor(uri);
    const signature = await am.sign(message);

    const publicKey = base64Decode(uri.slice(6));
    // Signature verifies, random bytes do not
    assert(curve.verify(signature, message, publicKey));
    assert(
      !curve.verify(randomBytes(signature.byteLength), message, publicKey),
    );
  });

  it("get shared secret", async () => {
    const am1 = new ActorManager();
    const uri1 = await am1.createActor(crypto.randomUUID());
    await am1.chooseActor(uri1);
    const pk1 = actorURIDecode(uri1);

    const am2 = new ActorManager(new EventTarget(), "example.com");
    const uri2 = await am2.createActor(crypto.randomUUID());
    await am2.chooseActor(uri2);
    const pk2 = actorURIDecode(uri2);

    const secret1 = await am1.sharedSecret(pk2);
    const secret2 = await am2.sharedSecret(pk1);
    for (const [i, byte] of Object.entries(secret1)) {
      expect(byte).toEqual(secret2[i]);
    }
  });

  it("encrypt and decrypt private messages", async () => {
    const am1 = new ActorManager();
    const uri1 = await am1.createActor(crypto.randomUUID());
    await am1.chooseActor(uri1);
    const pk1 = actorURIDecode(uri1);

    const am2 = new ActorManager(new EventTarget(), "example.com");
    const uri2 = await am2.createActor(crypto.randomUUID());
    await am2.chooseActor(uri2);
    const pk2 = actorURIDecode(uri2);

    const message = randomBytes(100);
    const encrypted = await am1.encryptPrivateMessage(message, pk2);

    const decrypted1 = await am1.decryptPrivateMessage(encrypted, pk2);
    const decrypted2 = await am2.decryptPrivateMessage(encrypted, pk1);

    // Make sure they are both equal
    expect(base64Encode(message)).toEqual(base64Encode(decrypted1));
    expect(base64Encode(message)).toEqual(base64Encode(decrypted2));
  });

  it("encrypt and decrypt to self", async () => {
    const am = new ActorManager();
    const uri = await am.createActor(crypto.randomUUID());
    await am.chooseActor(uri);

    const message = randomBytes(100);
    const encrypted = await am.encryptPrivateMessage(message);
    const decrypted = await am.decryptPrivateMessage(encrypted);
    expect(base64Encode(message)).toEqual(base64Encode(decrypted));
    expect(base64Encode(message)).not.toEqual(base64Encode(encrypted));
  });

  it("Backchannel actor", async () => {
    await clearCookies();

    const ev = new EventTarget();
    const gotUpdates: Array<string> = [];
    const updateCallback = (e: ActorAnnouncement) => {
      if (e.uri) gotUpdates.push(e.uri);
    };
    const gotDeletes: Array<string> = [];
    const deleteCallback = (e: ActorAnnouncement) => {
      if (e.uri) gotDeletes.push(e.uri);
    };
    ev.addEventListener("update", updateCallback as EventListener);
    ev.addEventListener("delete", deleteCallback as EventListener);

    const am1 = new ActorManager();
    const am2 = new ActorManager(ev);

    expect(gotUpdates.length).toEqual(0);
    const uri1 = await am1.createActor(crypto.randomUUID());
    await new Promise<void>((r) => setTimeout(() => r(), 100));
    expect(gotUpdates.length).toEqual(1);
    expect(gotUpdates[0]).toEqual(uri1);

    expect(gotDeletes.length).toEqual(0);
    await am1.deleteActor(uri1);
    await new Promise<void>((r) => setTimeout(() => r(), 100));
    expect(gotDeletes.length).toEqual(1);
    expect(gotDeletes[0]).toEqual(uri1);
  });

  it("choose actor initial", async () => {
    const referrer = `crypto.randomUUID()}.com`;

    // Initially referrer chooses noone
    const got1: Array<any> = [];
    const ev1 = new EventTarget();
    ev1.addEventListener("choose", (e) => got1.push(e));
    const am1 = new ActorManager(ev1, referrer);
    await am1.tilInitialized();
    expect(got1.length).toEqual(1);
    expect(got1[0]).toHaveProperty("uri", null);

    const uri = await am1.createActor(crypto.randomUUID());
    expect(got1.length).toEqual(1);
    await am1.chooseActor(uri);
    expect(got1.length).toEqual(2);
    expect(got1[1].uri).toEqual(uri);

    // Create another manager with the same referrer
    const got2: Array<any> = [];
    const ev2 = new EventTarget();
    ev2.addEventListener("choose", (e) => got2.push(e));
    const am2 = new ActorManager(ev2, referrer);
    await am2.tilInitialized();
    // It sees the existing URI
    expect(got2.length).toEqual(1);
    expect(got2[0]).toHaveProperty("uri", uri);

    // unchoose
    await am2.unchooseActor();
    expect(got2.length).toEqual(2);
    expect(got2[1]).toHaveProperty("uri", null);
  });

  it("choose actor backchannel shared referrer", async () => {
    const referrer = `${crypto.randomUUID()}.com`;

    // Create a listener
    const got: Array<any> = [];
    const ev = new EventTarget();
    const am1 = new ActorManager(ev, referrer);
    await am1.tilInitialized();
    ev.addEventListener("choose", (e) => got.push(e));
    expect(got.length).toEqual(0);

    // Create another sender
    const am2 = new ActorManager(new EventTarget(), referrer);
    const uri = await am2.createActor(crypto.randomUUID());
    expect(got.length).toEqual(0);
    await am2.chooseActor(uri);
    expect(got.length).toEqual(0);
    await new Promise<void>((r) => setTimeout(() => r(), 100));
    expect(got.length).toEqual(1);
    expect(got[0]).toHaveProperty("uri", uri);
    await am2.unchooseActor();
    await new Promise<void>((r) => setTimeout(() => r(), 100));
    expect(got.length).toEqual(2);
    expect(got[1]).toHaveProperty("uri", null);
  });

  it("choose actor backchannel different referrer", async () => {
    const referrer1 = `${crypto.randomUUID()}.com`;
    const referrer2 = `${crypto.randomUUID()}.com`;

    // Set up a listener with referrer 1
    const got: Array<any> = [];
    const ev = new EventTarget();
    const am1 = new ActorManager(ev, referrer1);
    await am1.tilInitialized();
    ev.addEventListener("choose", (e) => got.push(e));
    expect(got.length).toEqual(0);

    // Any changes don't effect the listener
    const am2 = new ActorManager(new EventTarget(), referrer2);
    const uri = await am2.createActor(crypto.randomUUID());
    await am2.chooseActor(uri);
    await new Promise<void>((r) => setTimeout(() => r(), 100));
    expect(got.length).toEqual(0);
    await am2.unchooseActor();
    await new Promise<void>((r) => setTimeout(() => r(), 100));
    expect(got.length).toEqual(0);
  });

  it("deletes also unchooses", async () => {
    const referrer = `${crypto.randomUUID()}.com`;
    const got: Array<any> = [];
    const ev = new EventTarget();
    const am = new ActorManager(ev, referrer);
    await am.tilInitialized();
    ev.addEventListener("choose", (e) => got.push(e));
    const uri = await am.createActor(crypto.randomUUID());
    expect(got.length).toEqual(0);
    await am.chooseActor(uri);
    expect(got.length).toEqual(1);
    expect(got[0]).toHaveProperty("uri", uri);
    await am.deleteActor(uri);
    expect(got.length).toEqual(2);
    expect(got[1]).toHaveProperty("uri", null);
  });

  it("delete unchooses across referrers", async () => {
    const referrer1 = `${crypto.randomUUID()}.com`;
    const referrer2 = `${crypto.randomUUID()}.com`;

    const ev = new EventTarget();
    const am1 = new ActorManager(ev, referrer1);
    const uri = await am1.createActor(crypto.randomUUID());
    await am1.chooseActor(uri);

    const got: Array<any> = [];
    ev.addEventListener("choose", (e) => got.push(e));

    expect(got.length).toEqual(0);
    const am2 = new ActorManager(new EventTarget(), referrer2);
    await am2.deleteActor(uri);
    await new Promise<void>((r) => setTimeout(() => r(), 100));
    expect(got.length).toEqual(1);
    expect(got[0]).toHaveProperty("uri", null);
  });

  it("chosen deletion on initialization", async () => {
    const referrer1 = `${crypto.randomUUID()}.com`;
    const referrer2 = `${crypto.randomUUID()}.com`;

    // Create and choose at one referrer
    const am1 = new ActorManager(new EventTarget(), referrer1);
    const uri = await am1.createActor(crypto.randomUUID());
    await am1.chooseActor(uri);
    // Hack disable messages (because we can't fully delete it)
    am1.channel.onmessage = null;

    // Delete from another refferer
    const am2 = new ActorManager(new EventTarget(), referrer2);
    await am2.deleteActor(uri);

    // Make sure hack worked
    await new Promise<void>((r) => setTimeout(() => r(), 100));
    expect(await am1.getChosen()).toEqual(uri);

    // Create a new manager from the first referrer
    const am3 = new ActorManager(new EventTarget(), referrer1);
    await am3.tilInitialized();
    expect(await am3.getChosen()).toEqual(null);
  });
});
