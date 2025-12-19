import { it, expect, describe, beforeAll } from "vitest";
import type {
  Graffiti,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import {
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorInvalidSchema,
  GraffitiErrorForbidden,
} from "@graffiti-garden/api";
import { randomPostObject, randomString } from "./utils";

export const graffitiCRUDTests = (
  useGraffiti: () => Pick<Graffiti, "post" | "get" | "delete">,
  useSession1: () => GraffitiSession | Promise<GraffitiSession>,
  useSession2: () => GraffitiSession | Promise<GraffitiSession>,
) => {
  describe.concurrent(
    "CRUD",
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

      it("get nonexistant object", async () => {
        await expect(graffiti.get(randomString(), {})).rejects.toThrow(
          GraffitiErrorNotFound,
        );
      });

      it("post, get, delete", async () => {
        const value = {
          something: "hello, world~ c:",
        };
        const channels = [randomString(), randomString()];

        // Post the object
        const previous = await graffiti.post<{}>({ value, channels }, session);
        expect(previous.value).toEqual(value);
        expect(previous.channels).toEqual(channels);
        expect(previous.allowed).toEqual(undefined);
        expect(previous.actor).toEqual(session.actor);

        // Get it back
        const gotten = await graffiti.get(previous, {});
        expect(gotten.value).toEqual(value);
        expect(gotten.channels).toEqual([]);
        expect(gotten.allowed).toBeUndefined();
        expect(gotten.url).toEqual(previous.url);
        expect(gotten.actor).toEqual(previous.actor);

        // Delete it
        await graffiti.delete(gotten, session);

        // Get is not found
        await expect(graffiti.get(gotten, {})).rejects.toBeInstanceOf(
          GraffitiErrorNotFound,
        );

        // Delete it again
        await expect(graffiti.delete(gotten, session)).rejects.toThrow(
          GraffitiErrorNotFound,
        );
      });

      it("post then delete with wrong actor", async () => {
        const posted = await graffiti.post<{}>(
          { value: {}, channels: [] },
          session2,
        );

        await expect(graffiti.delete(posted, session1)).rejects.toThrow(
          GraffitiErrorForbidden,
        );
      });

      it("post and get with schema", async () => {
        const schema = {
          properties: {
            value: {
              properties: {
                something: {
                  type: "string",
                },
                another: {
                  type: "array",
                  items: {
                    type: "number",
                  },
                },
                deeper: {
                  type: "object",
                  properties: {
                    deepProp: {
                      type: "string",
                    },
                  },
                  required: ["deepProp"],
                },
              },
              required: ["another", "deeper"],
            },
          },
        } as const satisfies JSONSchema;

        const goodValue = {
          something: "hello",
          another: [1, 2, 3],
          deeper: {
            deepProp: "hello",
          },
        };

        const posted = await graffiti.post<typeof schema>(
          {
            value: goodValue,
            channels: [],
          },
          session,
        );
        const gotten = await graffiti.get(posted, schema);

        expect(gotten.value.something).toEqual(goodValue.something);
        expect(gotten.value.another).toEqual(goodValue.another);
        expect(gotten.value.another[0]).toEqual(1);
        expect(gotten.value.deeper.deepProp).toEqual(goodValue.deeper.deepProp);
      });

      it("post and get with invalid schema", async () => {
        const posted = await graffiti.post<{}>(
          { value: {}, channels: [] },
          session,
        );
        await expect(
          graffiti.get(posted, {
            properties: {
              value: {
                //@ts-ignore
                type: "asdf",
              },
            },
          }),
        ).rejects.toThrow(GraffitiErrorInvalidSchema);
      });

      it("post and get with wrong schema", async () => {
        const posted = await graffiti.post<{}>(
          {
            value: {
              hello: "world",
            },
            channels: [],
          },
          session,
        );

        await expect(
          graffiti.get(posted, {
            properties: {
              value: {
                properties: {
                  hello: {
                    type: "number",
                  },
                },
              },
            },
          }),
        ).rejects.toThrow(GraffitiErrorSchemaMismatch);
      });

      it("post and get with empty access control", async () => {
        const value = {
          um: "hi",
        };
        const allowed = [randomString()];
        const channels = [randomString()];
        const posted = await graffiti.post<{}>(
          { value, allowed, channels },
          session1,
        );

        // Get it with authenticated session
        const gotten = await graffiti.get(posted, {}, session1);
        expect(gotten.url).toEqual(posted.url);
        expect(gotten.actor).toEqual(session1.actor);
        expect(gotten.value).toEqual(value);
        expect(gotten.allowed).toEqual(allowed);
        expect(gotten.channels).toEqual(channels);

        // But not without session
        await expect(graffiti.get(posted, {})).rejects.toBeInstanceOf(
          GraffitiErrorNotFound,
        );

        // Or the wrong session
        await expect(graffiti.get(posted, {}, session2)).rejects.toBeInstanceOf(
          GraffitiErrorNotFound,
        );
      });

      it("post and get with specific access control", async () => {
        const value = {
          um: "hi",
        };
        const allowed = [randomString(), session2.actor, randomString()];
        const channels = [randomString()];
        const posted = await graffiti.post<{}>(
          {
            value,
            allowed,
            channels,
          },
          session1,
        );

        // Get it with authenticated session
        const gotten = await graffiti.get(posted, {}, session1);
        expect(gotten.url).toEqual(posted.url);
        expect(gotten.actor).toEqual(session1.actor);
        expect(gotten.value).toEqual(value);
        expect(gotten.allowed).toEqual(allowed);
        expect(gotten.channels).toEqual(channels);

        // But not without session
        await expect(graffiti.get(posted, {})).rejects.toBeInstanceOf(
          GraffitiErrorNotFound,
        );

        const gotten2 = await graffiti.get(posted, {}, session2);
        expect(gotten.url).toEqual(posted.url);
        expect(gotten.actor).toEqual(session1.actor);
        expect(gotten2.value).toEqual(value);
        // They should only see that is is private to them
        expect(gotten2.allowed).toEqual([session2.actor]);
        // And not see any channels
        expect(gotten2.channels).toEqual([]);
      });
    },
  );
};
