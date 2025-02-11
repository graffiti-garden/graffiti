import {
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
import type {
  GraffitiLocation,
  GraffitiObject,
  GraffitiSession,
  JSONSchema4,
} from "@graffiti-garden/api";
import { useGraffitiSynchronize, useGraffitiSession } from "./globals";
import type { GraffitiStream } from "@graffiti-garden/api";
import { GetPoller, Poller, StreamPoller } from "./pollers";
import { ArrayReducer, Reducer, SingletonReducer } from "./reducers";

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
    async (newValue, oldValue) => {
      // Catch unnecessary updates
      if (JSON.stringify(newValue) === JSON.stringify(oldValue)) {
        return;
      }

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
 * All [`tombstone`](https://api.graffiti.garden/interfaces/GraffitiObjectBase.html#tombstone)d
 * objects are filtered out.
 */
export function useGraffitiDiscover<Schema extends JSONSchema4>(
  /**
   * A list of channels to discover objects from.
   * Reactivity will only trigger
   * when the root array changes, not when the elements
   * change. If you need reactivity on the elements,
   * create a getter, e.g. `() => [toValue(myReactiveChannel)]`.
   */
  channels: MaybeRefOrGetter<string[]>,
  /**
   * A [JSON Schema](https://json-schema.org/) object describing the schema
   * of the objects to discover. All other objects will be filtered out
   * and the output will be typed as `GraffitiObject<Schema>`.
   * Reactivity only triggers when the root object changes, not when
   * the root object changes, not when the properties change.
   * Create a getter if you need reactivity on the properties.
   */
  schema: MaybeRefOrGetter<Schema>,
  /**
   * A Graffiti session object. If `undefined`, the
   * global plugin session will be used. If `null`,
   * no session will be used.
   */
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
) {
  const graffiti = useGraffitiSynchronize();
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
    /**
     * A reactive array of Graffiti objects, without any
     * tombstones.
     */
    results: reducer.results,
    /**
     * A method to poll for new results. Only new results
     * are polled, not the entire set of results.
     */
    poll,
    /**
     * A [Ref] that indicates if the poll is currently running.
     * Useful to show a loading spinner or disable a button.
     */
    isPolling,
  };
}

/**
 * A reactive version of the [`Graffiti.get`](https://api.graffiti.garden/classes/Graffiti.html#get)
 * method. Its arguments are the same, but now they can be
 * reactive Vue refs or getters. As they change the output will
 * automatically update.
 *
 * Rather than returning a single Graffiti object, this
 * function returns a reactive object. It also
 * provides a method to poll for new results and a boolean
 * ref indicating if the poll is currently running.
 *
 * While the object is first being fetched, the result
 * is `undefined`. If the object has been deleted,
 * the result is `null`. Otherwise, the result is the
 * most recent object fetched. All [`tombstone`](https://api.graffiti.garden/interfaces/GraffitiObjectBase.html#tombstone)d
 * objects are filtered out.
 *
 * @returns An object containing
 * - `results`: a reactive array of Graffiti objects
 * - `poll`: a method to poll for new results
 * - `isPolling`: a boolean ref indicating if the poll is currently running
 */
export function useGraffitiGet<Schema extends JSONSchema4>(
  /**
   * A Graffiti location or URI to fetch the object from.
   */
  locationOrUri: MaybeRefOrGetter<GraffitiLocation | string>,
  /**
   * A [JSON Schema](https://json-schema.org/) object describing the schema
   * of the objects to discover. All other objects will be filtered out
   * and the output will be typed as `GraffitiObject<Schema>`.
   * Like the `channels` argument, reactivity only triggers when
   */
  schema: MaybeRefOrGetter<Schema>,
  /**
   * A Graffiti session object. If not provided, the
   * global plugin session will be used.
   */
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
) {
  const graffiti = useGraffitiSynchronize();
  const sessionInjected = useGraffitiSession();

  const locationOrUriGetter = () => toValue(locationOrUri);
  const schemaGetter = () => toValue(schema);
  const sessionGetter = toSessionGetter(sessionInjected, session);
  const argGetters = [
    locationOrUriGetter,
    schemaGetter,
    sessionGetter,
  ] as const;

  const synchronizeFactory = () =>
    graffiti.synchronizeGet(...callGetters(argGetters));

  const reducer = new SingletonReducer<Schema>();
  const poller = new GetPoller(() => graffiti.get(...callGetters(argGetters)));

  const { poll, isPolling } = makeComposable(
    reducer,
    poller,
    synchronizeFactory,
    argGetters,
  );

  return {
    result: reducer.result,
    poll,
    isPolling,
  };
}

export function useGraffitiRecoverOrphans<Schema extends JSONSchema4>(
  schema: MaybeRefOrGetter<Schema>,
  session: MaybeRefOrGetter<GraffitiSession>,
) {
  const graffiti = useGraffitiSynchronize();

  const schemaGetter = () => toValue(schema);
  const sessionGetter = () => toValue(session);
  const argGetters = [schemaGetter, sessionGetter] as const;

  const synchronizeFactory = () =>
    graffiti.synchronizeRecoverOrphans(...callGetters(argGetters));

  const reducer = new ArrayReducer<Schema>(graffiti);
  const poller = new StreamPoller(schemaGetter, () =>
    graffiti.recoverOrphans(...callGetters(argGetters)),
  );

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
