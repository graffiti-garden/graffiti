import {
  looseObject,
  array,
  string,
  url,
  union,
  instanceof as instanceof_,
  int,
  tuple,
  nullable,
  optional,
  nonnegative,
  extend,
} from "zod/mini";
import type { Graffiti } from "./1-api.js";
import type { GraffitiObjectStream } from "./2-types.js";
import type { JSONSchema } from "json-schema-to-ts";

export const GraffitiPostObjectSchema = looseObject({
  value: looseObject({}),
  channels: array(string()),
  allowed: optional(nullable(array(url()))),
});
export const GraffitiObjectSchema = extend(GraffitiPostObjectSchema, {
  url: url(),
  actor: url(),
});

export const GraffitiObjectUrlSchema = union([
  looseObject({
    url: url(),
  }),
  url(),
]);

export const GraffitiSessionSchema = looseObject({
  actor: url(),
});
export const GraffitiOptionalSessionSchema = optional(
  nullable(GraffitiSessionSchema),
);

export const GraffitiPostMediaSchema = looseObject({
  data: instanceof_(Blob),
  allowed: optional(nullable(array(url()))),
});
export const GraffitiMediaSchema = extend(GraffitiPostMediaSchema, {
  actor: url(),
});
export const GraffitiMediaAcceptSchema = looseObject({
  types: optional(array(string())),
  maxBytes: optional(int().check(nonnegative())),
});

export class GraffitiRuntimeTypes implements Graffiti {
  sessionEvents: Graffiti["sessionEvents"];
  constructor(protected readonly graffiti: Graffiti) {
    this.sessionEvents = this.graffiti.sessionEvents;
  }

  login: Graffiti["login"] = (...args) => {
    const typedArgs = tuple([optional(url())]).parse(args);
    return this.graffiti.login(...typedArgs);
  };

  logout: Graffiti["logout"] = (...args) => {
    const typedArgs = tuple([GraffitiSessionSchema]).parse(args);
    return this.graffiti.logout(...typedArgs);
  };

  handleToActor: Graffiti["handleToActor"] = (...args) => {
    const typedArgs = tuple([string()]).parse(args);
    return this.graffiti.handleToActor(...typedArgs);
  };

  actorToHandle: Graffiti["actorToHandle"] = (...args) => {
    const typedArgs = tuple([url()]).parse(args);
    return this.graffiti.actorToHandle(...typedArgs);
  };

  // @ts-ignore - inferred types on post do not effect output
  post: Graffiti["post"] = (...args) => {
    const typedArgs = tuple([
      GraffitiPostObjectSchema,
      GraffitiSessionSchema,
    ]).parse(args);

    return this.graffiti.post<{}>(...typedArgs);
  };

  get: Graffiti["get"] = (...args) => {
    const typedArgs = tuple([
      GraffitiObjectUrlSchema,
      looseObject({}),
      GraffitiOptionalSessionSchema,
    ]).parse(args);

    return this.graffiti.get<(typeof args)[1]>(
      typedArgs[0],
      typedArgs[1] as (typeof args)[1],
      typedArgs[2],
    );
  };

  delete: Graffiti["delete"] = (...args) => {
    const typedArgs = tuple([
      GraffitiObjectUrlSchema,
      GraffitiSessionSchema,
    ]).parse(args);
    return this.graffiti.delete(...typedArgs);
  };

  postMedia: Graffiti["postMedia"] = (...args) => {
    const typedArgs = tuple([
      GraffitiPostMediaSchema,
      GraffitiSessionSchema,
    ]).parse(args);
    return this.graffiti.postMedia(...typedArgs);
  };

  getMedia: Graffiti["getMedia"] = (...args) => {
    const typedArgs = tuple([
      url(),
      GraffitiMediaAcceptSchema,
      GraffitiOptionalSessionSchema,
    ]).parse(args);

    return this.graffiti.getMedia(...typedArgs);
  };

  deleteMedia: Graffiti["deleteMedia"] = (...args) => {
    const typedArgs = tuple([url(), GraffitiSessionSchema]).parse(args);

    return this.graffiti.deleteMedia(...typedArgs);
  };

  discover: Graffiti["discover"] = (...args) => {
    const typedArgs = tuple([
      array(string()),
      looseObject({}),
      GraffitiOptionalSessionSchema,
    ]).parse(args);
    return this.graffiti.discover<(typeof args)[1]>(
      typedArgs[0],
      typedArgs[1] as (typeof args)[1],
      typedArgs[2],
    );
  };

  // @ts-ignore - inferred types on continueDiscover do not effect output
  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    const typedArgs = tuple([string(), GraffitiOptionalSessionSchema]).parse(
      args,
    );

    return this.graffiti.continueDiscover<{}>(...typedArgs);
  };
}
