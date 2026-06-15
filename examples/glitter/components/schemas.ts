import type { GraffitiObject, JSONSchema } from "@graffiti-garden/api";

export function joinSchema(channel: string) {
  return {
    properties: {
      value: {
        properties: {
          activity: { const: "Add" },
          object: { type: "string" },
          target: { const: channel },
        },
        required: ["activity", "object", "target"],
      },
    },
  } as const satisfies JSONSchema;
}
export type JoinObject = GraffitiObject<ReturnType<typeof joinSchema>>;

export function followSchema(actor: string, object?: string) {
  return {
    properties: {
      value: {
        properties: {
          activity: { const: "Follow" },
          object: {
            type: "string",
            ...(object ? { const: object } : {}),
          },
        },
        required: ["activity", "object"],
      },
      actor: { const: actor },
    },
  } as const satisfies JSONSchema;
}

export function profileSchema(actor: string) {
  return {
    properties: {
      value: {
        properties: {
          name: { type: "string" },
          describes: { const: actor },
          published: { type: "number" },
        },
        required: ["name", "describes", "published"],
      },
      actor: { const: actor },
    },
  } as const satisfies JSONSchema;
}

export function noteSchema(inReplyTo?: string) {
  return {
    properties: {
      value: {
        properties: {
          content: { type: "string" },
          published: { type: "number" },
          isNotQuote: { type: "boolean" },
          to: {
            type: "array",
            items: { type: "string" },
          },
          inReplyTo: {
            type: "string",
            ...(inReplyTo ? { const: inReplyTo } : {}),
          },
        },
        required: ["content", "published"],
      },
    },
  } as const satisfies JSONSchema;
}
