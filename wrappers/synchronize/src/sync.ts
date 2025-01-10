import Ajv from "ajv";
import { Graffiti } from "@graffiti-garden/api";
import type {
  GraffitiObjectBase,
  GraffitiObject,
  GraffitiSession,
  GraffitiStream,
} from "@graffiti-garden/api";
import { Repeater } from "@repeaterjs/repeater";
import { applyPropPatch, attemptAjvCompile, maskObject } from "./utilities";

type SynchronizeEvent = CustomEvent<{
  oldObject: GraffitiObjectBase;
  newObject?: GraffitiObjectBase;
}>;

function matchChannelsAllowed(
  object: GraffitiObjectBase,
  channels: string[],
  session?: GraffitiSession,
): boolean {
  return (
    object.channels.some((channel) => channels.includes(channel)) &&
    (object.allowed === undefined ||
      (!!session?.actor &&
        (object.actor === session.actor ||
          object.allowed.includes(session.actor))))
  );
}

export abstract class GraffitiSynchronized extends Graffiti {
  protected readonly ajv = new Ajv({ strict: false });
  protected readonly synchronizeEvents = new EventTarget();

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

  protected abstract _get: Graffiti["get"];
  get: Graffiti["get"] = async (...args) => {
    const object = await this._get(...args);
    this.synchronizeDispatch(object);
    return object;
  };

  protected abstract _put: Graffiti["put"];
  put: Graffiti["put"] = async (...args) => {
    const oldObject = await this._put(...args);
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

  protected abstract _patch: Graffiti["patch"];
  patch: Graffiti["patch"] = async (...args) => {
    const oldObject = await this._patch(...args);
    const newObject: GraffitiObjectBase = { ...oldObject };
    newObject.tombstone = false;
    for (const prop of ["value", "channels", "allowed"] as const) {
      applyPropPatch(prop, args[0], newObject);
    }
    this.synchronizeDispatch(oldObject, newObject);
    return oldObject;
  };

  protected abstract _delete: Graffiti["delete"];
  delete: Graffiti["delete"] = async (...args) => {
    const oldObject = await this._delete(...args);
    this.synchronizeDispatch(oldObject);
    return oldObject;
  };

  protected abstract _discover: Graffiti["discover"];
  discover: Graffiti["discover"] = (...args) => {
    const iterator = this._discover(...args);
    const dispatch = this.synchronizeDispatch.bind(this);
    const wrapper = async function* () {
      for await (const result of iterator) {
        if (!result.error) {
          dispatch(result.value);
        }
        yield result;
      }
    };
    return wrapper();
  };

  synchronize: Graffiti["synchronize"] = (...args) => {
    const [channels, schema, session] = args;
    const validate = attemptAjvCompile(this.ajv, schema);

    const repeater: GraffitiStream<GraffitiObject<typeof schema>> =
      new Repeater(async (push, stop) => {
        const callback = (event: SynchronizeEvent) => {
          const { oldObject: oldObjectRaw, newObject: newObjectRaw } =
            event.detail;

          if (
            newObjectRaw &&
            matchChannelsAllowed(newObjectRaw, channels, session)
          ) {
            const newObject = { ...newObjectRaw };
            maskObject(newObject, channels, session);
            if (validate(newObject)) {
              push({
                value: newObject,
              });
            }
          } else if (
            oldObjectRaw &&
            matchChannelsAllowed(oldObjectRaw, channels, session)
          ) {
            const oldObject = { ...oldObjectRaw };
            maskObject(oldObject, channels, session);
            if (validate(oldObject)) {
              push({
                value: oldObject,
              });
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
