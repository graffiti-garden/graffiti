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

export const INBOX_MESSAGE_ID_KEY = "id";
export const INBOX_MESSAGE_MESSAGE_KEY = "m";
export const InboxMessageBaseSchema = strictObject({
  [INBOX_MESSAGE_ID_KEY]: string(),
  [INBOX_MESSAGE_MESSAGE_KEY]: MessageBaseSchema,
});
export type InboxMessageBase = infer_<typeof InboxMessageBaseSchema>;

export type Message<Schema extends JSONSchema> = MessageBase & {
  [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
};
export type InboxMessage<Schema extends JSONSchema> = InboxMessageBase & {
  [INBOX_MESSAGE_MESSAGE_KEY]: {
    [MESSAGE_OBJECT_KEY]: GraffitiObject<Schema>;
  };
};

export const SendResponseSchema = strictObject({ id: string() });

export const MessageResultSchema = strictObject({
  results: array(InboxMessageBaseSchema),
  hasMore: boolean(),
  cursor: string(),
});
