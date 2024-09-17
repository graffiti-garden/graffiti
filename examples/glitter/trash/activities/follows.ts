import { type MaybeRefOrGetter, toValue, type Ref } from "vue";
import {
  useGraffiti,
  useDiscover,
  // useGraffitiSession,
  // useQuery,
  type GraffitiObject,
} from "@graffiti-garden/client-vue";

export interface Follow extends GraffitiObject {
  value: {
    type: "Follow";
    object: string;
    actor?: string;
  };
}

export async function putFollow(object?: string) {
  const myWebId = useGraffitiSession().webId;
  return useGraffiti().put({
    value: {
      type: "Follow",
      object,
      actor: myWebId,
    },
    channels: [myWebId!],
  });
}

export function useFollows(
  actor: MaybeRefOrGetter<string | undefined>,
  object?: MaybeRefOrGetter<string | undefined>,
) {
  const values = useDiscover(
    () => [],
    () =>
      ({
        properties: {
          value: {
            properties: {
              type: { type: "string", enum: ["Follow"] },
              object: toValue(object)
                ? { enum: [toValue(object)] }
                : { type: "string" },
              actor: { type: "string", enum: [toValue(actor)] },
            },
            required: ["type", "object"],
          },
          webId: { enum: [toValue(actor)] },
        },
      }) as const,
    { pods: [] },
    // }),
  );

  const results = values.results;
  return {
    ...values,
    results: results as Ref<Follow[]>,
  };
}
