import type { JSONSchema } from "@graffiti-garden/api";

export function editSchema(target: string) {
  return {
    properties: {
      value: {
        properties: {
          activity: { enum: ["Edit"] },
          target: { type: "string", enum: [target] },
          inserts: {
            type: "array",
            items: {
              type: "object",
              // A tuple of the charachter inserted
              // and the position using logoots
              properties: {
                char: { type: "string" },
                position: {
                  type: "array",
                  items: { type: "number" },
                },
              },
              required: ["char", "position"],
            },
          },
          deletes: {
            type: "object",
            // A map from object URLs to a
            // a set of positions for each insert
            additionalProperties: {
              type: "array",
              items: { type: "number" },
            },
          },
        },
        required: ["activity", "target"],
      },
    },
  } as const satisfies JSONSchema;
}
