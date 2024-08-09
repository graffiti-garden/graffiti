import { computed, MaybeRefOrGetter, type Ref } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
  useQuery,
  type GraffitiObject,
} from "@graffiti-garden/client-vue";

export interface Join extends GraffitiObject {
  value: {
    type: "Join";
    object: string;
    actor: string;
  };
}

export async function putJoin(object: string) {
  return useGraffiti().put({
    value: {
      type: "Join",
      object,
      actor: useGraffitiSession().webId,
    },
    channels: [object],
  });
}

export function useJoins(object: MaybeRefOrGetter<string>) {
  const values = useQuery([object], {
    query: () => ({
      properties: {
        value: {
          properties: {
            type: { enum: ["Join"] },
            object: { enum: [object] },
            actor: { type: "string" },
          },
        },
      },
    }),
  });

  const results = computed(() =>
    values.results.value.filter((v) => v.webId === v.value.actor),
  );

  return {
    ...values,
    results: results as Ref<Join[]>,
  };
}
