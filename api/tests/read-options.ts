import { expect, it } from "vitest";
import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import { randomString } from "./utils.js";

/** Keep legacy sessions covered here; ordinary conformance tests use options. */
export function graffitiLegacyReadSessionTests(
  useGraffiti: () => Graffiti,
  useSession: () => GraffitiSession | Promise<GraffitiSession>,
) {
  it("accepts legacy positional sessions in all four read methods", async () => {
    const graffiti = useGraffiti();
    const session = await useSession();
    const channels = [randomString()];
    const object = await graffiti.post({ value: {}, channels, allowed: [] }, session);
    const mediaUrl = await graffiti.postMedia({ data: new Blob(["private"]), allowed: [] }, session);
    try {
      expect(await graffiti.get(object.url, {}, session)).toEqual(object);
      expect(await (await graffiti.getMedia(mediaUrl, {}, session)).data.text()).toBe("private");
      const stream = graffiti.discover<{}>(channels, {}, session);
      expect(await stream.next()).toMatchObject({ done: false, value: { object: { url: object.url } } });
      const end = await stream.next();
      expect(end.done).toBe(true);
      if (!end.done) throw new Error("Expected discovery to finish");
      await graffiti.delete(object.url, session);
      const continuation = graffiti.continueDiscover<{}>(end.value.cursor, session);
      try {
        expect(await continuation.next()).toMatchObject({
          done: false, value: { tombstone: true, object: { url: object.url } },
        });
      } finally {
        await continuation.return({ cursor: "" });
      }
    } finally {
      await graffiti.deleteMedia(mediaUrl, session);
    }
  }, 20_000);
}
