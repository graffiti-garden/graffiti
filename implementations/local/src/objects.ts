import type {
  Graffiti,
  GraffitiObjectBase,
  JSONSchema,
  GraffitiSession,
  GraffitiObjectStreamContinue,
  GraffitiObjectStreamContinueEntry,
} from "@graffiti-garden/api";
import {
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorForbidden,
  unpackObjectUrl,
  maskGraffitiObject,
  isActorAllowedGraffitiObject,
  compileGraffitiObjectSchema,
} from "@graffiti-garden/api";
import { randomBase64, decodeObjectUrl, encodeObjectUrl } from "./utilities.js";
import type Ajv from "ajv";

/**
 * Constructor options for the GraffitiPoubchDB class.
 */
export interface GraffitiLocalOptions {
  /**
   * Options to pass to the PouchDB constructor.
   * Defaults to `{ name: "graffitiDb" }`.
   *
   * See the [PouchDB documentation](https://pouchdb.com/api.html#create_database)
   * for available options.
   */
  pouchDBOptions?: PouchDB.Configuration.DatabaseConfiguration;
  /**
   * Wait at least this long (in milliseconds) before continuing a stream.
   * A basic form of rate limiting. Defaults to 2 seconds.
   */
  continueBuffer?: number;
}

type GraffitiObjectData = {
  tombstone: boolean;
  value: {};
  channels: string[];
  allowed?: string[] | null;
  lastModified: number;
};

type ContinueDiscoverParams = {
  lastDiscovered: number;
  ifModifiedSince: number;
};

/**
 * An implementation of only the database operations of the
 * GraffitiAPI without synchronization or session management.
 */
export class GraffitiLocalObjects {
  protected db_: Promise<PouchDB.Database<GraffitiObjectData>> | undefined;
  protected ajv_: Promise<Ajv> | undefined;
  protected readonly options: GraffitiLocalOptions;

  get db() {
    if (!this.db_) {
      this.db_ = (async () => {
        const { default: PouchDB } = await import("pouchdb");
        const pouchDbOptions = {
          name: "graffitiDb",
          ...this.options.pouchDBOptions,
        };
        const db = new PouchDB<GraffitiObjectData>(
          pouchDbOptions.name,
          pouchDbOptions,
        );
        await db
          //@ts-ignore
          .put({
            _id: "_design/indexes",
            views: {
              objectsPerChannelAndLastModified: {
                map: function (object: GraffitiObjectData) {
                  const paddedLastModified = object.lastModified
                    .toString()
                    .padStart(15, "0");
                  object.channels.forEach(function (channel) {
                    const id =
                      encodeURIComponent(channel) + "/" + paddedLastModified;
                    //@ts-ignore
                    emit(id);
                  });
                }.toString(),
              },
            },
          })
          //@ts-ignore
          .catch((error) => {
            if (
              error &&
              typeof error === "object" &&
              "name" in error &&
              error.name === "conflict"
            ) {
              // Design document already exists
              return;
            } else {
              throw error;
            }
          });
        return db;
      })();
    }
    return this.db_;
  }

  protected get ajv() {
    if (!this.ajv_) {
      this.ajv_ = (async () => {
        const { default: Ajv } = await import("ajv");
        return new Ajv({ strict: false });
      })();
    }
    return this.ajv_;
  }

  protected async getOperationClock() {
    return Number((await (await this.db).info()).update_seq);
  }

  constructor(options?: GraffitiLocalOptions) {
    this.options = options ?? {};
  }

  get: Graffiti["get"] = async (...args) => {
    const [urlObject, schema, session] = args;
    const url = unpackObjectUrl(urlObject);

    let doc: GraffitiObjectData;
    try {
      doc = await (await this.db).get(url);
    } catch (error) {
      throw new GraffitiErrorNotFound(
        "The object you are trying to get either does not exist or you are not allowed to see it",
      );
    }

    if (doc.tombstone) {
      throw new GraffitiErrorNotFound(
        "The object you are trying to get either does not exist or you are not allowed to see it",
      );
    }

    const { actor } = decodeObjectUrl(url);
    const { value, channels, allowed } = doc;
    const object: GraffitiObjectBase = {
      value,
      channels,
      allowed,
      url,
      actor,
    };

    if (!isActorAllowedGraffitiObject(object, session)) {
      throw new GraffitiErrorNotFound(
        "The object you are trying to get either does not exist or you are not allowed to see it",
      );
    }

    // Mask out the allowed list and channels
    // if the user is not the owner
    maskGraffitiObject(object, [], session);

    const validate = compileGraffitiObjectSchema(await this.ajv, schema);
    if (!validate(object)) {
      throw new GraffitiErrorSchemaMismatch();
    }
    return object;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const [urlObject, session] = args;

    const url = unpackObjectUrl(urlObject);
    const { actor } = decodeObjectUrl(url);
    if (actor !== session.actor) {
      throw new GraffitiErrorForbidden(
        "You cannot delete an object that you did not create.",
      );
    }

    let doc: GraffitiObjectData & PouchDB.Core.IdMeta & PouchDB.Core.GetMeta;
    try {
      doc = await (await this.db).get(url);
    } catch {
      throw new GraffitiErrorNotFound("Object not found.");
    }

    if (doc.tombstone) {
      throw new GraffitiErrorNotFound("Object not found.");
    }

    // Set the tombstone and update lastModified
    doc.tombstone = true;
    doc.lastModified = await this.getOperationClock();
    try {
      await (await this.db).put(doc);
    } catch {
      throw new GraffitiErrorNotFound("Object not found.");
    }

    return;
  };

