import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { type JSONSchema4 } from "json-schema";
import type GraffitiClient from "@graffiti-garden/client-core";
import { type GraffitiObject } from "@graffiti-garden/client-core";
import { useGraffiti } from "./session";

export function useQuery(
  channels: MaybeRefOrGetter<MaybeRefOrGetter<string>[]>,
  options?: MaybeRefOrGetter<{
    pods?: MaybeRefOrGetter<string[]>;
    query?: MaybeRefOrGetter<JSONSchema4>;
    ifModifiedSince?: MaybeRefOrGetter<Date>;
    limit?: MaybeRefOrGetter<number>;
    skip?: MaybeRefOrGetter<number>;
    fetch?: MaybeRefOrGetter<typeof fetch>;
  }>,
) {
  const isPolling = ref(false);
  const results = ref<GraffitiObject[]>([]);
  let lastModified: Date | undefined = undefined;
  const resultsRaw = new Map<string, GraffitiObject>();

  watch([() => toValue(channels), () => toValue(options)], () => poll(true), {
    immediate: true,
    deep: true,
  });

  async function poll(clear = false) {
    isPolling.value = true;
    const channelsPartial = toValue(channels);
    const channelsValue = channelsPartial.map((c) => toValue(c));
    const optionsPartial = toValue(options) ?? {};
    const optionsValue: Parameters<GraffitiClient["query"]>[1] = {};
    Object.keys(optionsPartial).forEach(
      (k) => (optionsValue[k] = toValue(optionsPartial[k])),
    );

    if (clear) {
      resultsRaw.clear();
      lastModified = undefined;
    } else {
      if (lastModified) {
        optionsValue.ifModifiedSince = lastModified;
      }
    }

    const iterator = useGraffiti().query(channelsValue, optionsValue);

    for await (const result of iterator) {
      if (result.error == true) {
        console.error(result.message);
        continue;
      }

      const value = result.value;
      lastModified =
        !lastModified || value.lastModified > lastModified
          ? value.lastModified
          : lastModified;

      const url = useGraffiti().locationToUrl(value);
      if (value.tombstone) {
        resultsRaw.delete(url);
      } else {
        const existing = resultsRaw.get(url);
        if (!existing || existing.lastModified < value.lastModified) {
          resultsRaw.set(url, value);
        }
      }
    }

    results.value = Array.from(resultsRaw.values());
    isPolling.value = false;
  }

  return {
    results,
    poll,
    isPolling,
  };
}
