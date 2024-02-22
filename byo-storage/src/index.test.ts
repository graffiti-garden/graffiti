import { describe, it, expect } from "vitest";
import DataStore from "./index";
import { randomBytes } from "@noble/hashes/utils";
import "dotenv/config";

const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
if (!accessToken) {
  throw "You haven't defined a dropbox access token! See the Readme for more information.";
}

describe(`Main`, () => {
  it("post and receive data", async () => {
    const ds = new DataStore({ accessToken });

    // Generate a random channel string
    const channel = Math.random().toString(36).substring(7);

    // Generate random data to post
    const data = randomBytes(100);

    // Post the data
    const sharedLink = await ds.post(channel, data);

    // Get the data back
    const iterator = ds.watch(channel, sharedLink);
    const dataReceived = (await iterator.next()).value;

    // Make sure the data is the same
    data.forEach((byte, i) => {
      expect(byte).toEqual(dataReceived[i]);
    });

    // Post more data
    const data2 = randomBytes(100);
    await ds.post(channel, data2);

    // Get the data back
    const dataReceived2 = (await iterator.next()).value;
    data2.forEach((byte, i) => {
      expect(byte).toEqual(dataReceived2[i]);
    });
  }, 20000);

  it("replace data", async () => {
    const ds = new DataStore({ accessToken });

    // Post with a static UUID
    const channel = Math.random().toString(36).substring(7);
    const uuid = randomBytes(16);
    const data = randomBytes(100);
    const sharedLink = await ds.post(channel, data, uuid);

    // Get the data
    const iterator = ds.watch(channel, sharedLink);
    const dataReceived = (await iterator.next()).value;
    data.forEach((byte, i) => {
      expect(byte).toEqual(dataReceived[i]);
    });

    // Replace the post with the same UUID
    const data2 = randomBytes(100);
    const sharedLink2 = await ds.post(channel, data2, uuid);
    expect(sharedLink).toEqual(sharedLink2);

    // Make sure we get the new data
    const timeoutSignal = AbortSignal.timeout(2000);
    const iterator2 = ds.watch(channel, sharedLink2, timeoutSignal);
    const dataReceived2 = (await iterator2.next()).value;
    data2.forEach((byte, i) => {
      expect(byte).toEqual(dataReceived2[i]);
    });

    // Make sure we don't get the old data
    await expect(iterator2.next()).rejects.toThrow(
      "The operation was aborted due to timeout",
    );
  }, 100000);

  it("watch with wrong channel", async () => {
    const ds = new DataStore({ accessToken });

    // Post some data
    const channel = Math.random().toString(36).substring(7);
    const sharedLink = await ds.post(channel, randomBytes(100));

    // Listen on the wrong channel
    const wrongChannel = Math.random().toString(36).substring(7);
    const iterator = ds.watch(wrongChannel, sharedLink);

    await expect(iterator.next()).rejects.toThrow(
      "Wrong channel for this encrypted data",
    );
  }, 100000);
});
