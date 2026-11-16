import { afterEach, describe, expect, test, vi } from "vitest";
import { GraffitiErrorCursorExpired, type GraffitiObjectStream, type JSONSchema } from "@graffiti-garden/api";
import { GraffitiDecentralized } from "./4-graffiti";

const inboxEndpoint = "https://example.test/inbox";
const channel = "discovery-cursors";
class CursorGraffiti extends GraffitiDecentralized {
  get inboxService() { return this.inboxHistory; }
}
async function finishDiscovery(stream: GraffitiObjectStream<{}>) {
  while (true) {
    const next = await stream.next();
    if (next.done) return next.value.cursor;
  }
}

export function discoveryCursorTests() {
  describe("Discovery cursors", () => {
    afterEach(() => vi.restoreAllMocks());

    test.each([
      { schema: { properties: { value: { required: ["text"] } } } },
      { schema: false },
      { schema: true },
    ])("retries a failed inbox with the original schema $schema", async ({ schema }) => {
      const graffiti = new CursorGraffiti({ defaultInboxEndpoints: [inboxEndpoint] });
      const failure = new Error("Inbox unavailable");
      const query = vi.spyOn(graffiti.inboxService, "query")
        .mockImplementationOnce(async function* () { throw failure; })
        .mockImplementation(async function* () { return "completed"; });

      const initial = graffiti.discover<JSONSchema>([channel], schema);
      expect((await initial.next()).value).toEqual({ error: failure, origin: inboxEndpoint });
      const cursor = await finishDiscovery(initial);
      await finishDiscovery(graffiti.continueDiscover(cursor));

      expect(query).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenLastCalledWith(inboxEndpoint, expect.any(Array), schema, undefined, { refresh: true });
      expect(JSON.parse(cursor).schema).toEqual(schema);
    });

    test.each([
      { checkpoint: "missing", cursors: {} },
      { checkpoint: "present", cursors: { [inboxEndpoint]: "previous" } },
    ])("expires a cursor without a schema even when its checkpoint is $checkpoint", async ({ cursors }) => {
      const graffiti = new CursorGraffiti({ defaultInboxEndpoints: [inboxEndpoint] });
      const query = vi.spyOn(graffiti.inboxService, "query")
        .mockImplementation(async function* () { return "unfiltered"; });
      const continueQuery = vi.spyOn(graffiti.inboxService, "continueQuery")
        .mockImplementation(async function* () { return "continued"; });
      const legacyCursor = JSON.stringify({ channels: [channel], cursors });

      await expect(finishDiscovery(graffiti.continueDiscover(legacyCursor)))
        .rejects.toBeInstanceOf(GraffitiErrorCursorExpired);
      expect(query).not.toHaveBeenCalled();
      expect(continueQuery).not.toHaveBeenCalled();
    });
  });
}
