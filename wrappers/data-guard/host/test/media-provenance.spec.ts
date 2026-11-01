import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraffitiErrorForbidden, GraffitiErrorNotAcceptable, GraffitiErrorNotFound, GraffitiErrorTooLarge, isMediaAcceptable } from "@graffiti-garden/api";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { format, parse } from "content-type";
import { expect, it, vi } from "vitest";
import { GuardedGraffiti } from "../src/core/graffiti.js";
import { Guard } from "../src/core/guard.js";
import { readMedia, stampMedia } from "../src/core/media-provenance.js";
import { siteStamp } from "../src/core/provenance.js";
import { sourceFromContext } from "../src/core/source.js";
import { MemoryRules } from "./memory-rules.js";

const origin = "https://example.com";
const sourceA = [{ id: "A", name: "Chat É 🌱", url: "https://example.com/Chat?ID=A" }];
const sourceB = [{ id: "B", name: "Other" }];
const source = sourceFromContext(origin, { source: sourceA });
const actor = "did:example:owner";
const session = { actor };
const sessionA = { actor, source: sourceA };
const sessionB = { actor, source: sourceB };

function harness(remember = false) {
  const graffiti = new GraffitiLocal({
    pouchDBOptions: { name: join(tmpdir(), `graffiti-media-${crypto.randomUUID()}`) },
  });
  const db = new MemoryRules();
  const ask = vi.fn(async () => ({ allow: true, remember }));
  const guarded = new GuardedGraffiti(graffiti, new Guard(graffiti, db, origin, ask), undefined, origin);
  return { graffiti, db, ask, guarded };
}

it("preserves bytes, size, type matching and other MIME parameters, including quoted semicolons", async () => {
  const original = new Blob([new Uint8Array([0, 255, 10, 128])], {
    type: 'image/png; note="a,b;c; graffiti-guard=not-a-parameter"',
  });
  const stamped = stampMedia(original, source);
  expect(stamped.size).toBe(original.size);
  expect(await stamped.arrayBuffer()).toEqual(await original.arrayBuffer());
  expect(isMediaAcceptable(stamped.type, ["image/png"])).toBe(true);
  expect(isMediaAcceptable(stamped.type, ["image/*"])).toBe(true);
  expect(isMediaAcceptable(stamped.type, ["*/*"])).toBe(true);
  expect(isMediaAcceptable(stamped.type, ["text/plain"])).toBe(false);
  const { media, from } = readMedia({ data: stamped, actor });
  expect(media.data.type).toBe(original.type);
  expect(from).toEqual({ id: [origin, "A"], name: "Chat É 🌱" });
  const encoded = parse(stamped.type).parameters["graffiti-guard"];
  const value = JSON.parse(Buffer.from(encoded, "hex").toString("utf8"));
  expect(value).toEqual({ "via site": siteStamp(source) });
});

it("overwrites supplied provenance when reposting, and handles files without a type", () => {
  const original = stampMedia(new Blob(["bytes"]), source);
  const other = sourceFromContext(origin, { source: sourceB });
  const stamped = stampMedia(original, other);
  expect(stamped.type.match(/graffiti-guard=/g)).toHaveLength(1);
  const { media, from } = readMedia({ data: stamped, actor });
  expect(media.data.type).toBe("application/octet-stream");
  expect(from?.id).toEqual([origin, "B"]);
});

it.each(["", "xyz", "0", "ff", Buffer.from('{"via site":{"id":"bad"}}').toString("hex")])(
  "rejects malformed provenance instead of treating it as legacy (%s)", encoded => {
    const data = new Blob([], { type: format({ type: "image/png", parameters: { "graffiti-guard": encoded } }) });
    expect(() => readMedia({ data, actor })).toThrow();
  },
);

it("posts one file with an unchanged URL and no extra objects, then applies inherited and cross-site permissions", async () => {
  const { graffiti, ask, guarded } = harness(true);
  const post = vi.spyOn(graffiti, "post");
  const get = vi.spyOn(graffiti, "get");
  const discover = vi.spyOn(graffiti, "discover");
  const upload = vi.spyOn(graffiti, "postMedia");
  const child = { actor, source: [...sourceA, { id: "room", name: "Room" }] };
  const url = await guarded.postMedia({ data: new Blob(["image"], { type: "image/png" }), allowed: [] }, child);
  expect(url).toBe(await upload.mock.results[0].value);
  expect(post).not.toHaveBeenCalled();
  const accept = { types: ["image/*"], maxBytes: 5 };
  expect((await guarded.getMedia(url, accept, child)).data.type).toBe("image/png");
  await guarded.getMedia(url, accept, sessionA);
  expect(ask).not.toHaveBeenCalled();
  await guarded.getMedia(url, accept, sessionB);
  await guarded.deleteMedia(url, sessionB);
  expect(ask).toHaveBeenCalledTimes(2);
  expect(get).not.toHaveBeenCalled();
  expect(discover).not.toHaveBeenCalled();
  await expect(graffiti.getMedia(url, {}, session)).rejects.toThrow();
  const next = await guarded.postMedia({ data: new Blob(["image"], { type: "image/png" }), allowed: [] }, child);
  await guarded.deleteMedia(next, sessionA);
  expect(ask).toHaveBeenCalledTimes(2);
});

