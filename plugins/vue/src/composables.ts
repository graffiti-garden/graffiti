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
import type { GraffitiStream } from "@graffiti-garden/api";
import { Poller, StreamPoller } from "./pollers";
import { ArrayReducer, Reducer } from "./reducers";

function makeComposable<Schema extends JSONSchema4>(
  reducer: Reducer<Schema>,
  poller: Poller<Schema>,
  synchronizeFactory: () => GraffitiStream<GraffitiObject<Schema>>,
  toWatch: readonly (() => any)[],
) {
  let synchronizeIterator: GraffitiStream<GraffitiObject<Schema>> | undefined =
    undefined;
  async function pollSynchronize() {
    synchronizeIterator = synchronizeFactory();
    for await (const result of synchronizeIterator) {
      if (result.error) {
        console.error(result.error);
        continue;
      }
      reducer.onObject(result.value);
    }
  }

  const poll = () => poller.poll(reducer.onObject.bind(reducer));

  const isPolling = ref(false);
  watch(
    toWatch,
    async () => {
      synchronizeIterator?.return();
      reducer.clear();
      poller.clear();

      pollSynchronize();

      isPolling.value = true;
      try {
        await poll();
      } finally {
        isPolling.value = false;
      }
    },
    {
      immediate: true,
    },
  );
  onScopeDispose(() => synchronizeIterator?.return());

  return { poll, isPolling };
}

function toSessionGetter(
  sessionInjected: ReturnType<typeof useGraffitiSession>,
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
) {
  return () => {
    const sessionValue = toValue(session);
    if (sessionValue === undefined) {
      return sessionInjected?.value;
    } else {
      return sessionValue;
    }
  };
}

function callGetters<T extends readonly (() => any)[]>(
  getters: T,
): {
  [K in keyof T]: ReturnType<T[K]>;
} {
  return getters.map((fn) => fn()) as any;
}

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
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
) {
  const graffiti = useGraffiti();
  const sessionInjected = useGraffitiSession();

  const channelsGetter = () => toValue(channels);
  const schemaGetter = () => toValue(schema);
  const sessionGetter = toSessionGetter(sessionInjected, session);
  const argGetters = [channelsGetter, schemaGetter, sessionGetter] as const;

  const synchronizeFactory = () =>
    graffiti.synchronizeDiscover(...callGetters(argGetters));
  const streamFactory = () => graffiti.discover(...callGetters(argGetters));

  const reducer = new ArrayReducer<Schema>(graffiti);
  const poller = new StreamPoller(schemaGetter, streamFactory);

  const { poll, isPolling } = makeComposable(
    reducer,
    poller,
    synchronizeFactory,
    argGetters,
  );

  return {
    results: reducer.results,
    poll,
    isPolling,
  };
}
