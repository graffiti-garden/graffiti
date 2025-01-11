import {
  type Graffiti,
  type GraffitiObject,
  type GraffitiObjectBase,
  type GraffitiLocation,
  type GraffitiStream,
  type GraffitiSession,
  type GraffitiLoginEvent,
  type GraffitiLogoutEvent,
  GraffitiErrorNotFound,
  GraffitiErrorSchemaMismatch,
  GraffitiErrorForbidden,
  GraffitiErrorPatchError,
} from "@graffiti-garden/api";
import { GraffitiSynchronized } from "./sync";
import PouchDB from "pouchdb";
import PouchDBFind from "pouchdb-find";
import {
  locationToUri,
  uriToLocation,
  unpackLocationOrUri,
  randomBase64,
  applyPropPatch,
  attemptAjvCompile,
  maskObject,
  isAllowed,
} from "./utilities";
import { Repeater } from "@repeaterjs/repeater";

PouchDB.plugin(PouchDBFind);

export interface GraffitiPouchDBOptions {
  sourceName?: string;
  pouchDBOptions?: PouchDB.Configuration.DatabaseConfiguration;
}

export class GraffitiPouchDB extends GraffitiSynchronized {
  protected readonly db: PouchDB.Database<GraffitiObjectBase>;
  protected readonly sessionDb: PouchDB.Database<GraffitiSession>;
  protected readonly source: string;
  locationToUri = locationToUri;
  uriToLocation = uriToLocation;

