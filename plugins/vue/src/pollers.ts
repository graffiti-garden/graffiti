import type {
  Graffiti,
  JSONSchema,
  GraffitiObject,
  GraffitiObjectStreamReturn,
  GraffitiObjectStreamContinueEntry,
  GraffitiObjectStream,
  GraffitiObjectStreamContinue,
} from "@graffiti-garden/api";

export abstract class Poller<Schema extends JSONSchema> {
  abstract poll(
    onEntry: (entry: GraffitiObjectStreamContinueEntry<Schema> | null) => void,
  ): Promise<void>;
  abstract clear(): void;
}

/**
 * Polls for a single object and calls onValue with the result.
 */
export class GetPoller<Schema extends JSONSchema> implements Poller<Schema> {
  constructor(readonly getter: () => Promise<GraffitiObject<Schema>>) {}

  poll: Poller<Schema>["poll"] = async (onEntry) => {
    let object: GraffitiObject<Schema>;
    try {
      object = await this.getter();
    } catch (e) {
      onEntry(null);
      return;
    }
    onEntry({ object });
  };

  clear() {}
}

/**
 * Polls for multiple objects and calls `onObject` with the result.
 * If `poll` is called multiple times, it doesn't poll the results
 * entirely from scratch, but instead only polls the new results.
 */
export class StreamPoller<Schema extends JSONSchema> implements Poller<Schema> {
  iterator: GraffitiObjectStreamContinue<Schema> | undefined;
  continue: (() => GraffitiObjectStreamContinue<Schema>) | undefined;

  constructor(readonly streamFactory: () => GraffitiObjectStream<Schema>) {}

  clear() {
    if (this.iterator) {
      const iterator = this.iterator;
      this.iterator.return({
        continue: () => iterator,
        cursor: "",
      });
    }
    this.iterator = undefined;
    this.continue = undefined;
  }

  poll: Poller<Schema>["poll"] = async (onEntry) => {
    if (!this.iterator) {
      if (this.continue) {
        this.iterator = this.continue();
      } else {
        this.iterator = this.streamFactory();
      }
    }

    while (true) {
      const result = await this.iterator.next();

      if (result.done) {
        if (result.value) {
          this.iterator = undefined;
          this.continue = result.value.continue;
        }
        break;
      }

      if (result.value.error) {
        console.error(result.value.error);
        continue;
      }

      onEntry(result.value);
    }
  };
}
