import type { JSONSchema, GraffitiObject } from "@graffiti-garden/api";

export function chatNameSchema(channel: string) {
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
          activity: { enum: ["Add", "Remove"] },
          target: { type: "string" },
          object: { enum: [channel] },
          published: { type: "number" },
        },
      },
    },
  } as const satisfies JSONSchema;
}
export type MemberUpdateSchema = ReturnType<typeof memberUpdateSchema>;
export type MemberUpdateObject = GraffitiObject<MemberUpdateSchema>;
