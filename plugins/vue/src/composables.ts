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
import { useGraffiti, useGraffitiSession } from "./session";

export function useDiscover(
  channels: MaybeRefOrGetter<MaybeRefOrGetter<string | undefined>[]>,
  options?: MaybeRefOrGetter<{
    pods?: MaybeRefOrGetter<string[] | undefined>;
    schema?: MaybeRefOrGetter<JSONSchema4 | undefined>;
    ifModifiedSince?: MaybeRefOrGetter<Date | undefined>;
    fetch?: MaybeRefOrGetter<typeof fetch | undefined>;
  }>,
) {
  const results = ref<GraffitiObject[]>([]);
  const resultsRaw = new Map<string, GraffitiObject>();
  function flattenResults() {
    results.value = Array.from(resultsRaw.values()).filter(
      (o) => !o.tombstone && o.value,
    );
  }

  function onValue(value: GraffitiObject) {
    const url = useGraffiti().objectToUrl(value);
    const existing = resultsRaw.get(url);
    if (existing && existing.lastModified >= value.lastModified) return;
    resultsRaw.set(url, value);
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
    const optionsValue: Parameters<GraffitiClient["discover"]>[1] = {
      pods: toValue(optionsPartial.pods),
      schema: toValue(optionsPartial.schema),
      ifModifiedSince: toValue(optionsPartial.ifModifiedSince),
      fetch: toValue(optionsPartial.fetch),
    };
    return optionsValue;
  };

  let localIterator: AsyncGenerator<GraffitiObject, void, void> | undefined =
    undefined;
  async function pollLocalModifications() {
    localIterator?.return();
    localIterator = useGraffiti().discoverLocalChanges(
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
    const channels = channelsGetter();
    if (!channels.length) return;

    let iterator: ReturnType<GraffitiClient["discover"]>;
    try {
      iterator = useGraffiti().discover(channels, options);
    } catch (e) {
      console.error(e);
      flattenResults();
      isPolling.value = false;
      return;
    }

    for await (const result of iterator) {
      if (result.error) {
        console.error(result.message);
        continue;
      }
      onValue(result.value);
    }

    flattenResults();
    isPolling.value = false;
  }

  const session = useGraffitiSession();
  watch(
    [
      channelsGetter,
      optionsGetter,
      () => session.webId,
      () => session.defaultPod,
    ],
    () => {
      resultsRaw.clear();
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
