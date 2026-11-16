import type { JSONSchema, GraffitiObject } from "@graffiti-garden/api";
import {
  type infer as infer_,
  string,
  url,
  array,
  optional,
  nullable,
  strictObject,
  looseObject,
  custom,
  number,
  boolean,
} from "zod/mini";

const GraffitiObjectSchema = strictObject({
  value: looseObject({}),
  channels: array(string()),
  allowed: optional(nullable(array(url()))),
  url: url(),
  actor: url(),
});
export const Uint8ArraySchema = custom<Uint8Array>(
  (v): v is Uint8Array => v instanceof Uint8Array,
);
export const TagsSchema = array(Uint8ArraySchema);

export const MESSAGE_TAGS_KEY = "t";
export const MESSAGE_OBJECT_KEY = "o";
export const MESSAGE_METADATA_KEY = "m";
export const MessageBaseSchema = strictObject({
  [MESSAGE_TAGS_KEY]: TagsSchema,
  [MESSAGE_OBJECT_KEY]: GraffitiObjectSchema,
  [MESSAGE_METADATA_KEY]: Uint8ArraySchema,
});
type MessageBase = infer_<typeof MessageBaseSchema>;

export const LABELED_MESSAGE_ID_KEY = "id";
export const LABELED_MESSAGE_MESSAGE_KEY = "m";
export const LABELED_MESSAGE_LABEL_KEY = "l";
export const LabeledMessageBaseSchema = strictObject({
  [LABELED_MESSAGE_ID_KEY]: string(),
  [LABELED_MESSAGE_MESSAGE_KEY]: MessageBaseSchema,
  [LABELED_MESSAGE_LABEL_KEY]: number(),
});
export type LabeledMessageBase = infer_<typeof LabeledMessageBaseSchema>;

export type Message<Schema extends JSONSchema> = MessageBase & {
  [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
};
export type LabeledMessage<Schema extends JSONSchema> = LabeledMessageBase & {
  [LABELED_MESSAGE_MESSAGE_KEY]: {
    [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
  };
};

export const SendResponseSchema = strictObject({ id: string() });

export const MessageResultSchema = strictObject({
  results: array(LabeledMessageBaseSchema),
  hasMore: boolean(),
  cursor: string(),
});
