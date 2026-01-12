import {
  GraffitiErrorNotAcceptable,
  GraffitiErrorNotFound,
  GraffitiErrorTooLarge,
  type Graffiti,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { it, expect, describe, beforeAll } from "vitest";
import { randomString } from "./utils";

export const graffitiMediaTests = (
  useGraffiti: () => Pick<Graffiti, "postMedia" | "getMedia" | "deleteMedia">,
  useSession1: () => GraffitiSession | Promise<GraffitiSession>,
  useSession2: () => GraffitiSession | Promise<GraffitiSession>,
) => {
  describe.concurrent(
    "media",
    {
      timeout: 20000,
    },
    () => {
      let graffiti: ReturnType<typeof useGraffiti>;
      let session: GraffitiSession;
      let session1: GraffitiSession;
      let session2: GraffitiSession;
      beforeAll(async () => {
        graffiti = useGraffiti();
        session1 = await useSession1();
        session = session1;
        session2 = await useSession2();
      });

      it("post, get, delete media", async () => {
        // Post media
        const text = randomString();
        const data = new Blob([text], { type: "text/plain" });
        const mediaUrl = await graffiti.postMedia({ data }, session);

        // Get the media back
        const media = await graffiti.getMedia(mediaUrl, {});
        expect(await media.data.text()).toEqual(text);
        expect(media.data.type).toEqual("text/plain");
        expect(media.allowed).toBeUndefined();
        expect(media.actor).toBe(session.actor);

        // Delete the media
        await graffiti.deleteMedia(mediaUrl, session);

        // Try to get the media again
        await expect(graffiti.getMedia(mediaUrl, {})).rejects.toThrow(
          GraffitiErrorNotFound,
        );
      });

      it("acceptable type", async () => {
        const text = randomString();
        const data = new Blob([text], { type: "text/plain" });
        const mediaUrl = await graffiti.postMedia({ data }, session);

        const media = await graffiti.getMedia(mediaUrl, {
          types: ["application/json", "text/*"],
        });
        expect(await media.data.text()).toEqual(text);
        expect(media.data.type).toEqual("text/plain");
        expect(media.allowed).toBeUndefined();
        expect(media.actor).toBe(session.actor);
      });

      it("unacceptable type", async () => {
        const text = randomString();
        const data = new Blob([text], { type: "text/plain" });
        const mediaUrl = await graffiti.postMedia({ data }, session);

        await expect(
          graffiti.getMedia(mediaUrl, {
            types: ["image/*"],
          }),
        ).rejects.toThrow(GraffitiErrorNotAcceptable);
      });

      it("acceptable size", async () => {
        const text = randomString();
        const data = new Blob([text], { type: "text/plain" });
        const mediaUrl = await graffiti.postMedia({ data }, session);

        const media = await graffiti.getMedia(mediaUrl, {
          maxBytes: data.size,
        });
        expect(await media.data.text()).toEqual(text);
        expect(media.data.type).toEqual("text/plain");
        expect(media.allowed).toBeUndefined();
        expect(media.actor).toBe(session.actor);
      });

      it("unacceptable size", async () => {
        const text = randomString();
        const data = new Blob([text], { type: "text/plain" });
        const mediaUrl = await graffiti.postMedia({ data }, session);

        await expect(
          graffiti.getMedia(mediaUrl, {
            maxBytes: data.size - 1,
          }),
        ).rejects.toThrow(GraffitiErrorTooLarge);
      });

      it("empty allowed", async () => {
        const text = randomString();
        const data = new Blob([text], { type: "text/plain" });
        const allowed: string[] = [];
        const mediaUrl = await graffiti.postMedia({ data, allowed }, session1);

        // Get it with the authorized user
        const media = await graffiti.getMedia(mediaUrl, {}, session1);
        expect(await media.data.text()).toEqual(text);
        expect(media.data.type).toEqual("text/plain");
        expect(media.allowed).toEqual([]);
        expect(media.actor).toBe(session1.actor);

        // Get it with the unauthorized user
        await expect(graffiti.getMedia(mediaUrl, {}, session2)).rejects.toThrow(
          GraffitiErrorNotFound,
        );

        // Get it without authorization
        await expect(graffiti.getMedia(mediaUrl, {})).rejects.toThrow(
          GraffitiErrorNotFound,
        );
      });

      it("allowed", async () => {
        const text = randomString();
        const data = new Blob([text], { type: "text/plain" });
        const allowed = [randomString(), session2.actor, randomString()];
        const mediaUrl = await graffiti.postMedia({ data, allowed }, session1);

        // Get it with the authorized user
        const media = await graffiti.getMedia(mediaUrl, {}, session1);
        expect(await media.data.text()).toEqual(text);
        expect(media.data.type).toEqual("text/plain");
        expect(media.allowed).toEqual(allowed);
        expect(media.actor).toBe(session1.actor);

        // Get it with the allowed user
        const media2 = await graffiti.getMedia(mediaUrl, {}, session2);
        expect(await media2.data.text()).toEqual(text);
        expect(media2.data.type).toEqual("text/plain");
        expect(media2.allowed).toEqual([session2.actor]);
        expect(media2.actor).toBe(session1.actor);

        // Get it without authorization
        await expect(graffiti.getMedia(mediaUrl, {})).rejects.toThrow(
          GraffitiErrorNotFound,
        );
      });
    },
  );
};
