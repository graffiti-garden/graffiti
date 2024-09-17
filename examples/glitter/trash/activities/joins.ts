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
    actor?: string;
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
          required: ["type", "object"],
        },
      },
    }),
  });

  const results = computed(() => {
    const results = values.results.value as Join[];
    return results.filter((v) =>
      v.value.actor ? v.webId === v.value.actor : true,
    );
  });

  return {
    ...values,
    results: results as Ref<Join[]>,
  };
}
