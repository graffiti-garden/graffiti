import { computed, toValue, MaybeRefOrGetter, type Ref } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
  useQuery,
  type GraffitiObject,
} from "@graffiti-garden/client-vue";

export interface Note extends GraffitiObject {
  value: {
    type: "Note";
    content: string;
    at?: string[];
    inReplyTo?: string;
    createdAt: string;
  };
}

export function useNotes(options: {
  webIds?: MaybeRefOrGetter<MaybeRefOrGetter<string>[]>;
  inReplyTo?: MaybeRefOrGetter<string>;
}) {
  const channels = () => [
    ...(options.webIds ? toValue(options.webIds).map((w) => toValue(w)) : []),
    ...(options.inReplyTo ? [toValue(options.inReplyTo)] : []),
  ];
  console.log(channels());
  const values = useQuery(channels, {
    query: () => ({
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
            inReplyTo: toValue(options.inReplyTo)
              ? { enum: [toValue(options.inReplyTo)] }
              : { type: "string" },
          },
          required: ["type", "content", "createdAt"],
        },
      },
      ...(options.webIds &&
      toValue(options.webIds) &&
      toValue(options.webIds).length
        ? {
            anyOf: [
              {
                properties: {
                  value: {
                    properties: {
                      at: {
                        items: {
                          enum: toValue(options.webIds).map((w) => toValue(w)),
                        },
                      },
                    },
                  },
                },
              },
              {
                properties: {
                  webId: {
                    enum: toValue(options.webIds).map((w) => toValue(w)),
                  },
                },
              },
            ],
          }
        : {}),
    }),
  });

  const results = computed(() =>
    values.results.value.map((v) => {
      v.value.createdAt = new Date(v.value.createdAt);
      return v as Note;
    }),
  );

  return {
    ...values,
    results,
  };
}
