import type {
  Graffiti,
  GraffitiObjectBase,
  GraffitiLocation,
} from "@graffiti-garden/api";
import {
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorForbidden,
  GraffitiErrorPatchError,
} from "@graffiti-garden/api";
import PouchDB from "pouchdb";
import {
  locationToUri,
  unpackLocationOrUri,
  randomBase64,
  applyGraffitiPatch,
  attemptAjvCompile,
  maskGraffitiObject,
  isActorAllowedGraffitiObject,
} from "./utilities";
import { Repeater } from "@repeaterjs/repeater";
import Ajv from "ajv-draft-04";
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
   * The time in milliseconds to keep tombstones before deleting them.
   * See the {@link https://api.graffiti.garden/classes/Graffiti.html#discover | `discover` }
   * documentation for more information.
   */
  tombstoneRetention?: number;
}

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
      | "listChannels"
      | "listOrphans"
    >
{
  protected readonly db: PouchDB.Database<GraffitiObjectBase>;
  protected readonly source: string = "local";
  protected readonly tombstoneRetention: number = 86400000; // 1 day in ms
  protected readonly ajv: Ajv;

  constructor(options?: GraffitiLocalOptions, ajv?: Ajv) {
    this.ajv = ajv ?? new Ajv({ strict: false });
    this.source = options?.sourceName ?? this.source;
    this.tombstoneRetention =
      options?.tombstoneRetention ?? this.tombstoneRetention;
    const pouchDbOptions = {
      name: "graffitiDb",
      ...options?.pouchDBOptions,
    };
    this.db = new PouchDB<GraffitiObjectBase>(
      pouchDbOptions.name,
      pouchDbOptions,
    );

    this.db
      //@ts-ignore
      .put({
        _id: "_design/index3",
        views: {
          byChannelAndLastModified: {
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
  }

  protected async queryByLocation(location: GraffitiLocation) {
    const uri = locationToUri(location) + "/";
    const results = await this.db.allDocs({
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
      }, [])
      // Remove tombstones
      .filter((doc) => !doc.tombstone);
    return docs;
  }

  protected docId(location: GraffitiLocation) {
    return locationToUri(location) + "/" + randomBase64();
  }

  get: Graffiti["get"] = async (...args) => {
    const [locationOrUri, schema, session] = args;
    const { location } = unpackLocationOrUri(locationOrUri);

    const docs = await this.queryByLocation(location);
    if (!docs.length) throw new GraffitiErrorNotFound();

    // Get the most recent document
    const doc = docs.reduce((a, b) =>
      a.lastModified > b.lastModified ? a : b,
    );

    // Strip out the _id and _rev
    const { _id, _rev, ...object } = doc;

    // Make sure the user is allowed to see it
    if (!isActorAllowedGraffitiObject(doc, session))
      throw new GraffitiErrorNotFound();

    // Mask out the allowed list and channels
    // if the user is not the owner
    maskGraffitiObject(object, [], session);

    const validate = attemptAjvCompile(this.ajv, schema);
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
    const docsAtLocation = await this.queryByLocation(location);
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

    let deletedObject: GraffitiObjectBase | undefined = undefined;
    // Go through documents oldest to newest
    for (const doc of docsToDelete.sort(
      (a, b) => a.lastModified - b.lastModified,
    )) {
      // Change it's tombstone to true
      // and update it's timestamp
      const deletedDoc = {
        ...doc,
        tombstone: true,
        lastModified,
      };
      try {
        await this.db.put(deletedDoc);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "conflict"
        ) {
          // Document was already deleted
          continue;
        }
      }
      const { _id, _rev, ...object } = deletedDoc;
      deletedObject = object;
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

    const object: GraffitiObjectBase = {
      value: objectPartial.value,
      channels: objectPartial.channels,
      allowed: objectPartial.allowed,
      name: objectPartial.name ?? randomBase64(),
      source: objectPartial.source ?? this.source,
      actor: session.actor,
      tombstone: false,
      lastModified: new Date().getTime(),
    };

    await this.db.put({
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
    await this.db.put({
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

  discover: Graffiti["discover"] = (...args) => {
    const [channels, schema, session] = args;

    const validate = attemptAjvCompile(this.ajv, schema);

    // Use the index for queries over ranges of lastModified
    let startKeyAppend = "";
    let endKeyAppend = "\uffff";
    const lastModifiedSchema = schema.properties?.lastModified;
    if (lastModifiedSchema?.minimum) {
      let minimum = Math.ceil(lastModifiedSchema.minimum);
      minimum === lastModifiedSchema.minimum &&
        lastModifiedSchema.exclusiveMinimum &&
        minimum++;
      startKeyAppend = minimum.toString().padStart(15, "0");
    }
    if (lastModifiedSchema?.maximum) {
      let maximum = Math.floor(lastModifiedSchema.maximum);
      maximum === lastModifiedSchema.maximum &&
        lastModifiedSchema.exclusiveMaximum &&
        maximum--;
      endKeyAppend = maximum.toString().padStart(15, "0");
    }

    const repeater: ReturnType<
      typeof Graffiti.prototype.discover<typeof schema>
    > = new Repeater(async (push, stop) => {
      const processedIds = new Set<string>();

      for (const channel of channels) {
        const encodedChannel = encodeURIComponent(channel);
        const startkey = encodedChannel + "/" + startKeyAppend;
        const endkey = encodedChannel + "/" + endKeyAppend;

        const result = await this.db.query<GraffitiObjectBase>(
          "index3/byChannelAndLastModified",
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
            push({
              value: object,
            });
          }
        }
      }
      stop();
      return {
        tombstoneRetention: this.tombstoneRetention,
      };
    });

    return repeater;
  };

  listChannels: Graffiti["listChannels"] = (...args) => {
    // TODO
    return (async function* () {})();
  };

  listOrphans: Graffiti["listOrphans"] = (...args) => {
    // TODO
    return (async function* () {})();
  };
}
