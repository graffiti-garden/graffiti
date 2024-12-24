import type { JSONSchema4 } from "json-schema";
import { Graffiti } from "./api";
import type {
  GraffitiObject,
  GraffitiObjectBase,
  GraffitiSessionBase,
} from "./types";
import Ajv from "ajv";
import { applyPatch } from "fast-json-patch";

export abstract class GraffitiSynchronized extends Graffiti {
  protected readonly ajv = new Ajv();
  protected readonly changes = new EventTarget();
  protected dispatchChanges(
    oldObject: GraffitiObjectBase,
    newObject?: GraffitiObjectBase,
  ) {
    this.changes.dispatchEvent(
      new CustomEvent("change", {
        detail: {
          oldObject,
          newObject,
        },
      }),
    );
  }

  protected abstract _patch(
    ...args: Parameters<Graffiti["patch"]>
  ): ReturnType<Graffiti["patch"]>;

  async patch(
    ...args: Parameters<Graffiti["patch"]>
  ): ReturnType<Graffiti["patch"]> {
    const oldObject = await this._patch(...args);
    const newObject: GraffitiObjectBase = { ...oldObject, tombstone: false };
    for (const prop of ["value", "channels", "allowed"] as const) {
      const ops = args[0][prop];
      if (!ops || !ops.length) continue;
      const result = applyPatch(newObject[prop], ops, false, false).newDocument;
    }
    this.dispatchChanges(oldObject, newObject);
    return oldObject;
  }

  // synchronize<Schema extends JSONSchema4>(
  //   ...args: Parameters<Graffiti["synchronize"]>
  // ): ReturnType<Graffiti["synchronize"]> {
  // const validate = this.ajv.compile(schema);
  // const matchOptions = {
  //   ifModifiedSince: options?.ifModifiedSince,
  //   channels,
  // };
  // const repeater = new Repeater < {
  // }
  //   GraffitiObject<Schema>>(
  // }
}
