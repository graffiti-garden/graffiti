import type {
  Graffiti,
  GraffitiObjectBase,
  GraffitiObjectUrl,
  JSONSchema,
  GraffitiSession,
  GraffitiObject,
  GraffitiObjectStreamContinuation,
} from "@graffiti-garden/api";
import {
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorForbidden,
  GraffitiErrorPatchError,
} from "@graffiti-garden/api";
import {
  randomBase64,
  applyGraffitiPatch,
  maskGraffitiObject,
  isActorAllowedGraffitiObject,
  compileGraffitiObjectSchema,
  unpackObjectUrl,
} from "./utilities.js";
import type Ajv from "ajv";
import type { applyPatch } from "fast-json-patch";

type ObjectStreamMetaEntry<Schema extends JSONSchema> =
  | {
      tombstone?: undefined;
      object: GraffitiObject<Schema>;
    }
  | {
      tombstone: true;
      url: string;
    };

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
   * Includes the scheme and other information (possibly domain name)
   * to prefix prefixes all URLs put in the system. Defaults to `graffiti:local`.
   */
  origin?: string;
  /**
   * Whether to allow putting objects at arbtirary URLs, i.e.
   * URLs that are *not* prefixed with the origin or not generated
   * by the system. Defaults to `false`.
   *
   * Allows this implementation to be used as a client-side cache
   * for remote sources.
   */
  allowSettingArbitraryUrls?: boolean;
  /**
   * Whether to allow the user to set the lastModified field
   * when putting objects. Defaults to `false`.
   *
   * Allows this implementation to be used as a client-side cache
   * for remote sources.
   */
  allowSettinngLastModified?: boolean;
  /**
   * An optional Ajv instance to use for schema validation.
   * If not provided, an internal instance will be created.
   */
  ajv?: Ajv;
}

const DEFAULT_ORIGIN = "graffiti:local:";

type GraffitiObjectWithTombstone = GraffitiObjectBase & { tombstone: boolean };

/**
 * An implementation of only the database operations of the
 * GraffitiAPI without synchronization or session management.
 */
