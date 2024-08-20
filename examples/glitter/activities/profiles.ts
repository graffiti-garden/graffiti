import { computed, toValue, MaybeRefOrGetter, type Ref } from "vue";
import {
  useGraffiti,
  useGraffitiSession,
  useQuery,
  type GraffitiObject,
} from "@graffiti-garden/client-vue";

export interface Profile extends GraffitiObject {
  value: {
    type: "Profile";
    name: string;
    describes?: string;
  };
}

export async function putProfile(name: string) {
  return useGraffiti().put({
    value: {
      type: "Profile",
      name,
      describes: useGraffitiSession().webId,
    },
    channels: [useGraffitiSession().webId!],
  });
}

export function useProfiles(webId: MaybeRefOrGetter<string | undefined>) {
  const values = useQuery(() => [toValue(webId)], {
    query: () => ({
      properties: {
        value: {
          properties: {
            type: { enum: ["Profile"] },
            name: { type: "string" },
            describes: { enum: [toValue(webId)] },
          },
          required: ["type", "name"],
        },
      },
    }),
  });

  const results = computed(() => {
    const results = values.results.value as Profile[];
    return results.filter((v) =>
      v.value.describes ? v.webId === v.value.describes : true,
    );
  });

  return {
    ...values,
    results,
  };
}
