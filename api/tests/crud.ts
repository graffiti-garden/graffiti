import { it, expect, describe, beforeAll } from "vitest";
import type {
  Graffiti,
  GraffitiSession,
  GraffitiPatch,
  JSONSchema,
} from "@graffiti-garden/api";
import type { FromSchema } from "json-schema-to-ts";
import {
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorInvalidSchema,
  GraffitiErrorForbidden,
  GraffitiErrorPatchTestFailed,
  GraffitiErrorPatchError,
} from "@graffiti-garden/api";
import { randomPutObject, randomString } from "./utils";

export const graffitiCRUDTests = (
  useGraffiti: () => Pick<Graffiti, "put" | "get" | "delete" | "patch">,
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

      it("put, get, delete", async () => {
        const value = {
          something: "hello, world~ c:",
        };
        const channels = [randomString(), randomString()];

        // Put the object
        const previous = await graffiti.put<{}>({ value, channels }, session);
        expect(previous.value).toEqual({});
        expect(previous.channels).toEqual([]);
        expect(previous.allowed).toEqual([]);
        expect(previous.actor).toEqual(session.actor);

        // Get it back
        const gotten = await graffiti.get(previous, {});
        expect(gotten.value).toEqual(value);
        expect(gotten.channels).toEqual([]);
        expect(gotten.allowed).toBeUndefined();
        expect(gotten.uri).toEqual(previous.uri);
        expect(gotten.actor).toEqual(previous.actor);
        expect(gotten.lastModified).toEqual(previous.lastModified);

        // Replace it
        const newValue = {
          something: "goodbye, world~ :c",
        };
        const beforeReplaced = await graffiti.put<{}>(
          {
            uri: previous.uri,
            value: newValue,
            channels: [],
          },
          session,
        );
        expect(beforeReplaced.value).toEqual(value);
        expect(beforeReplaced.tombstone).toEqual(true);
        expect(beforeReplaced.uri).toEqual(previous.uri);
        expect(beforeReplaced.actor).toEqual(previous.actor);
        expect(beforeReplaced.lastModified).toBeGreaterThanOrEqual(
          gotten.lastModified,
        );

        // Get it again
        const afterReplaced = await graffiti.get(previous, {});
        expect(afterReplaced.value).toEqual(newValue);
        expect(afterReplaced.lastModified).toEqual(beforeReplaced.lastModified);
        expect(afterReplaced.tombstone).toEqual(false);

        // Delete it
        const beforeDeleted = await graffiti.delete(afterReplaced, session);
        expect(beforeDeleted.tombstone).toEqual(true);
        expect(beforeDeleted.value).toEqual(newValue);
        expect(beforeDeleted.lastModified).toBeGreaterThanOrEqual(
          beforeReplaced.lastModified,
        );

        // Get a tombstone
        const final = await graffiti.get(afterReplaced, {});
        expect(final).toEqual(beforeDeleted);
      });

      it("put, get, delete with wrong actor", async () => {
        await expect(
          graffiti.put<{}>(
            { value: {}, channels: [], actor: session2.actor },
            session1,
          ),
        ).rejects.toThrow(GraffitiErrorForbidden);

        const putted = await graffiti.put<{}>(
          { value: {}, channels: [] },
          session2,
        );

        await expect(graffiti.delete(putted, session1)).rejects.toThrow(
          GraffitiErrorForbidden,
        );

        await expect(graffiti.patch({}, putted, session1)).rejects.toThrow(
          GraffitiErrorForbidden,
        );
      });

      it("put and get with schema", async () => {
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

        const putted = await graffiti.put<typeof schema>(
          {
            value: goodValue,
            channels: [],
          },
          session,
        );
        const gotten = await graffiti.get(putted, schema);

        expect(gotten.value.something).toEqual(goodValue.something);
        expect(gotten.value.another).toEqual(goodValue.another);
        expect(gotten.value.another[0]).toEqual(1);
        expect(gotten.value.deeper.deepProp).toEqual(goodValue.deeper.deepProp);
      });

      it("put and get with invalid schema", async () => {
        const putted = await graffiti.put<{}>(
          { value: {}, channels: [] },
          session,
        );
        await expect(
          graffiti.get(putted, {
            properties: {
              value: {
                //@ts-ignore
                type: "asdf",
              },
            },
          }),
        ).rejects.toThrow(GraffitiErrorInvalidSchema);
      });

      it("put and get with wrong schema", async () => {
        const putted = await graffiti.put<{}>(
          {
            value: {
              hello: "world",
            },
            channels: [],
          },
          session,
        );

        await expect(
          graffiti.get(putted, {
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

      it("put and get with empty access control", async () => {
        const value = {
          um: "hi",
        };
        const allowed = [randomString()];
        const channels = [randomString()];
        const putted = await graffiti.put<{}>(
          { value, allowed, channels },
          session1,
        );

        // Get it with authenticated session
        const gotten = await graffiti.get(putted, {}, session1);
        expect(gotten.value).toEqual(value);
        expect(gotten.allowed).toEqual(allowed);
        expect(gotten.channels).toEqual(channels);

        // But not without session
        await expect(graffiti.get(putted, {})).rejects.toBeInstanceOf(
          GraffitiErrorNotFound,
        );

        // Or the wrong session
        await expect(graffiti.get(putted, {}, session2)).rejects.toBeInstanceOf(
          GraffitiErrorNotFound,
        );
      });

      it("put and get with specific access control", async () => {
        const value = {
          um: "hi",
        };
        const allowed = [randomString(), session2.actor, randomString()];
        const channels = [randomString()];
        const putted = await graffiti.put<{}>(
          {
            value,
            allowed,
            channels,
          },
          session1,
        );

        // Get it with authenticated session
        const gotten = await graffiti.get(putted, {}, session1);
        expect(gotten.value).toEqual(value);
        expect(gotten.allowed).toEqual(allowed);
        expect(gotten.channels).toEqual(channels);

        // But not without session
        await expect(graffiti.get(putted, {})).rejects.toBeInstanceOf(
          GraffitiErrorNotFound,
        );

        const gotten2 = await graffiti.get(putted, {}, session2);
        expect(gotten2.value).toEqual(value);
        // They should only see that is is private to them
        expect(gotten2.allowed).toEqual([session2.actor]);
        // And not see any channels
        expect(gotten2.channels).toEqual([]);
      });

      it("patch value", async () => {
        const value = {
          something: "hello, world~ c:",
        };
        const putted = await graffiti.put<{}>({ value, channels: [] }, session);

        // Wait just a bit to make sure the lastModified is different
        await new Promise((resolve) => setTimeout(resolve, 10));

        const patch: GraffitiPatch = {
          value: [
            { op: "replace", path: "/something", value: "goodbye, world~ :c" },
          ],
        };
        const beforePatched = await graffiti.patch(patch, putted, session);
        expect(beforePatched.value).toEqual(value);
        expect(beforePatched.tombstone).toBe(true);
        expect(beforePatched.lastModified).toBeGreaterThan(putted.lastModified);

        const gotten = await graffiti.get(putted, {});
        expect(gotten.value).toEqual({
          something: "goodbye, world~ :c",
        });
        expect(beforePatched.lastModified).toBe(gotten.lastModified);

        await graffiti.delete(putted, session);
      });

      it("patch deleted object", async () => {
        const putted = await graffiti.put<{}>(randomPutObject(), session);
        const deleted = await graffiti.delete(putted, session);
        await expect(
          graffiti.patch({}, putted, session),
        ).rejects.toBeInstanceOf(GraffitiErrorNotFound);
      });

      it("deep patch", async () => {
        const value = {
          something: {
            another: {
              somethingElse: "hello",
            },
          },
        };
        const putted = await graffiti.put<{}>(
          { value: value, channels: [] },
          session,
        );

        const beforePatch = await graffiti.patch(
          {
            value: [
              {
                op: "replace",
                path: "/something/another/somethingElse",
                value: "goodbye",
              },
            ],
          },
          putted,
          session,
        );
        const gotten = await graffiti.get(putted, {});

        expect(beforePatch.value).toEqual(value);
        expect(gotten.value).toEqual({
          something: {
            another: {
              somethingElse: "goodbye",
            },
          },
        });
      });

      it("patch channels", async () => {
        const channelsBefore = [randomString()];
        const channelsAfter = [randomString()];

        const putted = await graffiti.put<{}>(
          { value: {}, channels: channelsBefore },
          session,
        );

        const patch: GraffitiPatch = {
          channels: [{ op: "replace", path: "/0", value: channelsAfter[0] }],
        };
        const patched = await graffiti.patch(patch, putted, session);
        expect(patched.channels).toEqual(channelsBefore);
        const gotten = await graffiti.get(putted, {}, session);
        expect(gotten.channels).toEqual(channelsAfter);
        await graffiti.delete(putted, session);
      });

      it("patch 'increment' with test", async () => {
        const putted = await graffiti.put<{}>(
          {
            value: {
              counter: 1,
            },
            channels: [],
          },
          session,
        );

        const previous = await graffiti.patch(
          {
            value: [
              { op: "test", path: "/counter", value: 1 },
              { op: "replace", path: "/counter", value: 2 },
            ],
          },
          putted,
          session,
        );
        expect(previous.value).toEqual({ counter: 1 });
        const result = await graffiti.get(previous, {
          properties: {
            value: {
              properties: {
                counter: {
                  type: "integer",
                },
              },
            },
          },
        });
        expect(result.value.counter).toEqual(2);

        await expect(
          graffiti.patch(
            {
              value: [
                { op: "test", path: "/counter", value: 1 },
                { op: "replace", path: "/counter", value: 3 },
              ],
            },
            putted,
            session,
          ),
        ).rejects.toThrow(GraffitiErrorPatchTestFailed);
      });

      it("invalid patch", async () => {
        const object = randomPutObject();
        const putted = await graffiti.put<{}>(object, session);

        await expect(
          graffiti.patch(
            {
              value: [
                { op: "add", path: "/root", value: [] },
                { op: "add", path: "/root/2", value: 2 }, // out of bounds
              ],
            },
            putted,
            session,
          ),
        ).rejects.toThrow(GraffitiErrorPatchError);
      });

      it("patch channels to be wrong", async () => {
        const object = randomPutObject();
        object.allowed = [randomString()];
        const putted = await graffiti.put<{}>(object, session);

        const patches: GraffitiPatch[] = [
          {
            channels: [{ op: "replace", path: "", value: null }],
          },
          {
            channels: [{ op: "replace", path: "", value: {} }],
          },
          {
            channels: [{ op: "replace", path: "", value: ["hello", ["hi"]] }],
          },
          {
            channels: [{ op: "add", path: "/0", value: 1 }],
          },
          {
            value: [{ op: "replace", path: "", value: "not an object" }],
          },
          {
            value: [{ op: "replace", path: "", value: null }],
          },
          {
            value: [{ op: "replace", path: "", value: [] }],
          },
          {
            allowed: [{ op: "replace", path: "", value: {} }],
          },
          {
            allowed: [{ op: "replace", path: "", value: ["hello", ["hi"]] }],
          },
        ];

        for (const patch of patches) {
          await expect(graffiti.patch(patch, putted, session)).rejects.toThrow(
            GraffitiErrorPatchError,
          );
        }

        const gotten = await graffiti.get(putted, {}, session);
        expect(gotten.value).toEqual(object.value);
        expect(gotten.channels).toEqual(object.channels);
        expect(gotten.allowed).toEqual(object.allowed);
        expect(gotten.lastModified).toEqual(putted.lastModified);
      });
    },
  );
};
