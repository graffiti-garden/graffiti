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
import type { Graffiti } from "./1-api";
import type {
  GraffitiObject,
  GraffitiObjectStream,
  GraffitiObjectStreamContinue,
  GraffitiPostObject,
  GraffitiSession,
} from "./2-types";
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

async function* wrapGraffitiStream<Schema extends JSONSchema>(
  stream: GraffitiObjectStream<Schema>,
): GraffitiObjectStream<Schema> {
  while (true) {
    const next = await stream.next();
    if (next.done) {
      const { cursor, continue: continue_ } = next.value;
      return {
        cursor,
        continue: (...args) => {
          const typedArgs = tuple([GraffitiOptionalSessionSchema]).parse(args);
          return continue_(...typedArgs);
        },
      };
    } else {
      yield next.value;
    }
  }
}
async function* wrapGraffitiContinueStream<Schema extends JSONSchema>(
  stream: GraffitiObjectStreamContinue<Schema>,
): GraffitiObjectStreamContinue<Schema> {
  while (true) {
    const next = await stream.next();
    if (next.done) {
      const { cursor, continue: continue_ } = next.value;
      return {
        cursor,
        continue: (...args) => {
          const typedArgs = tuple([GraffitiOptionalSessionSchema]).parse(args);
          return continue_(...typedArgs);
        },
      };
    } else {
      yield next.value;
    }
  }
}

// @ts-ignore - infinite nesting issue
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

  async post<Schema extends JSONSchema>(
    partialObject: GraffitiPostObject<Schema>,
    session: GraffitiSession,
  ): Promise<GraffitiObject<Schema>> {
    const typedArgs = tuple([
      GraffitiPostObjectSchema,
      GraffitiSessionSchema,
    ]).parse([partialObject, session]);

    return (await this.graffiti.post<{}>(
      ...typedArgs,
    )) as GraffitiObject<Schema>;
  }

  get: Graffiti["get"] = (...args) => {
    const typedArgs = tuple([
      GraffitiObjectUrlSchema,
      looseObject({}),
      GraffitiOptionalSessionSchema,
    ]).parse(args);

    return this.graffiti.get(...typedArgs) as Promise<
      GraffitiObject<(typeof args)[1]>
    >;
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
    const stream = this.graffiti.discover(...typedArgs) as GraffitiObjectStream<
      (typeof args)[1]
    >;
    return wrapGraffitiStream(stream);
  };

  continueDiscover: Graffiti["continueDiscover"] = (...args) => {
    const typedArgs = tuple([string(), GraffitiOptionalSessionSchema]).parse(
      args,
    );

    const stream = this.graffiti.continueDiscover(...typedArgs);
    return wrapGraffitiContinueStream(stream);
  };
}
