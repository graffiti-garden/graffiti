import type { GraffitiSession } from "@graffiti-garden/api";
import type { MaybeRefOrGetter } from "vue";

/** Reactive options for reading objects and media. */
export interface GraffitiVueReadOptions {
  session?: MaybeRefOrGetter<GraffitiSession | null | undefined>;
  /** Refresh the initial read; explicit polls always refresh. */
  refresh?: MaybeRefOrGetter<boolean | undefined>;
}

/** Reactive options for discovering objects. */
export interface GraffitiVueDiscoverOptions extends GraffitiVueReadOptions {
  /** Automatically continue polling after each successful poll. Defaults to false. */
  autopoll?: MaybeRefOrGetter<boolean | undefined>;
}