  constructor(options?: GraffitiPouchDBOptions) {
    super();
    this.source = options?.sourceName ?? "local";
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
        _id: "_design/index",
        views: {
          byChannel: {
            map: function (object: GraffitiObjectBase) {
              object.channels.forEach(function (channel) {
                //@ts-ignore
                emit(channel);
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

    // This is only ever meant for local storage
    // so it doesn't need special options
    this.sessionDb = new PouchDB<GraffitiSession>("graffitiDbSession");

    // Look for any existing sessions
    const sessionRestorer = async () => {
      // Allow listeners to be added first
      await Promise.resolve();

      const docs = await this.sessionDb.allDocs({
        include_docs: true,
      });
      let actor: string | undefined;
      if (docs.rows.length) {
        actor = docs.rows[docs.rows.length - 1].doc?.actor;
      }
      if (actor) {
        const event: GraffitiLoginEvent = new CustomEvent("login", {
          detail: { session: { actor } },
        });
        this.sessionEvents.dispatchEvent(event);
      }
    };
    sessionRestorer();
  }

  protected async queryByLocation(location: GraffitiLocation) {
    const uri = locationToUri(location);
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
    // Correct the date
    docs.forEach((doc) => (doc.lastModified = new Date(doc.lastModified)));
    return docs;
  }

  protected docId(location: GraffitiLocation) {
    return locationToUri(location) + "/" + randomBase64();
  }

  protected _get: Graffiti["get"] = async (...args) => {
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
    if (!isAllowed(doc, session)) throw new GraffitiErrorNotFound();

    // Mask out the allowed list and channels
    // if the user is not the owner
    maskObject(object, [], session);

    const validate = attemptAjvCompile(this.ajv, schema);
    if (!validate(object)) {
      throw new GraffitiErrorSchemaMismatch();
    }
    return object;
  };

  protected async deleteBefore(
    location: GraffitiLocation,
    modifiedBefore?: Date,
  ) {
    const docs = (await this.queryByLocation(location)).filter(
      (doc) => !modifiedBefore || doc.lastModified < modifiedBefore,
    );
    if (!docs.length) return;

    // Get the oldest one (although
    // there should only be one unless
    // something bad happens)
    const existingDoc = docs.reduce((a, b) =>
      a.lastModified < b.lastModified ? a : b,
    );

    // Change it's tombstone to true
    // and update it's timestamp
    const deletedDoc = {
      ...existingDoc,
      tombstone: true,
      lastModified: modifiedBefore ?? new Date(),
    };
    await this.db.put(deletedDoc);
    const { _id, _rev, ...deletedObject } = deletedDoc;
    return deletedObject;
  }

  protected _delete: Graffiti["delete"] = async (...args) => {
    const [locationOrUri, session] = args;
    const { location } = unpackLocationOrUri(locationOrUri);
    if (location.actor !== session.actor) {
      throw new GraffitiErrorForbidden();
    }

    const deletedObject = await this.deleteBefore(location);
    if (!deletedObject) {
      throw new GraffitiErrorNotFound();
    }
    return deletedObject;
  };

  protected _put: Graffiti["put"] = async (...args) => {
    const [objectPartial, session] = args;
    if (objectPartial.actor && objectPartial.actor !== session.actor) {
      throw new GraffitiErrorForbidden();
    }

    const object: GraffitiObjectBase = {
      value: objectPartial.value,
      channels: objectPartial.channels,
      allowed: objectPartial.allowed,
      name: objectPartial.name ?? randomBase64(),
      source: "local",
      actor: session.actor,
      tombstone: false,
      lastModified: new Date(),
    };

    await this.db.put({
      _id: this.docId(object),
      ...object,
    });

    // Delete the old object
    const previousObject = await this.deleteBefore(object, object.lastModified);
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

  protected _patch: Graffiti["patch"] = async (...args) => {
    const [patch, locationOrUri, session] = args;
    const { location } = unpackLocationOrUri(locationOrUri);
    if (location.actor !== session.actor) {
      throw new GraffitiErrorForbidden();
    }
    const originalObject = await this._get(locationOrUri, {}, session);

    // Patch it outside of the database
    const patchObject: GraffitiObjectBase = { ...originalObject };
    for (const prop of ["value", "channels", "allowed"] as const) {
      applyPropPatch(prop, patch, patchObject);
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

    patchObject.lastModified = new Date();
    await this.db.put({
      ...patchObject,
      _id: this.docId(patchObject),
    });

    // Delete the old object
    await this.deleteBefore(patchObject, patchObject.lastModified);

    return {
      ...originalObject,
      tombstone: true,
      lastModified: patchObject.lastModified,
    };
  };

  protected _discover: Graffiti["discover"] = (...args) => {
    const [channels, schema, session] = args;

    const validate = attemptAjvCompile(this.ajv, schema);

    const repeater: GraffitiStream<GraffitiObject<typeof schema>> =
      new Repeater(async (push, stop) => {
        const result = await this.db.query<GraffitiObjectBase>(
          "index/byChannel",
          {
            keys: channels,
            include_docs: true,
          },
        );

        for (const row of result.rows) {
          const doc = row.doc;
          if (!doc) continue;

          const { _id, _rev, ...object } = doc;

          // Make sure the user is allowed to see it
          if (!isAllowed(doc, session)) continue;

          // Mask out the allowed list and channels
          // if the user is not the owner
          maskObject(object, channels, session);

          // Correct the date
          object.lastModified = new Date(object.lastModified);

          // Check that it matches the schema
          if (validate(object)) {
            push({
              value: object,
            });
          }
        }
        stop();
      });

    return repeater;
  };

  async login(actor?: string, state?: string) {
    if (!actor && typeof window !== "undefined") {
      const response = window.prompt("Choose an actor ID");
      if (response) actor = response;
    }

    let detail: GraffitiLoginEvent["detail"];

    if (!actor) {
      detail = {
        state,
        error: new Error("No actor ID provided to login"),
      };
    } else {
      // store it in the database
      const session = { actor };
      await this.sessionDb.put({
        _id: new Date().toISOString(),
        ...session,
      });

      detail = {
        state,
        session,
      };
    }

    const event: GraffitiLoginEvent = new CustomEvent("login", { detail });
    this.sessionEvents.dispatchEvent(event);
  }

  async logout(session: GraffitiSession, state?: string) {
    let detail: GraffitiLogoutEvent["detail"];

    // remove the session from the database
    const result = await this.sessionDb.find({
      selector: { actor: session.actor },
    });
    if (result.docs.length === 0) {
      detail = {
        state,
        actor: session.actor,
        error: new Error("Not logged in with that actor"),
      };
    } else {
      for (const doc of result.docs) {
        await this.sessionDb.remove(doc);
      }
      detail = {
        state,
        actor: session.actor,
      };
    }

    const event: GraffitiLogoutEvent = new CustomEvent("logout", { detail });
    this.sessionEvents.dispatchEvent(event);
  }

  sessionEvents = new EventTarget();

  listChannels: Graffiti["listChannels"] = (...args) => {
    // TODO
    return (async function* () {})();
  };

  listOrphans: Graffiti["listOrphans"] = (...args) => {
    // TODO
    return (async function* () {})();
  };
}