  post: Graffiti["post"] = async (...args) => {
    const [objectPartial, session] = args;

    const actor = session.actor;
    const id = randomBase64();
    const url = encodeObjectUrl(actor, id);

    const { value, channels, allowed } = objectPartial;
    const object: GraffitiObjectData = {
      value,
      channels,
      allowed,
      lastModified: await this.getOperationClock(),
      tombstone: false,
    };

    await (
      await this.db
    ).put({
      _id: url,
      ...object,
    });

    return {
      ...objectPartial,
      actor,
      url,
    };
  };

  protected async *discoverMeta<Schema extends JSONSchema>(
    args: Parameters<typeof Graffiti.prototype.discover<Schema>>,
    continueParams?: {
      lastDiscovered: number;
      ifModifiedSince: number;
    },
  ): AsyncGenerator<
    GraffitiObjectStreamContinueEntry<Schema>,
    ContinueDiscoverParams
  > {
    // If we are continuing a discover, make sure to wait at
    // least 2 seconds since the last poll to start a new one.
    if (continueParams) {
      const continueBuffer = this.options.continueBuffer ?? 2000;
      const timeElapsedSinceLastDiscover =
        Date.now() - continueParams.lastDiscovered;
      if (timeElapsedSinceLastDiscover < continueBuffer) {
        // Continue was called too soon,
        // wait a bit before continuing
        await new Promise((resolve) =>
          setTimeout(resolve, continueBuffer - timeElapsedSinceLastDiscover),
        );
      }
    }

    const [discoverChannels, schema, session] = args;
    const validate = compileGraffitiObjectSchema(await this.ajv, schema);
    const startKeySuffix = continueParams
      ? continueParams.ifModifiedSince.toString().padStart(15, "0")
      : "";
    const endKeySuffix = "\uffff";

    const processedUrls = new Set<string>();

    const startTime = await this.getOperationClock();

    for (const channel of discoverChannels) {
      const keyPrefix = encodeURIComponent(channel) + "/";
      const startkey = keyPrefix + startKeySuffix;
      const endkey = keyPrefix + endKeySuffix;

      const result = await (
        await this.db
      ).query<GraffitiObjectData>("indexes/objectsPerChannelAndLastModified", {
        startkey,
        endkey,
        include_docs: true,
      });

      for (const row of result.rows) {
        const doc = row.doc;
        if (!doc) continue;

        const url = doc._id;

        if (processedUrls.has(url)) continue;
        processedUrls.add(url);

        // If this is not a continuation, skip tombstones
        if (!continueParams && doc.tombstone) continue;

        const { tombstone, value, channels, allowed } = doc;
        const { actor } = decodeObjectUrl(url);

        const object: GraffitiObjectBase = {
          url,
          value,
          allowed,
          channels,
          actor,
        };

        if (!isActorAllowedGraffitiObject(object, session)) continue;

        maskGraffitiObject(object, discoverChannels, session);

        if (!validate(object)) continue;

        yield tombstone
          ? {
              tombstone: true,
              object: { url },
            }
          : { object };
      }
    }

    return {
      lastDiscovered: Date.now(),
      ifModifiedSince: startTime,
    };
  }

  protected discoverCursor(
    args: Parameters<typeof Graffiti.prototype.discover<{}>>,
    continueParams: {
      lastDiscovered: number;
      ifModifiedSince: number;
    },
  ): string {
    const [channels, schema, session] = args;
    return (
      "discover:" +
      JSON.stringify({
        channels,
        schema,
        continueParams,
        actor: session?.actor,
      })
    );
  }

  protected async *discoverContinue<Schema extends JSONSchema>(
    args: Parameters<typeof Graffiti.prototype.discover<Schema>>,
    continueParams: {
      lastDiscovered: number;
      ifModifiedSince: number;
    },
    session?: GraffitiSession | null,
  ): GraffitiObjectStreamContinue<Schema> {
    if (session?.actor !== args[2]?.actor) {
      throw new GraffitiErrorForbidden(
        "Cannot continue a cursor started by another actor",
      );
    }
    const iterator = this.discoverMeta<Schema>(args, continueParams);

    while (true) {
      const result = await iterator.next();
      if (result.done) {
        return {
          continue: (session) =>
            this.discoverContinue<Schema>(args, result.value, session),
          cursor: this.discoverCursor(args, result.value),
        };
      }
      yield result.value;
    }
  }

  discover: Graffiti["discover"] = (...args) => {
    const [channels, schema, session] = args;
    const iterator = this.discoverMeta<(typeof args)[1]>([
      channels,
      schema,
      session,
    ]);

    const this_ = this;
    return (async function* () {
      while (true) {
        const result = await iterator.next();
        if (result.done) {
          return {
            continue: (session) =>
              this_.discoverContinue<(typeof args)[1]>(
                args,
                result.value,
                session,
              ),
            cursor: this_.discoverCursor(args, result.value),
          };
        }
        // Make sure to filter out tombstones
        if (result.value.tombstone) continue;
        yield result.value;
      }
    })();
  };

  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    const [cursor, session] = args;
    if (cursor.startsWith("discover:")) {
      // TODO: use AJV here
      const { channels, schema, actor, continueParams } = JSON.parse(
        cursor.slice("discover:".length),
      );
      if (actor && actor !== session?.actor) {
        throw new GraffitiErrorForbidden(
          "Cannot continue a cursor started by another actor",
        );
      }
      return this.discoverContinue<{}>(
        [channels, schema, session],
        continueParams,
      );
    } else {
      throw new GraffitiErrorNotFound("Cursor not found");
    }
  };
}
