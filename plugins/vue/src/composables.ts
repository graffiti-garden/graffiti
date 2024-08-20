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
  channels: MaybeRefOrGetter<MaybeRefOrGetter<string | undefined>[]>,
  options?: MaybeRefOrGetter<{
    pods?: MaybeRefOrGetter<string[] | undefined>;
    query?: MaybeRefOrGetter<JSONSchema4 | undefined>;
    ifModifiedSince?: MaybeRefOrGetter<Date | undefined>;
    limit?: MaybeRefOrGetter<number | undefined>;
    skip?: MaybeRefOrGetter<number | undefined>;
    fetch?: MaybeRefOrGetter<typeof fetch | undefined>;
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

  const channelsGetter = () =>
    toValue(channels)
      .map((c) => toValue(c))
      .reduce<string[]>((acc, c) => {
        if (c) acc.push(c);
        return acc;
      }, []);
  const optionsGetter = () => {
    const optionsPartial = toValue(options) ?? {};
    const optionsValue: Parameters<GraffitiClient["query"]>[1] = {
      pods: toValue(optionsPartial.pods),
      query: toValue(optionsPartial.query),
      ifModifiedSince: toValue(optionsPartial.ifModifiedSince),
      limit: toValue(optionsPartial.limit),
      skip: toValue(optionsPartial.skip),
      fetch: toValue(optionsPartial.fetch),
    };
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

    const channels = channelsGetter();
    if (!channels.length) return;

    const iterator = useGraffiti().query(channels, options);
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
