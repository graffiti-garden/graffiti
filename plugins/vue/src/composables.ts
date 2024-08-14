import {
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
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
  const results = ref<GraffitiObject[]>([]);
  let lastModified: Date | undefined = undefined;
  const resultsRaw = new Map<string, GraffitiObject>();
  function flattenResults() {
    results.value = Array.from(resultsRaw.values());
  }

  function onValue(value: GraffitiObject) {
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

  const channelsGetter = () => toValue(channels).map((c) => toValue(c));
  const optionsGetter = () => {
    const optionsPartial = toValue(options) ?? {};
    const optionsValue: Parameters<GraffitiClient["query"]>[1] = {};
    Object.keys(optionsPartial).forEach(
      (k) => (optionsValue[k] = toValue(optionsPartial[k])),
    );
    return optionsValue;
  };

  let localIterator: AsyncGenerator<GraffitiObject, void, void> | undefined =
    undefined;
  async function pollLocalModifications() {
    localIterator?.return();
    localIterator = useGraffiti().queryLocalChanges(
      channelsGetter(),
      optionsGetter(),
    );
    for await (const value of localIterator) {
      onValue(value);
      flattenResults();
    }
  }

  const isPolling = ref(false);
  async function poll() {
    isPolling.value = true;

    const options = optionsGetter();
    if (lastModified) {
      options.ifModifiedSince = lastModified;
    }

    const iterator = useGraffiti().query(channelsGetter(), options);
    for await (const result of iterator) {
      if (result.error == true) {
        console.error(result.message);
        continue;
      }
      onValue(result.value);
    }

    flattenResults();
    isPolling.value = false;
  }

  watch(
    [channelsGetter, optionsGetter],
    () => {
      resultsRaw.clear();
      lastModified = undefined;
      poll();
      pollLocalModifications();
    },
    {
      immediate: true,
    },
  );
  onScopeDispose(() => localIterator?.return());

  return {
    results,
    poll,
    isPolling,
  };
}