export class GraffitiLocalDatabase
  implements Omit<Graffiti, "login" | "logout" | "sessionEvents">
{
  protected db_:
    | Promise<PouchDB.Database<GraffitiObjectWithTombstone>>
    | undefined;
  protected applyPatch_: Promise<typeof applyPatch> | undefined;
  protected ajv_: Promise<Ajv> | undefined;
  protected readonly options: GraffitiLocalOptions;
  protected readonly origin: string;

  get db() {
    if (!this.db_) {
      this.db_ = (async () => {
        const { default: PouchDB } = await import("pouchdb");
        const pouchDbOptions = {
          name: "graffitiDb",
          ...this.options.pouchDBOptions,
        };
        const db = new PouchDB<GraffitiObjectWithTombstone>(
          pouchDbOptions.name,
          pouchDbOptions,
        );
        await db
          //@ts-ignore
          .put({
            _id: "_design/indexes",
            views: {
              objectsPerChannelAndLastModified: {
                map: function (object: GraffitiObjectWithTombstone) {
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
              orphansPerActorAndLastModified: {
                map: function (object: GraffitiObjectWithTombstone) {
                  if (object.channels.length === 0) {
                    const paddedLastModified = object.lastModified
                      .toString()
                      .padStart(15, "0");
                    const id =
                      encodeURIComponent(object.actor) +
                      "/" +
                      paddedLastModified;
                    //@ts-ignore
                    emit(id);
                  }
                }.toString(),
              },
              channelStatsPerActor: {
                map: function (object: GraffitiObjectWithTombstone) {
                  if (object.tombstone) return;
                  object.channels.forEach(function (channel) {
                    const id =
                      encodeURIComponent(object.actor) +
                      "/" +
                      encodeURIComponent(channel);
                    //@ts-ignore
                    emit(id, object.lastModified);
                  });
                }.toString(),
                reduce: "_stats",
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

  protected get applyPatch() {
    if (!this.applyPatch_) {
      this.applyPatch_ = (async () => {
        const { applyPatch } = await import("fast-json-patch");
        return applyPatch;
      })();
    }
    return this.applyPatch_;
  }

  protected get ajv() {
    if (!this.ajv_) {
      this.ajv_ = this.options.ajv
        ? Promise.resolve(this.options.ajv)
        : (async () => {
            const { default: Ajv } = await import("ajv");
            return new Ajv({ strict: false });
          })();
    }
    return this.ajv_;
  }

  protected extractGraffitiObject(
    object: GraffitiObjectWithTombstone,
  ): GraffitiObjectBase {
    const { value, channels, allowed, url, actor, lastModified } = object;
    return {
      value,
      channels,
      allowed,
      url,
      actor,
      lastModified,
    };
  }

  constructor(options?: GraffitiLocalOptions) {
    this.options = options ?? {};
    this.origin = this.options.origin ?? DEFAULT_ORIGIN;
    if (!this.origin.endsWith(":") && !this.origin.endsWith("/")) {
      this.origin += "/";
    }
  }

  protected async allDocsAtLocation(objectUrl: string | GraffitiObjectUrl) {
    const url = unpackObjectUrl(objectUrl) + "/";
    const results = await (
      await this.db
    ).allDocs({
      startkey: url,
      endkey: url + "\uffff", // \uffff is the last unicode character
      include_docs: true,
    });
    const docs = results.rows
      .map((row) => row.doc)
      // Remove undefined docs
      .reduce<
        PouchDB.Core.ExistingDocument<
          GraffitiObjectWithTombstone & PouchDB.Core.AllDocsMeta
        >[]
      >((acc, doc) => {
        if (doc) acc.push(doc);
        return acc;
      }, []);
    return docs;
  }

  protected docId(objectUrl: GraffitiObjectUrl) {
    return objectUrl.url + "/" + randomBase64();
  }

  get: Graffiti["get"] = async (...args) => {
    const [urlObject, schema, session] = args;

    const docsAll = await this.allDocsAtLocation(urlObject);

    // Filter out ones not allowed
    const docs = docsAll.filter((doc) =>
      isActorAllowedGraffitiObject(doc, session),
    );
    if (!docs.length)
      throw new GraffitiErrorNotFound(
        "The object you are trying to get either does not exist or you are not allowed to see it",
      );

    // Get the most recent document
    const doc = docs.reduce((a, b) =>
      a.lastModified > b.lastModified ||
      (a.lastModified === b.lastModified && !a.tombstone && b.tombstone)
        ? a
        : b,
    );

    if (doc.tombstone) {
      throw new GraffitiErrorNotFound(
        "The object you are trying to get either does not exist or you are not allowed to see it",
      );
    }

    const object = this.extractGraffitiObject(doc);

    // Mask out the allowed list and channels
    // if the user is not the owner
    maskGraffitiObject(object, [], session);

    const validate = compileGraffitiObjectSchema(await this.ajv, schema);
    if (!validate(object)) {
      throw new GraffitiErrorSchemaMismatch();
    }
    return object;
  };

  /**
   * Deletes all docs at a particular location.
   * If the `keepLatest` flag is set to true,
   * the doc with the most recent timestamp will be
   * spared. If there are multiple docs with the same
   * timestamp, the one with the highest `_id` will be
   * spared.
   */
  protected async deleteAtLocation(
    url: GraffitiObjectUrl | string,
    options: {
      keepLatest?: boolean;
      session?: GraffitiSession;
    } = {
      keepLatest: false,
    },
  ) {
    const docsAtLocationAll = await this.allDocsAtLocation(url);
    const docsAtLocationAllowed = options.session
      ? docsAtLocationAll.filter((doc) =>
          isActorAllowedGraffitiObject(doc, options.session),
        )
      : docsAtLocationAll;
    if (!docsAtLocationAllowed.length) {
      throw new GraffitiErrorNotFound(
        "The object you are trying to delete either does not exist or you are not allowed to see it",
      );
    } else if (
      options.session &&
      docsAtLocationAllowed.some((doc) => doc.actor !== options.session?.actor)
    ) {
      throw new GraffitiErrorForbidden(
        "You cannot delete an object owned by another actor",
      );
    }
    const docsAtLocation = docsAtLocationAllowed.filter(
      (doc) => !doc.tombstone,
    );
    if (!docsAtLocation.length) return undefined;

    // Get the most recent lastModified timestamp.
    const latestModified = docsAtLocation
      .map((doc) => doc.lastModified)
      .reduce((a, b) => (a > b ? a : b));

    // Delete all old docs
    const docsToDelete = docsAtLocation.filter(
      (doc) => !options.keepLatest || doc.lastModified < latestModified,
    );

    // For docs with the same timestamp,
    // keep the one with the highest _id
    // to break concurrency ties
    const concurrentDocsAll = docsAtLocation.filter(
      (doc) => options.keepLatest && doc.lastModified === latestModified,
    );
    if (concurrentDocsAll.length) {
      const keepDocId = concurrentDocsAll
        .map((doc) => doc._id)
        .reduce((a, b) => (a > b ? a : b));
      const concurrentDocsToDelete = concurrentDocsAll.filter(
        (doc) => doc._id !== keepDocId,
      );
      docsToDelete.push(...concurrentDocsToDelete);
    }

    const lastModified = options.keepLatest
      ? latestModified
      : new Date().getTime();

    const deleteResults = await (
      await this.db
    ).bulkDocs<GraffitiObjectBase>(
      docsToDelete.map((doc) => ({
        ...doc,
        tombstone: true,
        lastModified,
      })),
    );

    // Get one of the docs that was deleted
    let deletedObject: GraffitiObjectBase | undefined = undefined;
    for (const resultOrError of deleteResults) {
      if ("ok" in resultOrError) {
        const { id } = resultOrError;
        const deletedDoc = docsToDelete.find((doc) => doc._id === id);
        if (deletedDoc) {
          deletedObject = {
            ...this.extractGraffitiObject(deletedDoc),
            lastModified,
          };
          break;
        }
      }
    }

    return deletedObject;
  }

  delete: Graffiti["delete"] = async (...args) => {
    const [url, session] = args;
    const deletedObject = await this.deleteAtLocation(url, {
      session,
    });
    if (!deletedObject) {
      throw new GraffitiErrorNotFound("The object has already been deleted");
    }
    return deletedObject;
  };

  put: Graffiti["put"] = async (...args) => {
    const [objectPartial, session] = args;
    if (objectPartial.actor && objectPartial.actor !== session.actor) {
      throw new GraffitiErrorForbidden(
        "Cannot put an object with a different actor than the session actor",
      );
    }

    if (objectPartial.url) {
      let oldObject: GraffitiObjectBase | undefined;
      try {
        oldObject = await this.get(objectPartial.url, {}, session);
      } catch (e) {
        if (e instanceof GraffitiErrorNotFound) {
          if (!this.options.allowSettingArbitraryUrls) {
            throw new GraffitiErrorNotFound(
              "The object you are trying to replace does not exist or you are not allowed to see it",
            );
          }
        } else {
          throw e;
        }
      }
      if (oldObject?.actor !== session.actor) {
        throw new GraffitiErrorForbidden(
          "The object you are trying to replace is owned by another actor",
        );
      }
    }

    const lastModified =
      ((this.options.allowSettinngLastModified ?? false) &&
        objectPartial.lastModified) ||
      new Date().getTime();

    const object: GraffitiObjectWithTombstone = {
      value: objectPartial.value,
      channels: objectPartial.channels,
      allowed: objectPartial.allowed,
      url: objectPartial.url ?? this.origin + randomBase64(),
      actor: session.actor,
      tombstone: false,
      lastModified,
    };

    await (
      await this.db
    ).put({
      _id: this.docId(object),
      ...object,
    });

    // Delete the old object
    const previousObject = await this.deleteAtLocation(object, {
      keepLatest: true,
    });
    if (previousObject) {
      return previousObject;
    } else {
      return {
        ...object,
        value: {},
        channels: [],
        allowed: [],
        tombstone: true,
      };
    }
  };

  patch: Graffiti["patch"] = async (...args) => {
    const [patch, url, session] = args;
    let originalObject: GraffitiObjectBase;
    try {
      originalObject = await this.get(url, {}, session);
    } catch (e) {
      if (e instanceof GraffitiErrorNotFound) {
        throw new GraffitiErrorNotFound(
          "The object you are trying to patch does not exist or you are not allowed to see it",
        );
      } else {
        throw e;
      }
    }
    if (originalObject.actor !== session.actor) {
      throw new GraffitiErrorForbidden(
        "The object you are trying to patch is owned by another actor",
      );
    }

    // Patch it outside of the database
    const patchObject: GraffitiObjectBase = { ...originalObject };
    for (const prop of ["value", "channels", "allowed"] as const) {
      applyGraffitiPatch(await this.applyPatch, prop, patch, patchObject);
    }

    // Make sure the value is an object
    if (
      typeof patchObject.value !== "object" ||
      Array.isArray(patchObject.value) ||
      !patchObject.value
    ) {
      throw new GraffitiErrorPatchError("value is no longer an object");
    }

    // Make sure the channels are an array of strings
    if (
      !Array.isArray(patchObject.channels) ||
      !patchObject.channels.every((channel) => typeof channel === "string")
    ) {
      throw new GraffitiErrorPatchError(
        "channels are no longer an array of strings",
      );
    }

    // Make sure the allowed list is an array of strings or undefined
    if (
      patchObject.allowed &&
      (!Array.isArray(patchObject.allowed) ||
        !patchObject.allowed.every((allowed) => typeof allowed === "string"))
    ) {
      throw new GraffitiErrorPatchError(
        "allowed list is not an array of strings",
      );
    }

    patchObject.lastModified = new Date().getTime();
    await (
      await this.db
    ).put({
      ...patchObject,
      tombstone: false,
      _id: this.docId(patchObject),
    });

    // Delete the old object
    await this.deleteAtLocation(patchObject, {
      keepLatest: true,
    });

    return {
      ...originalObject,
      lastModified: patchObject.lastModified,
    };
  };

  protected queryLastModifiedSuffixes(
    schema: JSONSchema,
    lastModified?: number,
  ) {
    // Use the index for queries over ranges of lastModified
    let startKeySuffix = "";
    let endKeySuffix = "\uffff";
    if (
      typeof schema === "object" &&
      schema.properties?.lastModified &&
      typeof schema.properties.lastModified === "object"
    ) {
      const lastModifiedSchema = schema.properties.lastModified;

      const minimum =
        lastModified && lastModifiedSchema.minimum
          ? Math.max(lastModified, lastModifiedSchema.minimum)
          : (lastModified ?? lastModifiedSchema.minimum);
      const exclusiveMinimum = lastModifiedSchema.exclusiveMinimum;

      let intMinimum: number | undefined;
      if (exclusiveMinimum !== undefined) {
        intMinimum = Math.ceil(exclusiveMinimum);
        intMinimum === exclusiveMinimum && intMinimum++;
      } else if (minimum !== undefined) {
        intMinimum = Math.ceil(minimum);
      }

      if (intMinimum !== undefined) {
        startKeySuffix = intMinimum.toString().padStart(15, "0");
      }

      const maximum = lastModifiedSchema.maximum;
      const exclusiveMaximum = lastModifiedSchema.exclusiveMaximum;

      let intMaximum: number | undefined;
      if (exclusiveMaximum !== undefined) {
        intMaximum = Math.floor(exclusiveMaximum);
        intMaximum === exclusiveMaximum && intMaximum--;
      } else if (maximum !== undefined) {
        intMaximum = Math.floor(maximum);
      }

      if (intMaximum !== undefined) {
        endKeySuffix = intMaximum.toString().padStart(15, "0");
      }
    }
    return {
      startKeySuffix,
      endKeySuffix,
    };
  }

  protected async *streamObjects<Schema extends JSONSchema>(
    index: string,
    startkey: string,
    endkey: string,
    validate: ReturnType<typeof compileGraffitiObjectSchema<Schema>>,
    session: GraffitiSession | undefined | null,
    ifModifiedSince: number | undefined,
    channels?: string[],
    processedIds?: Set<string>,
  ): AsyncGenerator<ObjectStreamMetaEntry<Schema>, number | undefined> {
    let myIfModifiedSince: number | undefined = ifModifiedSince;
    const showTombstones = ifModifiedSince !== undefined;

    const result = await (
      await this.db
    ).query<GraffitiObjectWithTombstone>(index, {
      startkey,
      endkey,
      include_docs: true,
    });

    for (const row of result.rows) {
      const doc = row.doc;
      if (!doc) continue;

      if (processedIds?.has(doc._id)) continue;
      processedIds?.add(doc._id);

      if (!showTombstones && doc.tombstone) continue;

      const object = this.extractGraffitiObject(doc);

      if (!myIfModifiedSince || object.lastModified > myIfModifiedSince) {
        myIfModifiedSince = object.lastModified;
      }

      if (channels) {
        if (!isActorAllowedGraffitiObject(object, session)) continue;
        maskGraffitiObject(object, channels, session);
      }

      if (!validate(object)) continue;

      yield doc.tombstone ? { tombstone: true, url: object.url } : { object };
    }

    return myIfModifiedSince;
  }

  protected async *discoverMeta<Schema extends JSONSchema>(
    args: Parameters<typeof Graffiti.prototype.discover<Schema>>,
    ifModifiedSince?: number,
  ): AsyncGenerator<ObjectStreamMetaEntry<Schema>, number | undefined> {
    const [channels, schema, session] = args;
    const validate = compileGraffitiObjectSchema(await this.ajv, schema);
    const { startKeySuffix, endKeySuffix } = this.queryLastModifiedSuffixes(
      schema,
      ifModifiedSince,
    );

    const processedIds = new Set<string>();

    for (const channel of channels) {
      const keyPrefix = encodeURIComponent(channel) + "/";
      const startkey = keyPrefix + startKeySuffix;
      const endkey = keyPrefix + endKeySuffix;

      const iterator = this.streamObjects<Schema>(
        "indexes/objectsPerChannelAndLastModified",
        startkey,
        endkey,
        validate,
        session,
        ifModifiedSince,
        channels,
        processedIds,
      );

      while (true) {
        const result = await iterator.next();
        if (result.done) {
          ifModifiedSince = result.value;
          break;
        }
        yield result.value;
      }
    }

    return ifModifiedSince;
  }

  protected async *recoverOrphansMeta<Schema extends JSONSchema>(
    args: Parameters<typeof Graffiti.prototype.recoverOrphans<Schema>>,
    ifModifiedSince?: number,
  ): AsyncGenerator<ObjectStreamMetaEntry<Schema>, number | undefined> {
    const [schema, session] = args;
    const { startKeySuffix, endKeySuffix } = this.queryLastModifiedSuffixes(
      schema,
      ifModifiedSince,
    );
    const keyPrefix = encodeURIComponent(session.actor) + "/";
    const startkey = keyPrefix + startKeySuffix;
    const endkey = keyPrefix + endKeySuffix;

    const validate = compileGraffitiObjectSchema(await this.ajv, schema);

    const iterator = this.streamObjects<Schema>(
      "indexes/orphansPerActorAndLastModified",
      startkey,
      endkey,
      validate,
      session,
      ifModifiedSince,
    );

    while (true) {
      const result = await iterator.next();
      if (result.done) {
        return result.value;
      }
      yield result.value;
    }
  }

  protected async *discoverContinue<Schema extends JSONSchema>(
    args: Parameters<typeof Graffiti.prototype.discover<Schema>>,
    ifModifiedSince?: number,
  ): GraffitiObjectStreamContinuation<Schema> {
    const iterator = this.discoverMeta(args, ifModifiedSince);

    while (true) {
      const result = await iterator.next();
      if (result.done) {
        const ifModifiedSince = result.value;
        return {
          continue: () => this.discoverContinue<Schema>(args, ifModifiedSince),
          cursor: "",
        };
      }
      yield result.value;
    }
  }

  discover: Graffiti["discover"] = (...args) => {
    const iterator = this.discoverMeta(args);

    const this_ = this;
    return (async function* () {
      while (true) {
        const result = await iterator.next();
        if (result.done) {
          return {
            continue: () =>
              this_.discoverContinue<(typeof args)[1]>(args, result.value),
            cursor: "",
          };
        }
        // Make sure to filter out tombstones
        if (result.value.tombstone) continue;
        yield result.value;
      }
    })();
  };

  protected async *recoverContinue<Schema extends JSONSchema>(
    args: Parameters<typeof Graffiti.prototype.recoverOrphans<Schema>>,
    ifModifiedSince?: number,
  ): GraffitiObjectStreamContinuation<Schema> {
    const iterator = this.recoverOrphansMeta(args, ifModifiedSince);

    while (true) {
      const result = await iterator.next();
      if (result.done) {
        const ifModifiedSince = result.value;
        return {
          continue: () => this.recoverContinue<Schema>(args, ifModifiedSince),
          cursor: "",
        };
      }
      yield result.value;
    }
  }

  recoverOrphans: Graffiti["recoverOrphans"] = (...args) => {
    const iterator = this.recoverOrphansMeta(args);

    const this_ = this;
    return (async function* () {
      while (true) {
        const result = await iterator.next();
        if (result.done) {
          return {
            continue: () =>
              this_.recoverContinue<(typeof args)[0]>(args, result.value),
            cursor: "",
          };
        }
        // Make sure to filter out tombstones
        if (result.value.tombstone) continue;
        yield result.value;
      }
    })();
  };

  channelStats: Graffiti["channelStats"] = (session) => {
    const this_ = this;
    return (async function* () {
      const keyPrefix = encodeURIComponent(session.actor) + "/";
      const result = await (
        await this_.db
      ).query("indexes/channelStatsPerActor", {
        startkey: keyPrefix,
        endkey: keyPrefix + "\uffff",
        reduce: true,
        group: true,
      });
      for (const row of result.rows) {
        const channelEncoded = row.key.split("/")[1];
        if (typeof channelEncoded !== "string") continue;
        const { count, max: lastModified } = row.value;
        if (typeof count !== "number" || typeof lastModified !== "number")
          continue;
        yield {
          value: {
            channel: decodeURIComponent(channelEncoded),
            count,
            lastModified,
          },
        };
      }
    })();
  };

  continueObjectStream: Graffiti["continueObjectStream"] = (
    cursor,
    session,
  ) => {
    // TODO: Implement this
    throw new GraffitiErrorNotFound("Cursor not found");
  };
}
