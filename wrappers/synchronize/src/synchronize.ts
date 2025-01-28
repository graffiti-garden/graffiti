import Ajv from "ajv-draft-04";
import type { Graffiti } from "@graffiti-garden/api";
import type { GraffitiObjectBase } from "@graffiti-garden/api";
import { Repeater } from "@repeaterjs/repeater";
import {
  applyGraffitiPatch,
  attemptAjvCompile,
  isActorAllowedGraffitiObject,
  maskGraffitiObject,
} from "./utilities";

type SynchronizeEvent = CustomEvent<{
  oldObject: GraffitiObjectBase;
  newObject?: GraffitiObjectBase;
}>;

type GraffitiDatabaseMethods = Pick<
  Graffiti,
  "get" | "put" | "patch" | "delete" | "discover"
>;

/**
 * Wraps a partial implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * to provide the [`synchronize`](https://api.graffiti.garden/classes/Graffiti.html#synchronize) method.
 * The partial implementation must include the primary database methods:
 * `get`, `put`, `patch`, `delete`, and `discover`.
 */
export class GraffitiSynchronize {
  protected readonly synchronizeEvents = new EventTarget();
  protected readonly ajv: Ajv;
  protected readonly graffiti: GraffitiDatabaseMethods;

  // Pass in the ajv instance
  // and database methods to wrap
  constructor(graffiti: GraffitiDatabaseMethods, ajv?: Ajv) {
    this.ajv = ajv ?? new Ajv({ strict: false });
    this.graffiti = graffiti;
  }

  protected synchronizeDispatch(
    oldObject: GraffitiObjectBase,
    newObject?: GraffitiObjectBase,
  ) {
    const event: SynchronizeEvent = new CustomEvent("change", {
      detail: {
        oldObject,
        newObject,
      },
    });
    this.synchronizeEvents.dispatchEvent(event);
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
    this.synchronizeDispatch(oldObject, newObject);
    return oldObject;
  };

  patch: Graffiti["patch"] = async (...args) => {
    const oldObject = await this.graffiti.patch(...args);
    const newObject: GraffitiObjectBase = { ...oldObject };
    newObject.tombstone = false;
    for (const prop of ["value", "channels", "allowed"] as const) {
      applyGraffitiPatch(prop, args[0], newObject);
    }
    this.synchronizeDispatch(oldObject, newObject);
    return oldObject;
  };

  delete: Graffiti["delete"] = async (...args) => {
    const oldObject = await this.graffiti.delete(...args);
    this.synchronizeDispatch(oldObject);
    return oldObject;
  };

  discover: Graffiti["discover"] = (...args) => {
    const iterator = this.graffiti.discover(...args);
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
  };

  synchronize: Graffiti["synchronize"] = (...args) => {
    const [channels, schema, session] = args;
    const validate = attemptAjvCompile(this.ajv, schema);

    const repeater: ReturnType<
      typeof Graffiti.prototype.synchronize<typeof schema>
    > = new Repeater(async (push, stop) => {
      const callback = (event: SynchronizeEvent) => {
        const { oldObject: oldObjectRaw, newObject: newObjectRaw } =
          event.detail;

        for (const objectRaw of [newObjectRaw, oldObjectRaw]) {
          if (
            objectRaw &&
            objectRaw.channels.some((channel) => channels.includes(channel)) &&
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

      this.synchronizeEvents.addEventListener(
        "change",
        callback as EventListener,
      );
      await stop;
      this.synchronizeEvents.removeEventListener(
        "change",
        callback as EventListener,
      );
    });

    return repeater;
  };
}
