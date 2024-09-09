import {
  onScopeDispose,
  ref,
  toValue,
  unref,
  watch,
  type MaybeRefOrGetter,
  type MaybeRef,
} from "vue";
import { type JSONSchema4 } from "json-schema";
import type { GraffitiObjectTyped } from "@graffiti-garden/client-core";
import useGraffiti from "./use-graffiti";

export function useDiscover<Schema extends JSONSchema4>(
  channels: MaybeRefOrGetter<string[]>,
  schema: MaybeRefOrGetter<Schema>,
  session: MaybeRefOrGetter<
    {
      pods: string[];
    } & (
      | {
          fetch: typeof fetch;
          webId: string;
        }
      | {
          fetch?: undefined;
          webId?: undefined;
        }
    )
  >,
  options?: MaybeRefOrGetter<
    | {
        ifModifiedSince?: Date;
      }
    | undefined
  >,
) {
  const graffiti = useGraffiti();

  const results = ref<(GraffitiObjectTyped<Schema> & { tombstone: false })[]>(
    [],
  );
  const resultsRaw = new Map<string, GraffitiObjectTyped<Schema>>();
  function flattenResults() {
    results.value = Array.from(resultsRaw.values()).reduce<
      (GraffitiObjectTyped<Schema> & { tombstone: false })[]
    >((acc, o) => {
      const { tombstone, value } = o;
      if (!tombstone) {
        acc.push({ ...o, tombstone, value });
      }
      return acc;
    }, []);
  }

  function onValue(value: GraffitiObjectTyped<Schema>) {
    const url = graffiti.objectToUrl(value);
    const existing = resultsRaw.get(url);
    if (existing && existing.lastModified >= value.lastModified) return;
    resultsRaw.set(url, value);
  }

  const channelsGetter = () => toValue(channels);
  const schemaGetter = () => toValue(schema);
  const sessionGetter = () => toValue(session);
  const optionsGetter = () => toValue(options);

  let localIterator:
    | ReturnType<typeof graffiti.discoverLocalChanges<Schema>>
    | undefined = undefined;
  async function pollLocalModifications() {
    localIterator?.return();
    localIterator = graffiti.discoverLocalChanges(
      channelsGetter(),
      schemaGetter(),
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

    let iterator: ReturnType<typeof graffiti.discover<Schema>> | undefined =
      undefined;
    try {
      iterator = useGraffiti().discover(
        channelsGetter(),
        schemaGetter(),
        sessionGetter(),
        optionsGetter(),
      );
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

  watch(
    [channelsGetter, schemaGetter, sessionGetter, optionsGetter],
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