it("passes limits through unchanged, reads once, and releases private bytes only after approval", async () => {
  const { graffiti, ask, guarded } = harness();
  const url = await guarded.postMedia({ data: new Blob(["image"], { type: "image/png" }), allowed: [] }, sessionA);
  const getMedia = vi.spyOn(graffiti, "getMedia");
  await expect(guarded.getMedia(url, { maxBytes: 0 }, sessionB)).rejects.toBeInstanceOf(GraffitiErrorTooLarge);
  expect(getMedia).toHaveBeenCalledExactlyOnceWith(url, { maxBytes: 0 }, session);
  getMedia.mockClear();
  await expect(guarded.getMedia(url, { types: ["text/plain"] }, sessionB)).rejects.toBeInstanceOf(GraffitiErrorNotAcceptable);
  expect(getMedia).toHaveBeenCalledExactlyOnceWith(url, { types: ["text/plain"] }, session);
  expect(ask).not.toHaveBeenCalled();
  getMedia.mockClear();
  const accept = { maxBytes: 5, types: ["image/png"] };
  ask.mockResolvedValueOnce({ allow: false, remember: false });
  await expect(guarded.getMedia(url, accept, sessionB)).rejects.toBeInstanceOf(GraffitiErrorForbidden);
  expect(getMedia).toHaveBeenCalledExactlyOnceWith(url, accept, session);
  getMedia.mockClear();
  const result = await guarded.getMedia(url, accept, sessionB);
  expect(getMedia).toHaveBeenCalledExactlyOnceWith(url, accept, session);
  expect(await result.data.text()).toBe("image");
  expect(result.data.type).toBe("image/png");
  expect(ask).toHaveBeenCalledTimes(2);
});

it("still requires approval after a URL addendum is removed or changed", async () => {
  const { guarded, ask } = harness();
  const url = await guarded.postMedia({ data: new Blob(["image"], { type: "image/png" }), allowed: [] }, sessionA);
  ask.mockResolvedValue({ allow: false, remember: false });
  for (const candidate of [url, `${url}?other.layer=x`, `${url}#other.layer=y`]) {
    await expect(guarded.getMedia(candidate, {}, sessionB)).rejects.toBeInstanceOf(GraffitiErrorForbidden);
    await expect(guarded.deleteMedia(candidate, sessionB)).rejects.toBeInstanceOf(GraffitiErrorForbidden);
  }
  expect(ask).toHaveBeenCalledTimes(6);
});

it("uses the same site-read rule for an allowed recipient and still enforces the allowed list", async () => {
  const { guarded, ask } = harness();
  const recipient = { actor: "did:example:recipient", source: sourceB };
  const url = await guarded.postMedia({ data: new Blob(["image"], { type: "image/png" }), allowed: [recipient.actor] }, sessionA);
  await expect(guarded.getMedia(url, {}, { actor: "did:example:stranger", source: sourceB })).rejects.toThrow();
  expect(ask).not.toHaveBeenCalled();
  await guarded.getMedia(url, {}, recipient);
  expect(ask).toHaveBeenCalledOnce();
});

it.each([undefined, [] as string[], ["did:example:recipient"]])(
  "reads and deletes unstamped media without prompting (%j)", async allowed => {
    const { graffiti, guarded, ask } = harness();
    const url = await graffiti.postMedia({ data: new Blob(["unstamped"]), allowed }, session);
    await guarded.getMedia(url, {}, sessionB);
    if (allowed?.length) {
      const recipient = { actor: allowed[0], source: sourceB };
      await guarded.getMedia(url, {}, recipient);
    }
    await guarded.deleteMedia(url, sessionB);
    expect(ask).not.toHaveBeenCalled();
  },
);

it("reads stamped public media without login or a prompt", async () => {
  const { guarded, ask } = harness();
  const publicUrl = await guarded.postMedia({ data: new Blob(["public"], { type: "text/plain" }) }, sessionA);
  expect(await (await guarded.getMedia(publicUrl, {})).data.text()).toBe("public");
  expect(ask).not.toHaveBeenCalled();
});

it("keeps backing objects behind the media guard path", async () => {
  const { guarded, ask } = harness();
  const url = await guarded.postMedia({ data: new Blob(["image"], { type: "image/png" }), allowed: [] }, sessionA);
  await expect(guarded.get(url, {}, sessionB)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  await expect(guarded.delete(url, sessionB)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  expect(ask).not.toHaveBeenCalled();
});

it("cannot forge media provenance through an ordinary post", async () => {
  const { guarded, ask } = harness();
  const claimedType = stampMedia(new Blob(["fake"], { type: "image/png" }), source).type;
  const object = await guarded.post({
    value: {
      kind: "media",
      type: claimedType,
      size: 4,
      dataBase64: `data:${claimedType};base64,${Buffer.from("fake").toString("base64")}`,
    },
    channels: [],
    allowed: [],
  }, sessionB);
  await expect(guarded.getMedia(object.url, {}, sessionA)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  await expect(guarded.deleteMedia(object.url, sessionB)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  expect((await guarded.get(object.url, {}, sessionB)).value).toMatchObject({ kind: "media" });
  expect(ask).not.toHaveBeenCalled();
});
