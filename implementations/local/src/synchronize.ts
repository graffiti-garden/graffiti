import Ajv from "ajv-draft-04";
import type {
  Graffiti,
  GraffitiSession,
  JSONSchema4,
} from "@graffiti-garden/api";
import type { GraffitiObjectBase } from "@graffiti-garden/api";
import { Repeater } from "@repeaterjs/repeater";
import { applyPatch } from "fast-json-patch";
import {
  applyGraffitiPatch,
  attemptAjvCompile,
  isActorAllowedGraffitiObject,
  locationToUri,
  maskGraffitiObject,
  unpackLocationOrUri,
} from "./utilities.js";

type GraffitiDatabaseMethods = Pick<
  Graffiti,
  "get" | "put" | "patch" | "delete" | "discover" | "recoverOrphans"
>;

type Callback = (
  oldObject: GraffitiObjectBase,
  newObject?: GraffitiObjectBase,
) => void;

/**
 * Wraps a partial implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * to provide the [`synchronize`](https://api.graffiti.garden/classes/Graffiti.html#synchronize) method.
 * The partial implementation must include the primary database methods:
 * `get`, `put`, `patch`, `delete`, and `discover`.
 */
export class GraffitiSynchronize
  implements
    Pick<
      Graffiti,
      | "put"
      | "get"
      | "patch"
      | "delete"
      | "discover"
      | "recoverOrphans"
      | "synchronizeDiscover"
      | "synchronizeGet"
      | "synchronizeRecoverOrphans"
    >
{
  protected readonly ajv: Ajv;
  protected readonly graffiti: GraffitiDatabaseMethods;
  protected readonly callbacks = new Set<Callback>();

  // Pass in the ajv instance
  // and database methods to wrap
  constructor(graffiti: GraffitiDatabaseMethods, ajv?: Ajv) {
    this.ajv = ajv ?? new Ajv({ strict: false });
    this.graffiti = graffiti;
  }

  protected async synchronizeDispatch(
    oldObject: GraffitiObjectBase,
    newObject?: GraffitiObjectBase,
    waitForListeners = false,
  ) {
    for (const callback of this.callbacks) {
      callback(oldObject, newObject);
    }
    if (waitForListeners) {
      // Wait for the listeners to receive
      // their objects, before returning the operation
      // that triggered them.
      //
      // This is important for mutators (put, patch, delete)
      // to ensure the application state has been updated
      // everywhere before returning, giving consistent
      // feedback to the user that the operation has completed.
      //
      // The opposite is true for accessors (get, discover, recoverOrphans),
      // where it is a weird user experience to call `get`
      // in one place and have the application update
      // somewhere else first. It is also less efficient.
      //
      // The hack is simply to await one "macro task cycle".
      // We need to wait for this cycle rather than using
      // `await push` in the callback, because it turns out
      // that `await push` won't resolve until the following
      // .next() call of the iterator, so if only
      // one .next() is called, this dispatch will hang.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  get: Graffiti["get"] = async (...args) => {
    const object = await this.graffiti.get(...args);
    this.synchronizeDispatch(object);
    return object;
  };

  put: Graffiti["put"] = async (...args) => {
    const oldObject = await this.graffiti.put(...args);
    const partialObject = args[0];
    const newObject: GraffitiObjectBase = {
      ...oldObject,
      value: partialObject.value,
      channels: partialObject.channels,
      allowed: partialObject.allowed,
      tombstone: false,
    };
    await this.synchronizeDispatch(oldObject, newObject, true);
    return oldObject;
  };

  patch: Graffiti["patch"] = async (...args) => {
    const oldObject = await this.graffiti.patch(...args);
    const newObject: GraffitiObjectBase = { ...oldObject };
    newObject.tombstone = false;
    for (const prop of ["value", "channels", "allowed"] as const) {
      applyGraffitiPatch(applyPatch, prop, args[0], newObject);
    }
    await this.synchronizeDispatch(oldObject, newObject, true);
    return oldObject;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const oldObject = await this.graffiti.delete(...args);
    await this.synchronizeDispatch(oldObject, undefined, true);
    return oldObject;
  };

  protected objectStream<Schema extends JSONSchema4>(
    iterator: ReturnType<typeof Graffiti.prototype.discover<Schema>>,
  ) {
    const dispatch = this.synchronizeDispatch.bind(this);
    const wrapper = async function* () {
      let result = await iterator.next();
      while (!result.done) {
        if (!result.value.error) {
          dispatch(result.value.value);
        }
        yield result.value;
        result = await iterator.next();
      }
      return result.value;
    };
    return wrapper();
  }

  discover: Graffiti["discover"] = (...args) => {
    const iterator = this.graffiti.discover(...args);
    return this.objectStream(iterator);
  };

  recoverOrphans: Graffiti["recoverOrphans"] = (...args) => {
    const iterator = this.graffiti.recoverOrphans(...args);
    return this.objectStream(iterator);
  };

  protected synchronize<Schema extends JSONSchema4>(
    matchObject: (object: GraffitiObjectBase) => boolean,
    channels: string[],
    schema: Schema,
    session?: GraffitiSession | null,
  ) {
    const validate = attemptAjvCompile(this.ajv, schema);

    const repeater: ReturnType<
      typeof Graffiti.prototype.synchronizeDiscover<typeof schema>
    > = new Repeater(async (push, stop) => {
      const callback: Callback = (oldObjectRaw, newObjectRaw) => {
        for (const objectRaw of [newObjectRaw, oldObjectRaw]) {
          if (
            objectRaw &&
            matchObject(objectRaw) &&
            isActorAllowedGraffitiObject(objectRaw, session)
          ) {
            const object = { ...objectRaw };
            maskGraffitiObject(object, channels, session);
            if (validate(object)) {
              push({ value: object });
              break;
            }
          }
        }
      };

      this.callbacks.add(callback);
      await stop;
      this.callbacks.delete(callback);
    });

    return repeater;
  }

  synchronizeDiscover: Graffiti["synchronizeDiscover"] = (...args) => {
    const [channels, schema, session] = args;
    function matchObject(object: GraffitiObjectBase) {
      return object.channels.some((channel) => channels.includes(channel));
    }
    return this.synchronize(matchObject, channels, schema, session);
  };

  synchronizeGet: Graffiti["synchronizeGet"] = (...args) => {
    const [locationOrUri, schema, session] = args;
    function matchObject(object: GraffitiObjectBase) {
      const objectUri = locationToUri(object);
      const { uri } = unpackLocationOrUri(locationOrUri);
      return objectUri === uri;
    }
    return this.synchronize(matchObject, [], schema, session);
  };

  synchronizeRecoverOrphans: Graffiti["synchronizeRecoverOrphans"] = (
    ...args
  ) => {
    const [schema, session] = args;
    function matchObject(object: GraffitiObjectBase) {
      return object.actor === session.actor && object.channels.length === 0;
    }
    return this.synchronize(matchObject, [], schema, session);
  };
}
