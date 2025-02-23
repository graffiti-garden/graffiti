import type {
  Graffiti,
  GraffitiObjectBase,
  GraffitiLocation,
  JSONSchema,
} from "@graffiti-garden/api";
import {
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorForbidden,
  GraffitiErrorPatchError,
} from "@graffiti-garden/api";
import {
  locationToUri,
  unpackLocationOrUri,
  randomBase64,
  applyGraffitiPatch,
  maskGraffitiObject,
  isActorAllowedGraffitiObject,
  isObjectNewer,
  compileGraffitiObjectSchema,
} from "./utilities.js";
import { Repeater } from "@repeaterjs/repeater";
import Ajv from "ajv";
import { applyPatch } from "fast-json-patch";

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
   * Defines the name of the {@link https://api.graffiti.garden/interfaces/GraffitiObjectBase.html#source | `source` }
   * under which to store objects.
   * Defaults to `"local"`.
   */
  sourceName?: string;
  /**
   * Whether to allow putting objects with a different than the
   * default source name. Defaults to `false`.
   *
   * Allows this implementation to be used as a client-side cache
   * for remote sources.
   */
  allowOtherSources?: boolean;
  /**
   * Whether to allow the user to set the lastModified field
   * when putting objects. Defaults to `false`.
   *
   * Allows this implementation to be used as a client-side cache
   * for remote sources.
   */
  allowSettinngLastModified?: boolean;
  /**
   * The time in milliseconds to keep tombstones before deleting them.
   * See the {@link https://api.graffiti.garden/classes/Graffiti.html#discover | `discover` }
   * documentation for more information.
   */
  tombstoneRetention?: number;
  /**
   * An optional Ajv instance to use for schema validation.
   * If not provided, an internal instance will be created.
   */
  ajv?: Ajv;
}

const DEFAULT_TOMBSTONE_RETENTION = 86400000; // 1 day in milliseconds
const DEFAULT_SOURCE_NAME = "local";

/**
 * An implementation of only the database operations of the
 * GraffitiAPI without synchronization or session management.
 */
