import type {
  Graffiti,
  JSONSchema4,
  GraffitiObject,
} from "@graffiti-garden/api";

export abstract class Poller<Schema extends JSONSchema4> {
  abstract poll(
    onObject: (object: GraffitiObject<Schema> | null) => void,
  ): Promise<void>;
  abstract clear(): void;
}

/**
 * Polls for a single object and calls onValue with the result.
 */
export class GetPoller<Schema extends JSONSchema4> implements Poller<Schema> {
  constructor(readonly getter: () => Promise<GraffitiObject<Schema>>) {}

  poll: Poller<Schema>["poll"] = async (onObject) => {
    let object: GraffitiObject<Schema>;
    try {
      object = await this.getter();
    } catch (e) {
      onObject(null);
      return;
    }
    onObject(object);
  };

  clear() {}
}

/**
 * Polls for multiple objects and calls `onObject` with the result.
 * If `poll` is called multiple times, it doesn't poll the results
 * entirely from scratch, but instead only polls the new results.
 */
export class StreamPoller<Schema extends JSONSchema4>
  implements Poller<Schema>
{
  bookmark:
    | {
        lastModified: number;
        fullRepollBy: number;
      }
    | undefined = undefined;
  iterator: ReturnType<typeof Graffiti.prototype.discover<Schema>> | undefined =
    undefined;

  constructor(
    readonly schemaGetter: () => Schema,
    readonly streamFactory: () => ReturnType<
      typeof Graffiti.prototype.discover<Schema>
    >,
  ) {}

  clear() {
    this.bookmark = undefined;
    this.iterator?.return({ tombstoneRetention: 0 });
    this.iterator = undefined;
  }

  poll: Poller<Schema>["poll"] = async (onObject) => {
    const startOfPoll = new Date().getTime();

    // Add a query for lastModified if it's not in the schema
    const schema = { ...this.schemaGetter() };
    if (this.bookmark && this.bookmark.fullRepollBy > startOfPoll) {
      schema.properties = {
        ...schema.properties,
        lastModified: {
          minimum: this.bookmark.lastModified,
          // if the schema already has a minimum
          // it won't be overridden because
          // the schema below takes precedence
          ...schema.properties?.lastModified,
        },
      };
    }

    let myIterator: ReturnType<typeof Graffiti.prototype.discover<Schema>>;
    try {
      myIterator = this.streamFactory();
    } catch (e) {
      console.error(e);
      return;
    }

    // Claim the spot as the current iterator
    this.iterator = myIterator;

    // Keep track of the latest lastModified value
    // while streaming results
    let myLastModified = this.bookmark?.lastModified;
    let result = await myIterator.next();
    while (!result.done) {
      if (result.value.error) {
        console.error(result.value.error);
        result = await myIterator.next();
        continue;
      }

      const object = result.value.value;
      if (!myLastModified || object.lastModified > myLastModified) {
        myLastModified = object.lastModified;
      }

      onObject(object);

      result = await myIterator.next();
    }

    // Make sure we're still the current iterator
    if (this.iterator !== myIterator) return;

    // We've successfully polled all results
    // without getting overridden
    this.iterator = undefined;

    // Only now do we update the cache parameters
    // because the results may have appeared out
    // of order
    const { tombstoneRetention } = result.value;
    if (myLastModified) {
      this.bookmark = {
        lastModified: myLastModified,
        fullRepollBy: startOfPoll + tombstoneRetention,
      };
    }
  };
}
