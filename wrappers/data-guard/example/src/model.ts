import type {
  GraffitiObjectBase,
  JSONSchema,
} from "@graffiti-garden/api";

export const messageChannel =
  "https://graffiti.garden/examples/wrapper-data-guard/messages";

export const messageSchema: JSONSchema = {
  type: "object",
  properties: {
    value: {
      type: "object",
      properties: {
        content: { type: "string" },
        published: { type: "string" },
        inReplyTo: { type: "string" },
        mentions: {
          type: "array",
          items: { type: "string" },
        },
        replies: { type: "boolean" },
        id: { type: "string" },
        attachment: {
          type: "object",
          properties: {
            type: { const: "Document" },
            url: { type: "string" },
            mediaType: { type: "string" },
            name: { type: "string" },
            size: { type: "number" },
          },
          required: ["type", "url", "mediaType", "name", "size"],
        },
      },
      required: [
        "content",
        "published",
        "inReplyTo",
        "mentions",
        "replies",
        "id",
      ],
    },
  },
  required: ["value"],
};

export interface MessageAttachment {
  type: "Document";
  url: string;
  mediaType: string;
  name: string;
  size: number;
}

export interface MessageValue {
  content: string;
  published: string;
  inReplyTo: string;
  mentions: string[];
  replies: boolean;
  id: string;
  attachment?: MessageAttachment;
}

export type MessageObject = Omit<GraffitiObjectBase, "value"> & {
  value: MessageValue;
};

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
