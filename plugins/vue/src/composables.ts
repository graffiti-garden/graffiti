import { onScopeDispose, ref, toValue, watch } from "vue";
import type { Ref, MaybeRefOrGetter } from "vue";
import type {
  GraffitiObjectUrl,
  GraffitiObject,
  GraffitiSession,
  JSONSchema,
  GraffitiObjectStreamContinueEntry,
} from "@graffiti-garden/api";
import { useGraffitiSynchronize, useGraffitiSession } from "./globals";
import { GetPoller, Poller, StreamPoller } from "./pollers";
import { ArrayReducer, Reducer, SingletonReducer } from "./reducers";

function makeComposable<Schema extends JSONSchema>(
  reducer: Reducer<Schema>,
  poller: Poller<Schema>,
  synchronizeFactory: () => AsyncGenerator<
    GraffitiObjectStreamContinueEntry<Schema>
  >,
  toWatch: readonly (() => any)[],
  autopoll: MaybeRefOrGetter<boolean>,
) {
  let synchronizeIterator:
    | AsyncGenerator<GraffitiObjectStreamContinueEntry<Schema>>
    | undefined;
  async function pollSynchronize() {
    synchronizeIterator = synchronizeFactory();
    for await (const result of synchronizeIterator) {
      if (result.error) {
        console.error(result.error);
        continue;
      }
      reducer.onEntry(result);
    }
  }

  let isAlreadyPolling = false;
  let innerPoll: (() => Promise<void>) | undefined;
  const poll = async () => {
    if (isAlreadyPolling) return;
    if (!innerPoll) return;
    const myPoll = innerPoll;
    isAlreadyPolling = true;
    try {
      await myPoll();
    } catch (e) {
      // If there is an error, wait a little bit so as not to
      // cause an infinite loop
      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      if (myPoll !== innerPoll) return;
      isAlreadyPolling = false;
      if (toValue(autopoll)) {
        poll();
      }
    }
  };

  const isInitialPolling = ref(false);
  watch(
    toWatch,
    async (newValue, oldValue) => {
      // Catch unnecessary updates
      if (JSON.stringify(newValue) === JSON.stringify(oldValue)) {
        return;
      }

      synchronizeIterator?.return(null);
      reducer.clear();
      poller.clear();

      pollSynchronize();

      innerPoll = () => poller.poll(reducer.onEntry.bind(reducer));
      const myPoll = innerPoll;

      isAlreadyPolling = false;

      isInitialPolling.value = true;
      try {
        await poll();
      } finally {
        if (myPoll !== innerPoll) return;
        isInitialPolling.value = false;
      }
    },
    {
      immediate: true,
    },
  );
  onScopeDispose(() => {
    synchronizeIterator?.return(null);
    reducer.clear();
    poller.clear();
    innerPoll = undefined;
  });

  return { poll, isInitialPolling };
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
 * The [Graffiti.discover](https://api.graffiti.garden/classes/Graffiti.html#discover)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiDiscover}.
 *
 * The arguments of this composable as the same as Graffiti.discover,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 */
export function useGraffitiDiscover<Schema extends JSONSchema>(
  channels: MaybeRefOrGetter<string[]>,
  schema: MaybeRefOrGetter<Schema>,
  /**
   * If the session is `undefined`, the global session,
   * {@link ComponentCustomProperties.$graffitiSession | $graffitiSession},
   * will be used. Otherwise, the provided value will be used.
   */
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
  autopoll: MaybeRefOrGetter<boolean> = false,
): {
  objects: Ref<GraffitiObject<Schema>[]>;
  poll: () => Promise<void>;
  isInitialPolling: Ref<boolean>;
} {
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
  const poller = new StreamPoller<Schema>(streamFactory);

  const { poll, isInitialPolling } = makeComposable<Schema>(
    reducer,
    poller,
    synchronizeFactory,
    argGetters,
    autopoll,
  );

  return {
    /**
     * A [ref](https://vuejs.org/api/reactivity-core.html#ref) that contains
     * an array of Graffiti objects.
     */
    objects: reducer.results,
    /**
     * A method to poll for new results.
     */
    poll,
    /**
     * A boolean [ref](https://vuejs.org/api/reactivity-core.html#ref)
     * that indicates if the *first* poll is currently running.
     * Useful to show a loading spinner or disable a button.
     *
     * This also tracks new polls when the arguments have changed,
     * but it does not track ongoing polls from either calling
     * {@link poll} or using the `autopoll` argument.
     */
    isInitialPolling,
  };
}

/**
 * The [Graffiti.get](https://api.graffiti.garden/classes/Graffiti.html#get)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiGet}.
 *
 * The arguments of this composable as the same as Graffiti.get,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 */
export function useGraffitiGet<Schema extends JSONSchema>(
  locationOrUri: MaybeRefOrGetter<GraffitiObjectUrl | string>,
  schema: MaybeRefOrGetter<Schema>,
  /**
   * If the session is `undefined`, the global session,
   * {@link ComponentCustomProperties.$graffitiSession | $graffitiSession},
   * will be used. Otherwise, the provided value will be used.
   */
  session?: MaybeRefOrGetter<GraffitiSession | undefined | null>,
  autopoll: MaybeRefOrGetter<boolean> = false,
): {
  object: Ref<GraffitiObject<Schema> | null | undefined>;
  poll: () => Promise<void>;
  isInitialPolling: Ref<boolean>;
} {
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
  const getter = () => graffiti.get<Schema>(...callGetters(argGetters));
  const poller = new GetPoller<Schema>(getter);

  const { poll, isInitialPolling } = makeComposable<Schema>(
    reducer,
    poller,
    synchronizeFactory,
    argGetters,
    autopoll,
  );

  return {
    /**
     * A [ref](https://vuejs.org/api/reactivity-core.html#ref) that contains
     * the retrieved Graffiti object, if it exists. If the object has been deleted,
     * the result is `null`. If the object is still being fetched, the result is `undefined`.
     */
    object: reducer.result,
    /**
     * A method to poll for new results.
     */
    poll,
    /**
     * A boolean [ref](https://vuejs.org/api/reactivity-core.html#ref)
     * that indicates if the *first* poll is currently running.
     * Useful to show a loading spinner or disable a button.
     *
     * This also tracks new polls when the arguments have changed,
     * but it does not track ongoing polls from either calling
     * {@link poll} or using the `autopoll` argument.
     */
    isInitialPolling,
  };
}

/**
 * The [Graffiti.recoverOrphans](https://api.graffiti.garden/classes/Graffiti.html#recoverorphans)
 * method as a reactive [composable](https://vuejs.org/guide/reusability/composables.html)
 * for use in the Vue [composition API](https://vuejs.org/guide/introduction.html#composition-api).
 *
 * Its corresponding renderless component is {@link GraffitiRecoverOrphans}.
 *
 * The arguments of this composable as the same as Graffiti.get,
 * only they can also be [Refs](https://vuejs.org/api/reactivity-core.html#ref)
 * or [getters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#description).
 * As they change the output will automatically update.
 * Reactivity only triggers when the root array or object changes,
 * not when the elements or properties change.
 * If you need deep reactivity, wrap your argument in a getter.
 */
export function useGraffitiRecoverOrphans<Schema extends JSONSchema>(
  schema: MaybeRefOrGetter<Schema>,
  session: MaybeRefOrGetter<GraffitiSession>,
  autopoll: MaybeRefOrGetter<boolean> = false,
): {
  objects: Ref<GraffitiObject<Schema>[]>;
  poll: () => Promise<void>;
  isInitialPolling: Ref<boolean>;
} {
  const graffiti = useGraffitiSynchronize();

  const schemaGetter = () => toValue(schema);
  const sessionGetter = () => toValue(session);
  const argGetters = [schemaGetter, sessionGetter] as const;

  const synchronizeFactory = () =>
    graffiti.synchronizeRecoverOrphans(...callGetters(argGetters));

  const reducer = new ArrayReducer<Schema>(graffiti);
  const streamFactory = () =>
    graffiti.recoverOrphans<Schema>(...callGetters(argGetters));
  const poller = new StreamPoller<Schema>(streamFactory);

  const { poll, isInitialPolling } = makeComposable<Schema>(
    reducer,
    poller,
    synchronizeFactory,
    argGetters,
    autopoll,
  );

  return {
    /**
     * A [ref](https://vuejs.org/api/reactivity-core.html#ref) that contains
     * an array of Graffiti objects.
     */
    objects: reducer.results,
    /**
     * A method to poll for new results.
     */
    poll,
    /**
     * A boolean [ref](https://vuejs.org/api/reactivity-core.html#ref)
     * that indicates if the *first* poll is currently running.
     * Useful to show a loading spinner or disable a button.
     *
     * This also tracks new polls when the arguments have changed,
     * but it does not track ongoing polls from either calling
     * {@link poll} or using the `autopoll` argument.
     */
    isInitialPolling,
  };
}
