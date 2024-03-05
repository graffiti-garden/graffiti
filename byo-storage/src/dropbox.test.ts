import { describe, it, expect } from "vitest";
import Dropbox from "./dropbox";
import "dotenv/config";
import { randomBytes } from "@noble/hashes/utils";

const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
if (!accessToken) {
  throw "You haven't defined a dropbox access token! See the Readme for more information.";
}

describe("dropbox", () => {
  it("logged in", async () => {
    const dropbox = new Dropbox({ accessToken });
    expect(dropbox.loggedIn).toBe(true);
  });

  it("post and download data", async () => {
    const dropbox = new Dropbox({ accessToken });
    const directory = Math.random().toString(36).substring(7);
    const name = Math.random().toString(36).substring(7);
    const data = randomBytes(100);

    await dropbox.updateFile(directory, name, data);

    const sharedLink = await dropbox.createDirectory(directory);

    const downloaded = await dropbox.downloadFile(sharedLink, name);
    expect(data.every((byte, i) => byte === downloaded[i])).toBe(true);
  }, 100000);

  it("fetch nonexisting data", async () => {
    const dropbox = new Dropbox({ accessToken });
    const directory = Math.random().toString(36).substring(7);
    const sharedLink = await dropbox.createDirectory(directory);
    const name = Math.random().toString(36).substring(7);
    expect(dropbox.downloadFile(sharedLink, name)).rejects.toThrow(
      "File not found",
    );
  }, 100000);

  it("delete data", async () => {
    const dropbox = new Dropbox({ accessToken });
    const directory = Math.random().toString(36).substring(7);
    const name = Math.random().toString(36).substring(7);
    const data = randomBytes(100);
    const sharedLink = await dropbox.createDirectory(directory);
    await dropbox.updateFile(directory, name, data);
    await dropbox.deleteFile(directory, name);
    expect(dropbox.downloadFile(sharedLink, name)).rejects.toThrow(
      "File not found",
    );
  }, 100000);

  it("create and delete directory", async () => {
    const dropbox = new Dropbox({ accessToken });
    const directory = Math.random().toString(36).substring(7);
    const sharedLink = await dropbox.createDirectory(directory);
    await dropbox.deleteDirectory(directory);

    // Make sure we can't get the directory anymore
    await expect(dropbox.listFiles(sharedLink).next()).rejects.toThrow(
      "Path not found",
    );
  });

  it("post and watch data", async () => {
    const dropbox = new Dropbox({ accessToken });
    const directory = Math.random().toString(36).substring(7);
    const name = Math.random().toString(36).substring(7);
    const data = randomBytes(100);

    await dropbox.updateFile(directory, name, data);

    const sharedLink = await dropbox.createDirectory(directory);

    const abortController = new AbortController();
    const iterator = dropbox.listFiles(sharedLink, {
      signal: abortController.signal,
    });
    const iteratorResult = (await iterator.next()).value;
    expect(iteratorResult).toHaveProperty("type", "update");
    if (iteratorResult?.type === "update") {
      expect(iteratorResult).toHaveProperty("name", name);
      expect(data.every((byte, i) => byte === iteratorResult.data[i])).toBe(
        true,
      );
    }
    const iteratorResult2 = (await iterator.next()).value;
    expect(iteratorResult2).toHaveProperty("type", "cursor");
    const iteratorResult3 = (await iterator.next()).value;
    expect(iteratorResult3).toHaveProperty("type", "backlog-complete");

    // Post additional data
    const name2 = Math.random().toString(36).substring(7);
    const data2 = randomBytes(100);
    await dropbox.updateFile(directory, name2, data2);
    const iteratorResult4 = (await iterator.next()).value;
    expect(iteratorResult4).toHaveProperty("type", "update");
    if (iteratorResult4?.type === "update") {
      expect(iteratorResult4).toHaveProperty("name", name2);
      expect(data2.every((byte, i) => byte === iteratorResult4.data[i])).toBe(
        true,
      );
    }
    const iteratorResult5 = (await iterator.next()).value;
    expect(iteratorResult5).toHaveProperty("type", "cursor");

    // Delete data
    await dropbox.deleteFile(directory, name);
    const iteratorOut6 = await iterator.next();
    expect(iteratorOut6).toHaveProperty("done", false);
    const iteratorResult6 = iteratorOut6.value;
    expect(iteratorResult6).toHaveProperty("type", "delete");
    if (iteratorResult6?.type === "delete") {
      expect(iteratorResult6).toHaveProperty("name", name);
    }
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "cursor",
    );

    // Stop the iterator
    abortController.abort();
    await expect(iterator.next()).resolves.toHaveProperty("done", true);
  }, 100000);

  it("resume cursor", async () => {
    const dropbox = new Dropbox({ accessToken });
    const directory = Math.random().toString(36).substring(7);
    const sharedLink = await dropbox.createDirectory(directory);

    const name = Math.random().toString(36).substring(7);
    const data = randomBytes(100);
    await dropbox.updateFile(directory, name, data);

    const controller = new AbortController();
    const iterator = dropbox.listFiles(sharedLink, {
      signal: controller.signal,
    });
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "update",
    );
    const cursorResult = (await iterator.next()).value;
    expect(cursorResult).toHaveProperty("type", "cursor");
    const cursor = cursorResult?.type == "cursor" ? cursorResult.cursor : "";
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    // Stop the first iterator
    controller.abort();
    await expect(iterator.next()).resolves.toHaveProperty("done", true);

    // Resume the iterator
    const iterator2 = dropbox.listFiles(sharedLink, { cursor });
    await expect(iterator2.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    // Post more data
    const name2 = Math.random().toString(36).substring(7);
    const data2 = randomBytes(100);
    await dropbox.updateFile(directory, name2, data2);
    const iteratorResult = (await iterator2.next()).value;
    expect(iteratorResult?.type).toEqual("update");
    if (iteratorResult?.type == "update") {
      expect(iteratorResult).toHaveProperty("name", name2);
      expect(data2.every((byte, i) => byte === iteratorResult.data[i])).toBe(
        true,
      );
    }
  }, 100000);
});
