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

  it("create same directories", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const channel = Math.random().toString(36).substring(7);
    const publicKey = randomBytes(32);
    const { directory, sharedLink } = await byos.createDirectory(
      channel,
      publicKey,
    );
    const { directory: directory2, sharedLink: sharedLink2 } =
      await byos.createDirectory(channel, publicKey);
    expect(directory).toEqual(directory2);
    expect(sharedLink).toEqual(sharedLink2);
  }, 100000);

  it("delete directory", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const channel = Math.random().toString(36).substring(7);
    const { publicKey, sign, verify } = mockSignatures();
    const { directory, sharedLink } = await byos.createDirectory(
      channel,
      publicKey,
    );
    await byos.signDirectory(channel, publicKey, sign);
    await byos.deleteDirectory(channel, publicKey);

    await expect(
      byos.getPublicKey(channel, sharedLink, verify),
    ).rejects.toEqual("Signature not found");

    await expect(byos.subscribe(channel, sharedLink).next()).rejects.toEqual(
      "Path not found",
    );
  }, 100000);

  it("directories with different public keys", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const channel = Math.random().toString(36).substring(7);
    const publicKey = randomBytes(32);
    const publicKey2 = randomBytes(32);
    const { directory, sharedLink } = await byos.createDirectory(
      channel,
      publicKey,
    );
    const { directory: directory2, sharedLink: sharedLink2 } =
      await byos.createDirectory(channel, publicKey2);
    expect(directory).not.toEqual(directory2);
    expect(sharedLink).not.toEqual(sharedLink2);
  }, 100000);

  it("make and verify signature", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const channel = Math.random().toString(36).substring(7);
    const { publicKey, sign, verify } = mockSignatures();
    const { sharedLink } = await byos.signDirectory(channel, publicKey, sign);
    const publicKeyRecieved = await byos.getPublicKey(
      channel,
      sharedLink,
      verify,
    );
    expect(publicKey.length).toEqual(publicKeyRecieved.length);
    expect(publicKey.every((byte, i) => byte === publicKeyRecieved[i])).toBe(
      true,
    );
  }, 100000);

  it("try to get unsigned directory", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const { publicKey, sign, verify } = mockSignatures();
    const channel = Math.random().toString(36).substring(7);
    const { sharedLink } = await byos.createDirectory(channel, publicKey);
    await expect(
      byos.getPublicKey(channel, sharedLink, verify),
    ).rejects.toEqual("Signature not found");
  }, 100000);

  it("post and receive data", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });

    // Generate a random channel string
    const channel = Math.random().toString(36).substring(7);

    // Generate random data to post
    const data = randomBytes(100);
    const uuid = randomBytes(16);

    // Post the data
    const { publicKey, sign } = mockSignatures();
    const sharedLink = await byos.update(channel, publicKey, uuid, data);

    // Get the data back
    const iterator = byos.subscribe(channel, sharedLink);
    const result = (await iterator.next()).value;
    expect(result.type).toEqual("update");
    if (result.type != "update") return;
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
    const uuid2 = randomBytes(16);
    const sharedLink2 = await byos.update(channel, publicKey, uuid2, data2);
    expect(sharedLink2).toEqual(sharedLink);

    // Get the data back
    const result3 = (await iterator.next()).value;
    expect(result3.type).toEqual("update");
    if (result3.type != "update") return;
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
    const sharedLink = await byos.update(channel, publicKey, uuid, data);

    // Get the data
    const iterator = byos.subscribe(channel, sharedLink);
    const result = (await iterator.next()).value;
    expect(result.type).toEqual("update");
    if (result.type != "update") return;
    data.forEach((byte, i) => {
      expect(byte).toEqual(result.data[i]);
    });
    const result2 = (await iterator.next()).value;
    expect(result2.type).toEqual("backlog-complete");

    // Replace the post with the same UUID
    const data2 = randomBytes(100);
    const sharedLink2 = await byos.update(channel, publicKey, uuid, data2);
    expect(sharedLink).toEqual(sharedLink2);

    // Make sure we get the new data
    const timeoutSignal = AbortSignal.timeout(4000);
    const iterator2 = byos.subscribe(channel, sharedLink2, timeoutSignal);
    const result3 = (await iterator2.next()).value;
    expect(result3.type).toEqual("update");
    if (result2.type != "update") return;
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

  it("subscribe with wrong channel", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const { publicKey, sign } = mockSignatures();

    // Post some data
    const channel = Math.random().toString(36).substring(7);
    const uuid = randomBytes(16);
    const sharedLink = await byos.update(
      channel,
      publicKey,
      uuid,
      randomBytes(100),
    );

    // Listen on the wrong channel
    const wrongChannel = Math.random().toString(36).substring(7);
    const iterator = byos.subscribe(wrongChannel, sharedLink);

    await expect(iterator.next()).rejects.toThrow(
      "Wrong password for this encrypted data",
    );
  }, 100000);

  it("delete data", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });

    // Post some data
    const channel = Math.random().toString(36).substring(7);
    const publicKey = randomBytes(32);
    const uuid = randomBytes(16);
    const sharedLink = await byos.update(
      channel,
      publicKey,
      uuid,
      randomBytes(100),
    );

    // Delete the data
    await byos.delete(channel, publicKey, uuid);

    // Make sure the data is gone
    const timeoutSignal = AbortSignal.timeout(4000);
    const iterator = byos.subscribe(channel, sharedLink, timeoutSignal);
    const result = (await iterator.next()).value;
    expect(result.type).toEqual("backlog-complete");
    await expect(iterator.next()).rejects.toThrow(
      "The operation was aborted due to timeout",
    );
  }, 100000);

  it("replace and delete while subscribing", async () => {
    const byos = new BYOStorage({ authentication: { accessToken } });
    const publicKey = randomBytes(32);

    // Start subscribing
    const channel = Math.random().toString(36).substring(7);
    const { directory, sharedLink } = await byos.createDirectory(
      channel,
      publicKey,
    );
    const iterator = byos.subscribe(channel, sharedLink);

    // Post some data
    const data = randomBytes(100);
    const uuid = randomBytes(16);
    await byos.update(channel, publicKey, uuid, data);

    // Get the data
    const result = (await iterator.next()).value;
    expect(result.type).toEqual("update");
    if (result.type == "update") {
      data.forEach((byte, i) => {
        expect(byte).toEqual(result.data[i]);
      });
      uuid.forEach((byte, i) => {
        expect(byte).toEqual(result.uuid[i]);
      });
    }

    // Replace the data
    const data2 = randomBytes(100);
    await byos.update(channel, publicKey, uuid, data2);
    const result2 = (await iterator.next()).value;
    if (result2.type == "update") {
      data2.forEach((byte, i) => {
        expect(byte).toEqual(result2.data[i]);
      });
    }

    // Delete the data
    await byos.delete(channel, publicKey, uuid);
    const result3 = (await iterator.next()).value;
    expect(result3.type).toEqual("delete");
    if (result3.type == "delete") {
      uuid.forEach((byte, i) => {
        expect(byte).toEqual(result3.uuid[i]);
      });
    }
  }, 100000);
});