export class GraffitiLocalDatabase
  implements
    Pick<
      Graffiti,
      | "get"
      | "put"
      | "patch"
      | "delete"
      | "discover"
      | "recoverOrphans"
      | "channelStats"
    >
{
  protected db_: Promise<PouchDB.Database<GraffitiObjectBase>> | undefined;
  protected readonly options: GraffitiLocalOptions;
  protected readonly ajv: Ajv;

  get db() {
    if (!this.db_) {
      this.db_ = (async () => {
        const { default: PouchDB } = await import("pouchdb");
        const pouchDbOptions = {
          name: "graffitiDb",
          ...this.options.pouchDBOptions,
        };
        const db = new PouchDB<GraffitiObjectBase>(
          pouchDbOptions.name,
          pouchDbOptions,
        );
        await db
          //@ts-ignore
          .put({
            _id: "_design/indexes",
            views: {
              objectsPerChannelAndLastModified: {
                map: function (object: GraffitiObjectBase) {
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
                map: function (object: GraffitiObjectBase) {
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
                map: function (object: GraffitiObjectBase) {
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

  constructor(options?: GraffitiLocalOptions) {
    this.ajv = options?.ajv ?? new Ajv({ strict: false });
    this.options = options ?? {};
  }

  protected async queryByLocation(location: GraffitiLocation) {
    const uri = locationToUri(location) + "/";
    const results = await (
      await this.db
    ).allDocs({
      startkey: uri,
      endkey: uri + "\uffff", // \uffff is the last unicode character
      include_docs: true,
    });
    const docs = results.rows
      .map((row) => row.doc)
      // Remove undefined docs
      .reduce<
        PouchDB.Core.ExistingDocument<
          GraffitiObjectBase & PouchDB.Core.AllDocsMeta
        >[]
      >((acc, doc) => {
        if (doc) acc.push(doc);
        return acc;
      }, []);
    return docs;
  }

  protected docId(location: GraffitiLocation) {
    return locationToUri(location) + "/" + randomBase64();
  }

  get: Graffiti["get"] = async (...args) => {
    const [locationOrUri, schema, session] = args;
    const { location } = unpackLocationOrUri(locationOrUri);

    const docsAll = await this.queryByLocation(location);

    // Filter out ones not allowed
    const docs = docsAll.filter((doc) =>
      isActorAllowedGraffitiObject(doc, session),
    );
    if (!docs.length) throw new GraffitiErrorNotFound();

    // Get the most recent document
    const doc = docs.reduce((a, b) => (isObjectNewer(a, b) ? a : b));

    // Strip out the _id and _rev
    const { _id, _rev, _conflicts, _attachments, ...object } = doc;

    // Mask out the allowed list and channels
    // if the user is not the owner
    maskGraffitiObject(object, [], session);

    const validate = compileGraffitiObjectSchema(this.ajv, schema);
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
    location: GraffitiLocation,
    keepLatest: boolean = false,
  ) {
    const docsAtLocationAll = await this.queryByLocation(location);
    const docsAtLocation = docsAtLocationAll.filter((doc) => !doc.tombstone);
    if (!docsAtLocation.length) return undefined;

    // Get the most recent lastModified timestamp.
    const latestModified = docsAtLocation
      .map((doc) => doc.lastModified)
      .reduce((a, b) => (a > b ? a : b));

    // Delete all old docs
    const docsToDelete = docsAtLocation.filter(
      (doc) => !keepLatest || doc.lastModified < latestModified,
    );

    // For docs with the same timestamp,
    // keep the one with the highest _id
    // to break concurrency ties
    const concurrentDocsAll = docsAtLocation.filter(
      (doc) => keepLatest && doc.lastModified === latestModified,
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

    const lastModified = keepLatest ? latestModified : new Date().getTime();

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
          const { _id, _rev, _conflicts, _attachments, ...object } = deletedDoc;
          deletedObject = {
            ...object,
            tombstone: true,
            lastModified,
          };
          break;
        }
      }
    }

    return deletedObject;
  }

  delete: Graffiti["delete"] = async (...args) => {
    const [locationOrUri, session] = args;
    const { location } = unpackLocationOrUri(locationOrUri);
    if (location.actor !== session.actor) {
      throw new GraffitiErrorForbidden();
    }

    const deletedObject = await this.deleteAtLocation(location);
    if (!deletedObject) {
      throw new GraffitiErrorNotFound();
    }
    return deletedObject;
  };

  put: Graffiti["put"] = async (...args) => {
    const [objectPartial, session] = args;
    if (objectPartial.actor && objectPartial.actor !== session.actor) {
      throw new GraffitiErrorForbidden();
    }
    if (
      objectPartial.source &&
      objectPartial.source !==
        (this.options.sourceName ?? DEFAULT_SOURCE_NAME) &&
      !(this.options.allowOtherSources ?? false)
    ) {
      throw new GraffitiErrorForbidden(
        "Putting an object that does not match this source",
      );
    }

    const lastModified =
      ((this.options.allowSettinngLastModified ?? false) &&
        objectPartial.lastModified) ||
      new Date().getTime();

    const object: GraffitiObjectBase = {
      value: objectPartial.value,
      channels: objectPartial.channels,
      allowed: objectPartial.allowed,
      name: objectPartial.name ?? randomBase64(),
      source:
        objectPartial.source ?? this.options.sourceName ?? DEFAULT_SOURCE_NAME,
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
    const previousObject = await this.deleteAtLocation(object, true);
    if (previousObject) {
      return previousObject;
    } else {
      return {
        ...object,
        value: {},
        channels: [],
        allowed: undefined,
        tombstone: true,
      };
    }
  };

  patch: Graffiti["patch"] = async (...args) => {
    const [patch, locationOrUri, session] = args;
    const { location } = unpackLocationOrUri(locationOrUri);
    if (location.actor !== session.actor) {
      throw new GraffitiErrorForbidden();
    }
    const originalObject = await this.get(locationOrUri, {}, session);
    if (originalObject.tombstone) {
      throw new GraffitiErrorNotFound(
        "The object you are trying to patch has been deleted",
      );
    }

    // Patch it outside of the database
    const patchObject: GraffitiObjectBase = { ...originalObject };
    for (const prop of ["value", "channels", "allowed"] as const) {
      applyGraffitiPatch(applyPatch, prop, patch, patchObject);
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
      _id: this.docId(patchObject),
    });

    // Delete the old object
    await this.deleteAtLocation(patchObject, true);

    return {
      ...originalObject,
      tombstone: true,
      lastModified: patchObject.lastModified,
    };
  };

  protected queryLastModifiedSuffixes(schema: JSONSchema) {
    // Use the index for queries over ranges of lastModified
    let startKeySuffix = "";
    let endKeySuffix = "\uffff";
    if (
      typeof schema === "object" &&
      schema.properties?.lastModified &&
      typeof schema.properties.lastModified === "object"
    ) {
      const lastModifiedSchema = schema.properties.lastModified;

      const minimum = lastModifiedSchema.minimum;
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

  discover: Graffiti["discover"] = (...args) => {
    const [channels, schema, session] = args;
    const validate = compileGraffitiObjectSchema(this.ajv, schema);

    const { startKeySuffix, endKeySuffix } =
      this.queryLastModifiedSuffixes(schema);

    const repeater: ReturnType<
      typeof Graffiti.prototype.discover<typeof schema>
    > = new Repeater(async (push, stop) => {
      const processedIds = new Set<string>();

      for (const channel of channels) {
        const keyPrefix = encodeURIComponent(channel) + "/";
        const startkey = keyPrefix + startKeySuffix;
        const endkey = keyPrefix + endKeySuffix;

        const result = await (
          await this.db
        ).query<GraffitiObjectBase>(
          "indexes/objectsPerChannelAndLastModified",
          { startkey, endkey, include_docs: true },
        );

        for (const row of result.rows) {
          const doc = row.doc;
          if (!doc) continue;

          const { _id, _rev, ...object } = doc;

          // Don't double return the same object
          // (which can happen if it's in multiple channels)
          if (processedIds.has(_id)) continue;
          processedIds.add(_id);

          // Make sure the user is allowed to see it
          if (!isActorAllowedGraffitiObject(doc, session)) continue;

          // Mask out the allowed list and channels
          // if the user is not the owner
          maskGraffitiObject(object, channels, session);

          // Check that it matches the schema
          if (validate(object)) {
            await push({ value: object });
          }
        }
      }
      stop();
      return {
        tombstoneRetention:
          this.options.tombstoneRetention ?? DEFAULT_TOMBSTONE_RETENTION,
      };
    });

    return repeater;
  };

  recoverOrphans: Graffiti["recoverOrphans"] = (schema, session) => {
    const validate = compileGraffitiObjectSchema(this.ajv, schema);

    const { startKeySuffix, endKeySuffix } =
      this.queryLastModifiedSuffixes(schema);
    const keyPrefix = encodeURIComponent(session.actor) + "/";
    const startkey = keyPrefix + startKeySuffix;
    const endkey = keyPrefix + endKeySuffix;

    const repeater: ReturnType<
      typeof Graffiti.prototype.recoverOrphans<typeof schema>
    > = new Repeater(async (push, stop) => {
      const result = await (
        await this.db
      ).query<GraffitiObjectBase>("indexes/orphansPerActorAndLastModified", {
        startkey,
        endkey,
        include_docs: true,
      });

      for (const row of result.rows) {
        const doc = row.doc;
        if (!doc) continue;

        // No masking/access necessary because
        // the objects are all owned by the querier

        const { _id, _rev, ...object } = doc;
        if (validate(object)) {
          await push({ value: object });
        }
      }
      stop();
      return {
        tombstoneRetention:
          this.options.tombstoneRetention ?? DEFAULT_TOMBSTONE_RETENTION,
      };
    });

    return repeater;
  };

  channelStats: Graffiti["channelStats"] = (session) => {
    const repeater: ReturnType<typeof Graffiti.prototype.channelStats> =
      new Repeater(async (push, stop) => {
        const keyPrefix = encodeURIComponent(session.actor) + "/";
        const result = await (
          await this.db
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
          await push({
            value: {
              channel: decodeURIComponent(channelEncoded),
              count,
              lastModified,
            },
          });
        }
        stop();
      });

    return repeater;
  };
}
