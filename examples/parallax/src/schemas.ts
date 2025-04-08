import type { JSONSchema, GraffitiObject } from "@graffiti-garden/api";

export function chatNameSchema(channel: string, actor?: string) {
  return {
    properties: {
      value: {
        required: ["describes", "name", "published"],
        properties: {
          describes: { enum: [channel] },
          name: { type: "string" },
          published: { type: "number" },
        },
      },
      actor: actor ? { enum: [actor] } : {},
    },
  } as const satisfies JSONSchema;
}
export type ChatNameSchema = ReturnType<typeof chatNameSchema>;
export type ChatNameObject = GraffitiObject<ChatNameSchema>;

export function memberUpdateSchema(channel: string) {
  return {
    properties: {
      value: {
        required: ["activity", "target", "object", "published"],
        properties: {
          // Add/Remove the target to/from the object
          activity: { enum: ["Add", "Remove"] },
          target: { type: "string" }, // actor to add
          object: { enum: [channel] },
          published: { type: "number" },
        },
      },
    },
  } as const satisfies JSONSchema;
}
export type MemberUpdateSchema = ReturnType<typeof memberUpdateSchema>;
export type MemberUpdateObject = GraffitiObject<MemberUpdateSchema>;

export function messageSchema() {
  return {
    properties: {
      value: {
        required: ["content", "published"],
        properties: {
          content: { type: "string" },
          published: { type: "number" },
          to: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  } as const satisfies JSONSchema;
}
export type MessageSchema = ReturnType<typeof messageSchema>;
export type MessageObject = GraffitiObject<MessageSchema>;
