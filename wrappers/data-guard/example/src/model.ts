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
        type: { const: "Note" },
        content: { type: "string" },
        published: { type: "string" },
        mentions: {
          type: "array",
          items: { type: "string" },
        },
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
      required: ["type", "content", "published"],
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
  type: "Note";
  content: string;
  published: string;
  mentions?: string[];
  attachment?: MessageAttachment;
}

export type MessageObject = Omit<GraffitiObjectBase, "value"> & {
  value: MessageValue;
};

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
