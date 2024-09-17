import { toValue, type MaybeRefOrGetter } from "vue";
import { type JSONSchema4 } from "@graffiti-garden/client-vue";

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
  } as const;
}

export function followSchema(webId: string, object?: string) {
  const objectValue = toValue(object);
  const webIdValue = toValue(webId);
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Follow"] },
          object: {
            type: "string",
            ...(objectValue ? { enum: [objectValue] } : {}),
          },
          actor: { type: "string", enum: [webIdValue] },
        },
        required: ["type", "object"],
      },
      webId: { type: "string", enum: [webIdValue] },
    },
  } as const;
}

export function profileSchema(webId: string) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Profile"] },
          name: { type: "string" },
          describes: { type: "string", enum: [webId] },
        },
        required: ["type", "name"],
      },
    },
  } as const;
}

export function noteSchema(inReplyTo?: string) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Note"] },
          content: { type: "string" },
          createdAt: { type: "string" },
          at: {
            type: "array",
            items: { type: "string" },
          },
          inReplyTo: inReplyTo ? { enum: [inReplyTo] } : { type: "string" },
        },
        required: ["type", "content", "createdAt"],
      },
    },
  } as const;
}
