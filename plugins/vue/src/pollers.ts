import {
  type Graffiti,
  type JSONSchema,
  type GraffitiObject,
  type GraffitiObjectStreamReturn,
  type GraffitiObjectStreamContinueEntry,
  type GraffitiObjectStream,
  type GraffitiObjectStreamContinue,
  GraffitiErrorNotFound,
} from "@graffiti-garden/api";

export abstract class Poller<Schema extends JSONSchema> {
  abstract poll(
    onEntry: (
      entry: GraffitiObjectStreamContinueEntry<Schema> | null | "clear",
    ) => void,
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
    const myGetter = this.getter;
    try {
      object = await myGetter();
    } catch (e) {
      if (this.getter === myGetter) {
        onEntry(null);
      }
      return;
    }
    if (this.getter === myGetter) {
      onEntry({ object });
    }
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
        try {
          this.iterator = this.continue();
        } catch (e) {
          // The cursor has expired, we need to start from scratch.
          if (e instanceof GraffitiErrorNotFound) {
            onEntry("clear");
            this.iterator = this.streamFactory();
          } else {
            throw e;
          }
        }
      } else {
        this.iterator = this.streamFactory();
      }
    }

    while (true) {
      // Check if the iterator has been cancelled.
      if (!this.iterator) {
        break;
      }

      const myIterator: GraffitiObjectStreamContinue<Schema> = this.iterator;

      const result = await myIterator.next();

      // Check again if it was cancelled.
      if (myIterator !== this.iterator) {
        continue;
      }

      if (result.done) {
        this.iterator = undefined;
        if (result.value) {
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
