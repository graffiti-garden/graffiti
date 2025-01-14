import type { JSONSchema4 } from "@graffiti-garden/api";

export function joinSchema(object: string) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Join"] },
          object: { type: "string", enum: [object] },
          actor: { type: "string" },
        },
        required: ["type", "object"],
      },
    },
  } as const satisfies JSONSchema4;
}

export function followSchema(actor: string, object?: string) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Follow"] },
          object: {
            type: "string",
            ...(object ? { enum: [object] } : {}),
          },
          actor: { type: "string", enum: [actor] },
        },
        required: ["type", "object"],
      },
      actor: { type: "string", enum: [actor] },
    },
  } as const satisfies JSONSchema4;
}

export function profileSchema(actor: string) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Profile"] },
          name: { type: "string" },
          describes: { type: "string", enum: [actor] },
        },
        required: ["type", "name"],
      },
    },
  } as const satisfies JSONSchema4;
}

export function noteSchema(inReplyTo?: string) {
  return {
    properties: {
      value: {
        properties: {
          content: { type: "string" },
          createdAt: { type: "string" },
          at: {
            type: "array",
            items: { type: "string" },
          },
          inReplyTo: {
            type: "string",
            ...(inReplyTo ? { enum: [inReplyTo] } : {}),
          },
        },
        required: ["content", "createdAt"],
      },
    },
  } as const satisfies JSONSchema4;
}
