import { describe, expect, it, assert } from "vitest";
import LinkService from "./link-service";
import {
  randomString,
  soon,
  mockPublicKeyAndSignFromNonce,
} from "./test-utils";
import { AnnounceType } from "./streamer";

const serviceURL = "https://link.graffiti.garden";
// const serviceURL = 'http://localhost:8000'

describe(`Basic Streaming`, () => {
  it("announce existing", async () => {
    const { publicKeyFromNonce, signFromNonce } =
      mockPublicKeyAndSignFromNonce();
    const ls = new LinkService(publicKeyFromNonce, signFromNonce, serviceURL);
    const source = randomString();
    const target = randomString();
    const expiration = soon();
    const { created } = await ls.create(source, target, expiration);

    const controller = new AbortController();
    const iterator = ls.subscribe(source, controller.signal);

    const announce = (await iterator.next()).value;
    expect(announce?.type).toEqual(AnnounceType.ANNOUNCE);
    if (announce?.type == AnnounceType.ANNOUNCE) {
      assert(
        announce.link.publicKey.every((val, i) => val == created.publicKey[i]),
      );
      expect(announce.link.target).toEqual(target);
    }

    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    controller.abort();
    await expect(iterator.next()).resolves.toHaveProperty("done", true);
  });

  it("announce future", async () => {
    const source = randomString();
    const { publicKeyFromNonce, signFromNonce } =
      mockPublicKeyAndSignFromNonce();
    const ls = new LinkService(publicKeyFromNonce, signFromNonce, serviceURL);
    const iterator = ls.subscribe(source);
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    const target = randomString();
    const expiration = soon();
    await ls.create(source, target, expiration);

    const announce = (await iterator.next()).value;
    expect(announce?.type).toEqual(AnnounceType.ANNOUNCE);
    if (announce?.type == AnnounceType.ANNOUNCE) {
      expect(announce.link.target).toEqual(target);
    }
  });

  it("replace target", async () => {
    const { publicKeyFromNonce, signFromNonce } =
      mockPublicKeyAndSignFromNonce();
    const ls = new LinkService(publicKeyFromNonce, signFromNonce, serviceURL);
    const source = randomString();
    const target = randomString();
    const expiration = soon();
    const { created } = await ls.create(source, target, expiration);

    const iterator = ls.subscribe(source);

    // Get announce and backlog
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "announce",
    );
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    // Replace
    const newTarget = randomString();
    created.modify({ target: newTarget });

    const announce = (await iterator.next()).value;
    expect(announce?.type).toEqual(AnnounceType.ANNOUNCE);
    if (announce?.type == AnnounceType.ANNOUNCE) {
      expect(announce.link.target).toEqual(newTarget);
    }
  });

  it("replace source", async () => {
    const { publicKeyFromNonce, signFromNonce } =
      mockPublicKeyAndSignFromNonce();
    const ls = new LinkService(publicKeyFromNonce, signFromNonce, serviceURL);
    const source = randomString();
    const target = randomString();
    const expiration = soon();
    const { created } = await ls.create(source, target, expiration);

    const iterator = ls.subscribe(source);

    // Get announce and backlog
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "announce",
    );
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    // Replace
    const newSource = randomString();
    created.modify({ source: newSource });

    // Get an announce with a null container
    const announce = (await iterator.next()).value;
    expect(announce?.type).toEqual("unannounce");
    if (announce?.type == AnnounceType.UNANNOUNCE) {
      assert(announce.publicKey.every((val, i) => val == created.publicKey[i]));
    }
  });

  it("expire", async () => {
    const source = randomString();

    const { publicKeyFromNonce, signFromNonce } =
      mockPublicKeyAndSignFromNonce();
    const ls = new LinkService(publicKeyFromNonce, signFromNonce, serviceURL);
    const iterator = ls.subscribe(source);
    await expect(iterator.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    const target = randomString();
    const expiration = Math.ceil(Date.now() / 1000) + 3; // in 3 seconds
    await ls.create(source, target, expiration);

    // Get the value
    const announce = (await iterator.next()).value;
    expect(announce?.type).toEqual("announce");
    if (announce?.type == AnnounceType.ANNOUNCE) {
      expect(announce.link.target).toEqual(target);
    }

    // Wait again...
    const unannounce = (await iterator.next()).value;
    expect(unannounce?.type).toEqual("unannounce");
  }, 10000);

  it("triple subscribe", async () => {
    const source = randomString();
    const { publicKeyFromNonce, signFromNonce } =
      mockPublicKeyAndSignFromNonce();
    const ls = new LinkService(publicKeyFromNonce, signFromNonce, serviceURL);
    const abortController = new AbortController();

    // Start subscribing with the first iterator
    const firstIterator = ls.subscribe(source, abortController.signal);
    await expect(firstIterator.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    // Create a link
    const target = randomString();
    const { created } = await ls.create(source, target, soon());
    const announce = (await firstIterator.next()).value;
    expect(announce?.type).toEqual("announce");
    if (announce?.type == AnnounceType.ANNOUNCE) {
      expect(announce.link.target).toEqual(target);
    }

    // Replace it
    const newTarget = randomString();
    const { created: created2 } = await created.modify({ target: newTarget });
    const announce2 = (await firstIterator.next()).value;
    expect(announce2?.type).toEqual("announce");
    if (announce2?.type == AnnounceType.ANNOUNCE) {
      expect(announce2.link.target).toEqual(newTarget);
    }

    // Start subscribing with the second iterator
    const secondIterator = ls.subscribe(source, abortController.signal);
    const announce3 = (await secondIterator.next()).value;
    expect(announce3?.type).toEqual("announce");
    if (announce3?.type == AnnounceType.ANNOUNCE) {
      expect(announce3.link.target).toEqual(newTarget);
    }
    await expect(secondIterator.next()).resolves.toHaveProperty(
      "value.type",
      "backlog-complete",
    );

    // Replace the source
    const newSource = randomString();
    await created2.modify({ source: newSource });
    const announce4 = (await firstIterator.next()).value;
    const announce5 = (await secondIterator.next()).value;
    expect(announce4?.type).toEqual("unannounce");
    expect(announce5?.type).toEqual("unannounce");

    // Create another iterator
    const thirdIterator = ls.subscribe(source, abortController.signal);
    const announce6 = (await thirdIterator.next()).value;
    expect(announce6?.type).toEqual("backlog-complete");
  });
});
