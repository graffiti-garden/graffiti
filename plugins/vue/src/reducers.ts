import { computed, ref } from "vue";
import type { Ref } from "vue";
import type {
  GraffitiObject,
  Graffiti,
  JSONSchema,
  GraffitiObjectStreamContinueEntry,
} from "@graffiti-garden/api";

export abstract class Reducer<Schema extends JSONSchema> {
  abstract clear(): void;
  abstract onEntry(
    entry: GraffitiObjectStreamContinueEntry<Schema> | null,
  ): void;
}

function isEntryNewer<Schema extends JSONSchema>(
  entry: GraffitiObjectStreamContinueEntry<Schema>,
  existing: GraffitiObjectStreamContinueEntry<Schema> | null | undefined,
): boolean {
  return (
    !existing ||
    entry.object.lastModified > existing.object.lastModified ||
    (entry.object.lastModified === existing.object.lastModified &&
      !entry.tombstone &&
      !!existing.tombstone)
  );
}

/**
 * Retrieves multiple Graffiti objects and retains
 * the most recent one as the `result` property (a Vue ref).
 * Before any objects have been received, the result
 * is `undefined`. If the object has been deleted,
 * the result is `null`.
 */
export class SingletonReducer<Schema extends JSONSchema>
  implements Reducer<Schema>
{
  readonly entry: Ref<
    GraffitiObjectStreamContinueEntry<Schema> | null | undefined
  > = ref();

  get result(): Ref<GraffitiObject<Schema> | null | undefined> {
    return computed(() => {
      const value = this.entry.value;
      if (!value) return value;
      if (value.tombstone) return null;
      return value.object;
    });
  }

  clear() {
    this.entry.value = undefined;
  }

  onEntry(entry: GraffitiObjectStreamContinueEntry<Schema> | null) {
    if (!entry || isEntryNewer<Schema>(entry, this.entry.value)) {
      this.entry.value = entry;
    }
  }
}

/**
 * Retrieves multiple Graffiti objects and retains
 * the most recent one per URI as the `results` property (a Vue ref).
 * If multiple objects are received concurrently,
 * they are processed in batches every `REFRESH_RATE` milliseconds
 * to avoid freezing the interface.
 */
export class ArrayReducer<Schema extends JSONSchema>
  implements Reducer<Schema>
{
  readonly results: Ref<GraffitiObject<Schema>[]> = ref([]);
  readonly resultsRaw: Map<string, GraffitiObjectStreamContinueEntry<Schema>> =
    new Map();
  batchFlattenTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly graffiti: Graffiti) {}

  clear() {
    this.resultsRaw.clear();
    this.results.value = [];
    clearTimeout(this.batchFlattenTimer);
    this.batchFlattenTimer = undefined;
  }

  flattenResults() {
    this.results.value = Array.from(this.resultsRaw.values()).reduce<
      GraffitiObject<Schema>[]
    >((acc, entry) => {
      if (!entry.tombstone) {
        acc.push(entry.object);
      }
      return acc;
    }, []);
  }

  onEntry(entry: GraffitiObjectStreamContinueEntry<Schema> | null) {
    if (!entry) return;
    const existing = this.resultsRaw.get(entry.object.url);
    if (!isEntryNewer<Schema>(entry, existing)) return;
    this.resultsRaw.set(entry.object.url, entry);

    // Don't flatten the results all at once,
    // because we may get a lot of results
    // and we don't want the interface to
    // freeze up
    if (!this.batchFlattenTimer) {
      this.batchFlattenTimer = setTimeout(() => {
        this.flattenResults();
        this.batchFlattenTimer = undefined;
      }, 0);
    }
  }
}
