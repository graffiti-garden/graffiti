import {
  GraffitiErrorForbidden,
  GraffitiErrorNotFound,
  GraffitiErrorNotAcceptable,
  GraffitiErrorTooLarge,
  type Graffiti,
  type GraffitiMedia,
} from "@graffiti-garden/api";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "../src/core/db.js";
import { MemoryRules } from "./memory-rules.js";
import { GuardedGraffiti } from "../src/core/graffiti.js";
import { Guard } from "../src/core/guard.js";
import { sourceFromContext } from "../src/core/source.js";
import {
  appendMediaReceiptUrl,
  isMediaReceiptObject,
  parseMediaReceiptUrl,
  postMediaReceipt,
  resolveMediaReceipt,
} from "../src/core/media-receipts.js";

describe("media provenance receipts", () => {
  it("enforces media limits on the only read and returns that result only after approval", async () => {
    const graffiti = new GraffitiLocal({
      pouchDBOptions: {
        name: `/private/tmp/graffiti-media-read-limits-${crypto.randomUUID()}`,
      },
    });
    const db = new MemoryRules();
    const session = { actor: "did:example:owner" };
    const url = await graffiti.postMedia({
      data: new Blob(["image"], { type: "image/png" }), allowed: [],
    }, session);
    const getMedia = vi.spyOn(graffiti, "getMedia");
    const ask = vi.fn(async () => ({ allow: true, remember: false }));
    const guarded = new GuardedGraffiti(
      graffiti, new Guard(graffiti, db, "https://example.com", ask),
    );

    try {
      await expect(guarded.getMedia(url, { maxBytes: 0 }, session))
        .rejects.toBeInstanceOf(GraffitiErrorTooLarge);
      expect(getMedia).toHaveBeenCalledExactlyOnceWith(url, { maxBytes: 0 }, session);
      expect(ask).not.toHaveBeenCalled();
      getMedia.mockClear();

      await expect(guarded.getMedia(url, { types: ["text/plain"] }, session))
        .rejects.toBeInstanceOf(GraffitiErrorNotAcceptable);
      expect(getMedia).toHaveBeenCalledExactlyOnceWith(url, { types: ["text/plain"] }, session);
      expect(ask).not.toHaveBeenCalled();
      getMedia.mockClear();

      const accept = { maxBytes: 5, types: ["image/png"] };
      ask.mockResolvedValueOnce({ allow: false, remember: false });
      await expect(guarded.getMedia(url, accept, session))
        .rejects.toBeInstanceOf(GraffitiErrorForbidden);
      expect(getMedia).toHaveBeenCalledExactlyOnceWith(url, accept, session);
      getMedia.mockClear();

      const result = await guarded.getMedia(url, accept, session);
      expect(getMedia).toHaveBeenCalledExactlyOnceWith(url, accept, session);
      expect(result).toBe(await getMedia.mock.results[0].value);
      expect(ask).toHaveBeenCalledTimes(2);
    } finally {
      await db.destroy();
    }
  });

  it("uses a guarded upload receipt for same-site and cross-site file operations", async () => {
    const graffiti = new GraffitiLocal({
      pouchDBOptions: {
        name: `/private/tmp/graffiti-guarded-media-${crypto.randomUUID()}`,
      },
    });
    const db = new MemoryRules();
    const owner = "did:example:owner";
    const session = { actor: owner };
    const pathA = [{ id: "a", name: "A" }];
    const childPath = [...pathA, { id: "chat", name: "Chat", url: "https://example.com/chats/chat" }];
    const pathB = [{ id: "b", name: "B" }];
    const prompts: string[] = [];
    const guard = new Guard(graffiti, db, "https://example.com", async (request) => {
      prompts.push(request.mode ?? "unknown");
      return { allow: true, remember: true };
    });
    const guarded = new GuardedGraffiti(graffiti, guard, undefined, "https://example.com");

    try {
      const url = await guarded.postMedia({ data: new Blob(["private image"], { type: "image/png" }), allowed: [] }, Object.assign({}, session, { source: childPath })) as string;
      expect(parseMediaReceiptUrl(url).receiptUrl).toBeDefined();
      const receipt = await graffiti.get(parseMediaReceiptUrl(url).receiptUrl!, {}, session);
      expect(receipt.value).toEqual({
        mediaUrl: parseMediaReceiptUrl(url).canonicalUrl,
        "via site": {
          name: "Chat",
          id: JSON.stringify(["https://example.com", "a", "chat"]),
          url: "https://example.com/chats/chat",
        },
        _guard: { kind: "media-receipt" },
      });
      expect(prompts).toEqual([]);

      const read = async (path: typeof pathA) =>
        await guarded.getMedia(url, {}, Object.assign({}, session, { source: path })) as GraffitiMedia;
      expect((await read(childPath)).data.size).toBeGreaterThan(0);
      expect((await read(pathA)).data.size).toBeGreaterThan(0);
      expect(prompts).toEqual([]);
      expect((await read(pathB)).data.size).toBeGreaterThan(0);
      expect(prompts).toEqual(["read"]);

      await guarded.deleteMedia(url, Object.assign({}, session, { source: pathB }));
      expect(prompts).toEqual(["read", "delete"]);
      await expect(graffiti.getMedia(url, {}, session)).rejects.toThrow();

      const nextUrl = await guarded.postMedia({ data: new Blob(["another private image"], { type: "image/png" }), allowed: [] }, Object.assign({}, session, { source: childPath })) as string;
      await guarded.deleteMedia(nextUrl, Object.assign({}, session, { source: pathA }));
      expect(prompts).toEqual(["read", "delete"]);
    } finally {
      await db.destroy();
    }
  });

  it("keeps local media backing objects behind the media guard path", async () => {
    const graffiti = new GraffitiLocal({
      pouchDBOptions: {
        name: `/private/tmp/graffiti-media-descriptor-${crypto.randomUUID()}`,
      },
    });
    const db = new MemoryRules();
    const session = { actor: "did:example:owner" };
    const source = sourceFromContext("https://example.com", {
      source: [{ id: "page", name: "Page" }],
    });
    let prompts = 0;
    const guard = new Guard(graffiti, db, "https://example.com", async () => {
      prompts++;
      return { allow: true, remember: false };
    });

    try {
      const url = await graffiti.postMedia(
        { data: new Blob(["private image"], { type: "image/png" }), allowed: [] },
        session,
      );
      expect((await graffiti.get(url, {}, session)).value).toHaveProperty("dataBase64");
      await expect(guard.authorize("get", [url, {}, session], source))
        .rejects.toBeInstanceOf(GraffitiErrorForbidden);
      await expect(guard.authorize("delete", [url, session], source))
        .rejects.toBeInstanceOf(GraffitiErrorForbidden);
      expect(prompts).toBe(0);

      await guard.authorize("getMedia", [url, {}, session], source);
      expect(prompts).toBe(1);

      const ordinary = await graffiti.post(
        { value: { text: "ordinary" }, channels: [], allowed: [] },
        session,
      );
      await expect(guard.authorize("get", [ordinary.url, {}, session], source)).resolves.toBeDefined();
      await expect(guard.authorize("delete", [ordinary.url, session], source)).resolves.toBeDefined();
      expect(prompts).toBe(1);
    } finally {
      await db.destroy();
    }
  });

  it("keeps literal ? and # addendums composable and rejects ambiguous receipt pointers", () => {
    const url = "graffiti:media";
    const receipt = "graffiti:receipt?nested=part";
    const layered = appendMediaReceiptUrl(`${url}?another.layer=x%3Fy`, receipt);
    expect(layered).toBe(
      `${url}?another.layer=x%3Fy?graffiti.guard.receipt=graffiti%3Areceipt%3Fnested%3Dpart`,
    );
    expect(parseMediaReceiptUrl(`${layered}?last.layer=true`)).toEqual({
      canonicalUrl: url,
      forwardUrl: `${url}?another.layer=x%3Fy?last.layer=true`,
      receiptUrl: receipt,
    });
    expect(parseMediaReceiptUrl(`${url}#first.layer=x?graffiti.guard.receipt=${encodeURIComponent(receipt)}#last.layer=y`)).toEqual({
      canonicalUrl: url,
      forwardUrl: `${url}#first.layer=x#last.layer=y`,
      receiptUrl: receipt,
    });
    expect(parseMediaReceiptUrl(appendMediaReceiptUrl(`${url}#first.layer=x`, receipt))).toEqual({
      canonicalUrl: url,
      forwardUrl: `${url}#first.layer=x`,
      receiptUrl: receipt,
    });
    expect(() => appendMediaReceiptUrl(layered, "graffiti:other")).toThrow(
      "Duplicate",
    );
    expect(() =>
      parseMediaReceiptUrl(`${layered}?graffiti.guard.receipt=graffiti%3Aother`),
    ).toThrow("Duplicate");
    expect(() => parseMediaReceiptUrl(`${url}?graffiti.guard.receipt=`)).toThrow(
      "Empty",
    );
    expect(parseMediaReceiptUrl("https://example.com/file?size=large")).toEqual({
      canonicalUrl: "https://example.com/file?size=large",
      forwardUrl: "https://example.com/file?size=large",
      receiptUrl: undefined,
    });
    expect(parseMediaReceiptUrl("graffiti:file?unknown=query")).toEqual({
      canonicalUrl: "graffiti:file",
      forwardUrl: "graffiti:file?unknown=query",
      receiptUrl: undefined,
    });
  });

  it("fetches only the linked receipt for an allowed recipient, without discovery", async () => {
    const graffiti = new GraffitiLocal({
      pouchDBOptions: {
        name: `/private/tmp/graffiti-media-receipts-${crypto.randomUUID()}`,
      },
    });
    const owner = { actor: "did:example:owner" };
    const recipient = { actor: "did:example:recipient" };
    const media = {
      data: new Blob(["image"], { type: "image/png" }),
      allowed: [recipient.actor],
    };
    const siteId = ["https://example.com", "page-version-123"];
    const source = sourceFromContext(siteId[0], {
      source: [{ id: siteId[1], name: "Page" }],
    });
    const bareUrl = await graffiti.postMedia(media, owner);
    const decoratedUrl = await postMediaReceipt(
      graffiti,
      bareUrl,
      media,
      source,
      owner,
    );
    const receiptUrl = parseMediaReceiptUrl(decoratedUrl).receiptUrl;
    expect(receiptUrl).toBeDefined();
    const receipt = await graffiti.get(receiptUrl!, {}, owner);
    expect(isMediaReceiptObject(receipt)).toBe(true);
    expect(receipt.channels).toEqual([]);

    const recipientMedia = await graffiti.getMedia(bareUrl, {}, recipient);
    const get = vi.spyOn(graffiti, "get");
    const discover = vi.spyOn(graffiti, "discover");
    expect(
      await resolveMediaReceipt(
        graffiti,
        decoratedUrl,
        recipientMedia,
        recipient,
      ),
    ).toEqual({ id: siteId, name: "Page" });
    expect(
      await resolveMediaReceipt(graffiti, bareUrl, recipientMedia, recipient),
    ).toBeUndefined();
    expect(
      await resolveMediaReceipt(
        graffiti,
        `${bareUrl}?another.layer=x`,
        recipientMedia,
        recipient,
      ),
    ).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(receiptUrl, {}, recipient);
    get.mockRejectedValueOnce(new GraffitiErrorNotFound("Receipt missing"));
    expect(
      await resolveMediaReceipt(graffiti, decoratedUrl, recipientMedia, recipient),
    ).toBeUndefined();
    expect(discover).not.toHaveBeenCalled();
  });

  it("removes an upload and returns no URL when its receipt cannot be saved", async () => {
    const deleteMedia = vi.fn(async () => {});
    const graffiti = {
      post: async () => { throw new Error("receipt storage unavailable"); },
      deleteMedia,
    } as unknown as GraffitiLocal;
    const media = { data: new Blob(["image"], { type: "image/png" }) };
    const owner = { actor: "did:example:owner" };

    await expect(postMediaReceipt(
      graffiti,
      "graffiti:uploaded-file",
      media,
      sourceFromContext("https://example.com", { source: [{ id: "page", name: "Page" }] }),
      owner,
    )).rejects.toThrow("provenance receipt could not be saved");
    expect(deleteMedia).toHaveBeenCalledWith("graffiti:uploaded-file", owner);
  });

  it("does not accept a receipt for another actor, file, or visibility", async () => {
    const graffiti = new GraffitiLocal({
      pouchDBOptions: {
        name: `/private/tmp/graffiti-media-receipts-${crypto.randomUUID()}`,
      },
    });
    const owner = { actor: "did:example:owner" };
    const other = { actor: "did:example:other" };
    const media = { data: new Blob(["text"], { type: "text/plain" }) };
    const bareUrl = await graffiti.postMedia(media, owner);
    const wrongActorReceipt = await graffiti.post({
      value: {
        mediaUrl: bareUrl,
        "via site": { name: "Other", id: JSON.stringify(["https://wrong-actor.example"]) },
        _guard: { kind: "media-receipt" },
      },
      channels: [bareUrl],
    }, other);
    const wrongActor = appendMediaReceiptUrl(bareUrl, wrongActorReceipt.url);
    const wrongVisibility = await postMediaReceipt(
      graffiti,
      bareUrl,
      { ...media, allowed: [] },
      sourceFromContext("https://wrong-visibility.example", {}),
      owner,
    );
    const loaded = await graffiti.getMedia(bareUrl, {}, owner);
    expect(await resolveMediaReceipt(graffiti, wrongActor, loaded, owner)).toBe(
      undefined,
    );
    expect(
      await resolveMediaReceipt(graffiti, wrongVisibility, loaded, owner),
    ).toBe(undefined);
    const anotherFile = appendMediaReceiptUrl("graffiti:another-file", parseMediaReceiptUrl(wrongVisibility).receiptUrl!);
    expect(
      await resolveMediaReceipt(graffiti, anotherFile, { ...loaded, allowed: [] }, owner),
    ).toBeUndefined();
  });

  it.each([{ allowed: undefined }, { allowed: [] as string[] }])("skips receipts for public reads, but requires them for private reads and deletion (%j)", async ({ allowed }) => {
    const owner = { actor: "did:example:owner" };
    const media = { actor: owner.actor, allowed, data: new Blob(["image"]) };
    const deleteMedia = vi.fn(async () => {});
    const get = vi.fn(async () => { throw new Error("receipt lookup unavailable"); });
    const graffiti = {
      sessionEvents: new EventTarget(),
      getMedia: async () => media,
      get,
      deleteMedia,
    } as unknown as Graffiti;
    const db = new MemoryRules();
    const ask = vi.fn(async () => ({ allow: true, remember: false }));
    const guarded = new GuardedGraffiti(graffiti, new Guard(graffiti, db, "https://example.com", ask), undefined, "https://example.com");

    try {
      const url = appendMediaReceiptUrl("graffiti:file", "graffiti:receipt");
      const read = guarded.getMedia(url, {}, Object.assign({}, owner, { source: [] }));
      if (allowed) {
        await expect(read).rejects.toThrow("receipt lookup unavailable");
        expect(get).toHaveBeenCalledTimes(1);
      } else {
        await expect(read).resolves.toEqual(media);
        expect(get).not.toHaveBeenCalled();
      }
      await expect(guarded.deleteMedia(url, Object.assign({}, owner, { source: [] })))
        .rejects.toThrow("receipt lookup unavailable");
      expect(deleteMedia).not.toHaveBeenCalled();
      expect(ask).not.toHaveBeenCalled();
    } finally {
      await db.destroy();
    }
  });

  it.each([{ allowed: undefined }, { allowed: [] as string[] }])("requires exact-file deletion approval if the receipt is stripped or missing (%j)", async ({ allowed }) => {
    const graffiti = new GraffitiLocal({
      pouchDBOptions: {
        name: `/private/tmp/graffiti-media-stripped-receipt-${crypto.randomUUID()}`,
      },
    });
    const db = new MemoryRules();
    const owner = { actor: "did:example:owner" };
    const ask = vi.fn(async (request: Request, _canRemember: boolean) => ({ allow: request.mode === "read", remember: false }));
    const guarded = new GuardedGraffiti(graffiti, new Guard(graffiti, db, "https://example.com", ask), undefined, "https://example.com");

    try {
      const decoratedUrl = await guarded.postMedia({ data: new Blob(["image"], { type: "image/png" }), allowed }, Object.assign({}, owner, { source: [{ id: "a", name: "A" }] })) as string;
      const { canonicalUrl } = parseMediaReceiptUrl(decoratedUrl);
      const otherSite = [{ id: "b", name: "B" }];

      // Read approval must not authorize deleting the same file.
      await guarded.getMedia(canonicalUrl, {}, Object.assign({}, owner, { source: otherSite }));
      ask.mockClear();
      await expect(guarded.deleteMedia(canonicalUrl, Object.assign({}, owner, { source: otherSite })))
        .rejects.toBeInstanceOf(GraffitiErrorForbidden);
      await graffiti.delete(parseMediaReceiptUrl(decoratedUrl).receiptUrl!, owner);
      await expect(guarded.deleteMedia(decoratedUrl, Object.assign({}, owner, { source: otherSite })))
        .rejects.toBeInstanceOf(GraffitiErrorForbidden);
      await expect(graffiti.getMedia(canonicalUrl, {}, owner)).resolves.toBeDefined();
      expect(ask).toHaveBeenCalledTimes(2);
      for (const [request, canRemember] of ask.mock.calls) {
        expect(request).toMatchObject({ mode: "delete" });
        expect(request.originSite).toBeUndefined();
        expect(canRemember).toBe(false);
      }

      ask.mockResolvedValueOnce({ allow: true, remember: false });
      await guarded.deleteMedia(canonicalUrl, Object.assign({}, owner, { source: otherSite }));
      await expect(graffiti.getMedia(canonicalUrl, {}, owner)).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
