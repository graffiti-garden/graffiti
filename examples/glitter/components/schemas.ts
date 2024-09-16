import { toValue, type MaybeRefOrGetter } from "vue";
import { type JSONSchema4 } from "@graffiti-garden/client-vue";

export function joinSchema(object: MaybeRefOrGetter<string>) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Join"] },
          object: { type: "string", enum: [toValue(object)] },
          actor: { type: "string" },
        },
        required: ["type", "object"],
      },
    },
  } as const;
}

export function followSchema(
  webId: MaybeRefOrGetter<string>,
  object?: MaybeRefOrGetter<string | undefined>,
) {
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

export function profileSchema(webId: MaybeRefOrGetter<string>) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Profile"] },
          name: { type: "string" },
          describes: { type: "string", enum: [toValue(webId)] },
        },
        required: ["type", "name"],
      },
    },
  } as const;
}
