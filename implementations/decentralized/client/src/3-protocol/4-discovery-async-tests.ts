import { afterEach, describe, expect, test, vi } from "vitest";
import { GraffitiErrorCursorExpired, GraffitiErrorInvalidSchema, type GraffitiObject, type JSONSchema } from "@graffiti-garden/api";
import { GraffitiDecentralized } from "./4-graffiti";

const inboxEndpoint = "https://example.test/inbox";
const channel = "discovery-prefetch";
const object = {
  url: "graffiti:example", actor: "did:example:actor",
  channels: [channel], value: { text: "First result" },
};

class PrefetchGraffiti extends GraffitiDecentralized {
  constructor(private readonly failure: Error) {
    super({ defaultInboxEndpoints: [inboxEndpoint] });
  }

  protected override async *querySingleEndpoint<Schema extends JSONSchema>(
    _endpoint: string,
    query: { tags: Uint8Array[]; objectSchema: Schema } | { cursor: string },
  ): AsyncGenerator<{
    messageId: string;
    object: GraffitiObject<Schema>;
    storageBucketKey: string;
    tags: Uint8Array[];
    allowedTickets: undefined;
  }, string> {
    yield {
      messageId: "announcement",
      object: object as GraffitiObject<Schema>,
      storageBucketKey: "key",
      tags: "tags" in query ? query.tags : [],
      allowedTickets: undefined,
    };
    throw this.failure;
  }
}

class CursorGraffiti extends GraffitiDecentralized {
  get inboxService() { return this.inboxes; }
}

class QueueGraffiti extends CursorGraffiti {
  override querySingleEndpoint = super.querySingleEndpoint;
  override processOneLabeledMessage = super.processOneLabeledMessage;
}

export function discoveryAsyncTests() {
  describe("Discovery validation queue", () => {
    afterEach(() => vi.restoreAllMocks());

    const message = {
      id: "announcement",
      l: 0,
      m: { o: object, t: [], m: new Uint8Array() },
    };
    const processed = {
      messageId: message.id,
      object,
      storageBucketKey: "key",
      tags: [],
      allowedTickets: undefined,
    };

    test.each(["first", "second"])(
      "handles the $0 queued rejection and throws when it is reached",
      async (failed) => {
        const graffiti = new QueueGraffiti();
        const failure = new Error("Validation read failed");
        vi.spyOn(graffiti.inboxService, "query").mockImplementation(async function* () {
          yield message;
          yield message;
          return "completed";
        });

        // Hold the first read open while the second settles. A rejection in
        // the second must be handled before the queue reaches it.
        let release!: () => void;
        const pending = new Promise<void>((resolve) => { release = resolve; });
        const process = vi.spyOn(graffiti, "processOneLabeledMessage")
          .mockImplementationOnce(async () => {
            await pending;
            if (failed === "first") throw failure;
            return processed;
          })
          .mockImplementationOnce(async () => {
            if (failed === "second") throw failure;
            return processed;
          });
        const stream = graffiti.querySingleEndpoint<{}>(inboxEndpoint, {
          tags: [], objectSchema: {},
        });
        const next = stream.next();
        try {
          await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(2));
          release();
          // Stop at the failed validation rather than draining later results.
          // Earlier successful validations can still be yielded normally.
          if (failed === "first") {
            await expect(next).rejects.toBe(failure);
          } else {
            expect(await next).toEqual({ done: false, value: processed });
            await expect(stream.next()).rejects.toBe(failure);
          }
          expect((await stream.next()).done).toBe(true);
        } finally {
          release();
          await stream.return("");
        }
      },
    );

    test.each([
      new Error("Inbox page unavailable"),
      new GraffitiErrorCursorExpired("Inbox cursor expired"),
    ])("immediately propagates an inbox $name with validations queued", async (failure) => {
      const graffiti = new QueueGraffiti();
      vi.spyOn(graffiti.inboxService, "query").mockImplementation(async function* () {
        yield message;
        yield message;
        throw failure;
      });
      // The abandoned validation must not produce an unhandled rejection.
      vi.spyOn(graffiti, "processOneLabeledMessage")
        .mockRejectedValueOnce(new Error("Validation read failed"))
        .mockResolvedValueOnce(processed);

      const stream = graffiti.querySingleEndpoint<{}>(inboxEndpoint, {
        tags: [], objectSchema: {},
      });
      try {
        // Source failures terminate immediately, without yielding queued results.
        await expect(stream.next()).rejects.toBe(failure);
        expect((await stream.next()).done).toBe(true);
      } finally {
        await stream.return("");
      }
    });
  });

  describe("Discovery prefetch", () => {
    test.each([
      new GraffitiErrorCursorExpired("Cursor expired during discovery"),
      new GraffitiErrorInvalidSchema("Invalid schema"),
    ].flatMap((error) => ["resume", "close"].map((action) => ({ error, action }))))(
      "handles a prefetched $error.name when the caller chooses to $action",
      async ({ error, action }) => {
        const stream = new PrefetchGraffiti(error).discover([channel], {});
        try {
          expect((await stream.next()).value).toEqual({ object });
          // Let the prefetched next() fail while the app handles the object.
          // Vitest must not see an unhandled rejection, even if the app stops.
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (action === "resume") {
            await expect(stream.next()).rejects.toBe(error);
          }
        } finally {
          await stream.return({ cursor: "" });
        }
      },
    );

    test("keeps ordinary endpoint errors in the discovery stream", async () => {
      const error = new Error("Inbox unavailable");
      const stream = new PrefetchGraffiti(error).discover([channel], {});
      try {
        expect((await stream.next()).value).toEqual({ object });
        expect((await stream.next()).value).toEqual({ error, origin: inboxEndpoint });
        expect((await stream.next()).done).toBe(true);
      } finally {
        await stream.return({ cursor: "" });
      }
    });
  });

}
