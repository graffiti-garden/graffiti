import {
  inject,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
import type {
  GraffitiObject,
  GraffitiSession,
  JSONSchema4,
} from "@graffiti-garden/api";
import { useGraffiti, useGraffitiSession } from "./injections";

/**
 * A reactive version of the [`Graffiti.discover`](https://api.graffiti.garden/classes/Graffiti.html#discover)
 * method.
 *
 * @returns An object containing
 * - `results`: a reactive array of Graffiti objects
 * - `poll`: a method to poll for new results
 * - `isPolling`: a boolean ref indicating if the poll is currently running
 */
export function useGraffitiDiscover<Schema extends JSONSchema4>(
  /**
   * A list of channels to discover objects from.
   * It may be a Vue ref or getter.
   */
  channels: MaybeRefOrGetter<string[]>,
  /**
   * A [JSON Schema](https://json-schema.org/) object describing the schema
   * of the objects to discover. All other objects will be filtered out
   * and the output will be typed as `GraffitiObject<Schema>`.
   */
  schema: MaybeRefOrGetter<Schema>,
  /**
   * A Graffiti session object. If not provided, the
   * global plugin session will be used.
   */
  session?: MaybeRefOrGetter<GraffitiSession>,
) {
  const graffiti = useGraffiti();
  const sessionInjected = useGraffitiSession();

  const results = ref<(GraffitiObject<Schema> & { tombstone: false })[]>([]);
  const resultsRaw = new Map<string, GraffitiObject<Schema>>();
  function flattenResults() {
    results.value = Array.from(resultsRaw.values()).reduce<
      (GraffitiObject<Schema> & { tombstone: false })[]
    >((acc, o) => {
      const { tombstone, value } = o;
      if (!tombstone) {
        acc.push({ ...o, tombstone, value });
      }
      return acc;
    }, []);
  }

  function onValue(value: GraffitiObject<Schema>) {
    const url = graffiti.objectToUri(value);
    const existing = resultsRaw.get(url);
    if (
      existing &&
      (existing.lastModified > value.lastModified ||
        (existing.lastModified.getTime() === value.lastModified.getTime() &&
          !existing.tombstone))
    ) {
      return;
    }
    resultsRaw.set(url, value);
  }

  const channelsGetter = () => toValue(channels);
  const schemaGetter = () => toValue(schema);
  const sessionGetter = () => toValue(session) ?? sessionInjected?.value;

  let localIterator:
    | ReturnType<typeof graffiti.synchronize<Schema>>
    | undefined = undefined;
  async function pollLocalModifications() {
    localIterator?.return();
    localIterator = graffiti.synchronize(
      channelsGetter(),
      schemaGetter(),
      sessionGetter(),
    );
    for await (const value of localIterator) {
      if (value.error) {
        console.error(value.error);
        continue;
      }
      onValue(value.value);
      flattenResults();
    }
  }

  const isPolling = ref(false);
  let iterator: ReturnType<typeof graffiti.discover<Schema>> | undefined =
    undefined;
  async function poll() {
    iterator?.return();
    isPolling.value = true;

    try {
      iterator = graffiti.discover(
        channelsGetter(),
        schemaGetter(),
        sessionGetter(),
      );
    } catch (e) {
      console.error(e);
      flattenResults();
      isPolling.value = false;
      return;
    }

    for await (const result of iterator) {
      if (result.error) {
        console.error(result.error);
        continue;
      }
      onValue(result.value);
      flattenResults();
    }

    isPolling.value = false;
  }

  watch(
    [channelsGetter, schemaGetter, sessionGetter],
    () => {
      resultsRaw.clear();
      flattenResults();
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
