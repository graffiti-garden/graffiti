import {
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
 * method. Its arguments are the same, but now they can be
 * reactive Vue refs or getters. As they change the output will
 * automatically update.
 *
 * Rather than returning a stream of Graffiti objects, this
 * function returns a reactive array of objects. It also
 * provides a method to poll for new results and a boolean
 * ref indicating if the poll is currently running.
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
  session?: MaybeRefOrGetter<GraffitiSession | undefined>,
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
        (existing.lastModified === value.lastModified && !existing.tombstone))
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
      // TODO: don't flatten every time
      flattenResults();
    }
  }

  const isPolling = ref(false);
  let lastModified: number | undefined = undefined;
  let fullRepollBy: number | undefined = undefined;
  let iterator: ReturnType<typeof graffiti.discover<Schema>> | undefined =
    undefined;
  async function poll() {
    const startOfPoll = new Date().getTime();

    // Add a query for lastModified if it's not in the schema
    const schema = { ...schemaGetter() };
    if (
      lastModified &&
      fullRepollBy &&
      fullRepollBy > startOfPoll &&
      (!schema.properties ||
        !("lastModified" in schema.properties) ||
        !("minimum" in schema.properties.lastModified))
    ) {
      console.log(typeof lastModified);
      schema.properties = {
        ...schema.properties,
        lastModified: {
          ...schema.properties?.lastModified,
          minimum: lastModified,
        },
      };
    }

    let myIterator: ReturnType<typeof graffiti.discover<Schema>>;
    try {
      myIterator = graffiti.discover(channelsGetter(), schema, sessionGetter());
    } catch (e) {
      console.error(e);
      return;
    }

    // Kill the previous iterator if its
    // still running and claim its spot
    iterator?.return({ tombstoneRetention: 0 });
    iterator = myIterator;
    isPolling.value = true;

    // Keep track of the latest lastModified value
    // while streaming results
    let myLastModified = lastModified;
    let result = await myIterator.next();
    while (!result.done) {
      if (result.value.error) {
        console.error(result.value.error);
        result = await myIterator.next();
        continue;
      }

      const value = result.value.value;
      if (!myLastModified || value.lastModified > myLastModified) {
        myLastModified = value.lastModified;
      }

      onValue(value);
      // TODO: don't flatten every time
      flattenResults();
      result = await myIterator.next();
    }

    // Make sure we're still the current iterator
    if (iterator !== myIterator) return;

    // We've successfully polled all results
    // without getting overridden
    iterator = undefined;
    isPolling.value = false;

    // Only now do we update the cache parameters
    // because the results may have appeared out
    // of order
    const { tombstoneRetention } = result.value;
    lastModified = myLastModified;
    fullRepollBy = startOfPoll + tombstoneRetention;
  }

  watch(
    [channelsGetter, schemaGetter, sessionGetter],
    () => {
      resultsRaw.clear();
      lastModified = undefined;
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
