import type { GraffitiObject, JSONSchema } from "@graffiti-garden/api";

export function joinSchema(channel: string) {
  return {
    properties: {
      value: {
        properties: {
          activity: { const: "Add" },
          // The actor
          object: { type: "string" },
          // To the namebook
          target: { const: channel },
        },
        required: ["activity", "target", "object"],
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
