import { describe, it, expect } from "vitest";
import BYOStorage from "./index";
import { concatBytes, randomBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import "dotenv/config";

const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
if (!accessToken) {
  throw "You haven't defined a dropbox access token! See the Readme for more information.";
}

function mockSignatures() {
  const publicKey = randomBytes(32);

  const sign = async (data: Uint8Array) => {
    const hash = sha256(data);
    return concatBytes(hash, publicKey);
  };

  const verify = async (
    signature: Uint8Array,
    data: Uint8Array,
    publicKey: Uint8Array,
  ) => {
    const hash = sha256(data);
    const expectedSignature = concatBytes(hash, publicKey);
    return expectedSignature.every((byte, i) => byte === signature[i]);
  };

  return { publicKey, sign, verify };
}

describe(`Main`, () => {
  it("mock signatures", async () => {
    const { publicKey, sign, verify } = mockSignatures();
    const data = randomBytes(100);
    const signature = await sign(data);
    expect(await verify(signature, data, publicKey)).toBe(true);
  });

  it("mock signatures invalid", async () => {
    const { sign, verify } = mockSignatures();
    const data = randomBytes(100);
    const signature = await sign(data);
    const { publicKey: publicKey2 } = mockSignatures();
    expect(await verify(signature, data, publicKey2)).toBe(false);
  });

  it("post and receive data", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });

    // Generate a random channel string
    const channel = Math.random().toString(36).substring(7);

    // Generate random data to post
    const data = randomBytes(100);

    // Post the data
    const { publicKey, sign } = mockSignatures();
    const { sharedLink, uuid } = await byos.post(
      channel,
      data,
      publicKey,
      sign,
    );

    // Get the data back
    const iterator = byos.watch(channel, sharedLink);
    const result = (await iterator.next()).value;
    expect(result.type).toEqual("post");
    if (result.type != "post") return;
    const result2 = (await iterator.next()).value;
    expect(result2.type).toEqual("backlog-complete");

    // Make sure the data is the same
    uuid.forEach((byte, i) => {
      expect(byte).toEqual(result.uuid[i]);
    });
    data.forEach((byte, i) => {
      expect(byte).toEqual(result.data[i]);
    });

    // Post more data
    const data2 = randomBytes(100);
    const { uuid: uuid2 } = await byos.post(channel, data2, publicKey, sign);

    // Get the data back
    const result3 = (await iterator.next()).value;
    expect(result3.type).toEqual("post");
    if (result3.type != "post") return;
    data2.forEach((byte, i) => {
      expect(byte).toEqual(result3.data[i]);
    });
    uuid2.forEach((byte, i) => {
      expect(byte).toEqual(result3.uuid[i]);
    });
  }, 100000);

  it("replace data", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });

    // Post with a static UUID
    const channel = Math.random().toString(36).substring(7);
    const uuid = randomBytes(16);
    const data = randomBytes(100);
    const { publicKey, sign } = mockSignatures();
    const { sharedLink } = await byos.post(
      channel,
      data,
      publicKey,
      sign,
      uuid,
    );

    // Get the data
    const iterator = byos.watch(channel, sharedLink);
    const result = (await iterator.next()).value;
    expect(result.type).toEqual("post");
    if (result.type != "post") return;
    data.forEach((byte, i) => {
      expect(byte).toEqual(result.data[i]);
    });
    const result2 = (await iterator.next()).value;
    expect(result2.type).toEqual("backlog-complete");

    // Replace the post with the same UUID
    const data2 = randomBytes(100);
    const { sharedLink: sharedLink2 } = await byos.post(
      channel,
      data2,
      publicKey,
      sign,
      uuid,
    );
    expect(sharedLink).toEqual(sharedLink2);

    // Make sure we get the new data
    const timeoutSignal = AbortSignal.timeout(4000);
    const iterator2 = byos.watch(channel, sharedLink2, timeoutSignal);
    const result3 = (await iterator2.next()).value;
    expect(result3.type).toEqual("post");
    if (result2.type != "post") return;
    data2.forEach((byte, i) => {
      expect(byte).toEqual(result2.data[i]);
    });
    const result4 = (await iterator2.next()).value;
    expect(result4.type).toEqual("backlog-complete");

    // Make sure we don't get the old data
    await expect(iterator2.next()).rejects.toThrow(
      "The operation was aborted due to timeout",
    );
  }, 100000);

  it("watch with wrong channel", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const { publicKey, sign } = mockSignatures();

    // Post some data
    const channel = Math.random().toString(36).substring(7);
    const { sharedLink } = await byos.post(
      channel,
      randomBytes(100),
      publicKey,
      sign,
    );

    // Listen on the wrong channel
    const wrongChannel = Math.random().toString(36).substring(7);
    const iterator = byos.watch(wrongChannel, sharedLink);

    await expect(iterator.next()).rejects.toThrow(
      "Wrong channel for this encrypted data",
    );
  }, 100000);

  it("delete data", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const { publicKey, sign } = mockSignatures();

    // Post some data
    const channel = Math.random().toString(36).substring(7);
    const sharedLinkandUUID = await byos.post(
      channel,
      randomBytes(100),
      publicKey,
      sign,
    );

    // Delete the data
    await byos.remove(channel, publicKey, sharedLinkandUUID.uuid);

    // Make sure the data is gone
    const timeoutSignal = AbortSignal.timeout(4000);
    const iterator = byos.watch(
      channel,
      sharedLinkandUUID.sharedLink,
      timeoutSignal,
    );
    const result = (await iterator.next()).value;
    expect(result.type).toEqual("backlog-complete");
    await expect(iterator.next()).rejects.toThrow(
      "The operation was aborted due to timeout",
    );
  }, 100000);

  it("replace and delete while watching", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const { publicKey, sign } = mockSignatures();

    // Start watching
    const channel = Math.random().toString(36).substring(7);
    const [sharedLink, path] = await byos.getSharedLinkAndPath(
      channel,
      publicKey,
      sign,
    );
    const iterator = byos.watch(channel, sharedLink);

    // Post some data
    const data = randomBytes(100);
    const { uuid } = await byos.post(channel, data, publicKey, sign);

    // Get the data
    const result = (await iterator.next()).value;
    expect(result.type).toEqual("post");
    if (result.type == "post") {
      data.forEach((byte, i) => {
        expect(byte).toEqual(result.data[i]);
      });
      uuid.forEach((byte, i) => {
        expect(byte).toEqual(result.uuid[i]);
      });
    }

    // Replace the data
    const data2 = randomBytes(100);
    await byos.post(channel, data2, publicKey, sign, uuid);
    const result2 = (await iterator.next()).value;
    if (result2.type == "post") {
      data2.forEach((byte, i) => {
        expect(byte).toEqual(result2.data[i]);
      });
    }

    // Delete the data
    await byos.remove(channel, publicKey, uuid);
    const result3 = (await iterator.next()).value;
    expect(result3.type).toEqual("remove");
    if (result3.type == "remove") {
      uuid.forEach((byte, i) => {
        expect(byte).toEqual(result3.uuid[i]);
      });
    }
  }, 100000);
});
