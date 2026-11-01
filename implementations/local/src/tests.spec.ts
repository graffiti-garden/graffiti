import {
  graffitiCRUDTests,
  graffitiDiscoverTests,
  graffitiMediaTests,
} from "@graffiti-garden/api/tests";
import { expect, test } from "vitest";
import { GraffitiLocal } from "./index";
import { GraffitiErrorNotFound, GraffitiErrorTooLarge } from "@graffiti-garden/api";
import { GraffitiLocalObjects } from "./objects";
import { stripGraffitiUrlAddendums } from "./utilities";

const useGraffiti = () => new GraffitiLocal();
const useSession1 = () => ({ actor: "did:example:someone" });
const useSession2 = () => ({ actor: "did:example:someoneelse" });

graffitiCRUDTests(useGraffiti, useSession1, useSession2);
graffitiDiscoverTests(useGraffiti, useSession1, useSession2);
graffitiMediaTests(useGraffiti, useSession1, useSession2);

test("accepts layered Graffiti URL addendums for object and media lookups and deletion", async () => {
  const graffiti = useGraffiti();
  const session = useSession1();
  const object = await graffiti.post(
    { value: { text: "layered URL" }, channels: ["test:addendums"] },
    session,
  );
  const objectUrl = `${object.url}#first.layer=one?second.layer=one%3Ftwo`;
  expect((await graffiti.get({ url: objectUrl }, {}, session)).url).toBe(object.url);
  expect((await graffiti.delete(objectUrl, session)).url).toBe(object.url);

  const mediaUrl = await graffiti.postMedia(
    { data: new Blob(["media data"], { type: "text/plain" }), allowed: [] },
    session,
  );
  const layeredMediaUrl = `${mediaUrl}?first.layer=one#second.layer=two?third.layer=three`;
  await expect((await graffiti.getMedia(layeredMediaUrl, {}, session)).data.text()).resolves.toBe("media data");
  await expect(graffiti.deleteMedia(layeredMediaUrl, session)).resolves.toBeUndefined();

  expect(stripGraffitiUrlAddendums("https://example.com/image?size=large")).toBe(
    "https://example.com/image?size=large",
  );
  expect(stripGraffitiUrlAddendums("https://example.com/image#preview")).toBe(
    "https://example.com/image#preview",
  );
});

test("honors a zero-byte media limit without decoding nonempty data", async () => {
  const graffiti = useGraffiti();
  const session = useSession1();
  const url = await graffiti.postMedia({ data: new Blob(["image"]) }, session);
  await expect(graffiti.getMedia(url, { maxBytes: 0 }, session))
    .rejects.toBeInstanceOf(GraffitiErrorTooLarge);

  const emptyUrl = await graffiti.postMedia({ data: new Blob([], { type: "text/plain" }) }, session);
  expect((await graffiti.getMedia(emptyUrl, { maxBytes: 0 }, session)).data.size).toBe(0);
});

test("preserves MIME parameters while matching exact types and wildcards", async () => {
  const graffiti = useGraffiti();
  const session = useSession1();
  const original = new Blob(["image"], { type: 'image/png; label="a,b;c"; custom=abcdef' });
  const url = await graffiti.postMedia({ data: original }, session);
  for (const type of ["image/png", "image/*", "*/*"]) {
    const { data } = await graffiti.getMedia(url, { types: [type], maxBytes: 5 }, session);
    expect(data.type).toBe(original.type);
    expect(await data.text()).toBe("image");
  }
});

test("keeps new media records separate from ordinary objects", async () => {
  const graffiti = useGraffiti();
  const session = useSession1();
  const url = await graffiti.postMedia({ data: new Blob(["image"]) }, session);
  await expect(graffiti.get(url, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  await expect(graffiti.delete(url, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  expect(await (await graffiti.getMedia(url, {}, session)).data.text()).toBe("image");

  const object = await graffiti.post({
    value: { kind: "media", dataBase64: "data:;base64,aW1hZ2U=", size: 5, type: "image/png" },
    channels: [],
  }, session);
  await expect(graffiti.getMedia(object.url, {}, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  await expect(graffiti.deleteMedia(object.url, session)).rejects.toBeInstanceOf(GraffitiErrorNotFound);
  expect(await graffiti.get(object.url, {}, session)).toEqual(object);
  await graffiti.delete(object.url, session);
  await graffiti.deleteMedia(url, session);
});

test("reads and deletes legacy objects and media without a stored kind", async () => {
  const graffiti = useGraffiti();
  const session = useSession1();
  const object = await graffiti.post({ value: { text: "old note" }, channels: [] }, session);
  const url = await graffiti.postMedia({ data: new Blob(["old image"]), allowed: [] }, session);
  const db = await new GraffitiLocalObjects().db;
  for (const id of [object.url, url]) {
    const record = await db.get(id);
    delete record.kind;
    await db.put(record);
  }
  expect(await graffiti.get(object.url, {}, session)).toEqual(object);
  expect(await (await graffiti.getMedia(url, {}, session)).data.text()).toBe("old image");
  await graffiti.delete(object.url, session);
  await graffiti.deleteMedia(url, session);
});
