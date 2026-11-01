import {
  graffitiCRUDTests,
  graffitiDiscoverTests,
  graffitiMediaTests,
} from "@graffiti-garden/api/tests";
import { expect, test } from "vitest";
import { GraffitiLocal } from "./index";
import { GraffitiErrorTooLarge } from "@graffiti-garden/api";
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
