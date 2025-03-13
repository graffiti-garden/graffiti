import { ref } from "vue";
import type { Ref } from "vue";
import type {
  GraffitiObject,
  Graffiti,
  JSONSchema,
} from "@graffiti-garden/api";
import { isObjectNewer } from "@graffiti-garden/implementation-local/utilities";

export abstract class Reducer<Schema extends JSONSchema> {
  abstract clear(): void;
  abstract onObject(object: GraffitiObject<Schema> | null): void;
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
  readonly result: Ref<
    (GraffitiObject<Schema> & { tombstone: false }) | null | undefined
  > = ref(undefined);

  clear() {
    this.result.value = undefined;
  }

  onObject(object: GraffitiObject<Schema> | null) {
    if (
      !object ||
      !this.result.value ||
      isObjectNewer(object, this.result.value)
    ) {
      if (!object || object.tombstone) {
        this.result.value = null;
      } else {
        this.result.value = {
          ...object,
          tombstone: false,
        };
      }
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
  readonly results: Ref<(GraffitiObject<Schema> & { tombstone: false })[]> =
    ref([]);
  readonly resultsRaw: Map<string, GraffitiObject<Schema>> = new Map();
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
      (GraffitiObject<Schema> & { tombstone: false })[]
    >((acc, object) => {
      const { tombstone } = object;
      if (!tombstone) {
        acc.push({ ...object, tombstone });
      }
      return acc;
    }, []);
  }

  onObject(object: GraffitiObject<Schema> | null) {
    if (!object) return;
    const existing = this.resultsRaw.get(object.url);
    if (existing && !isObjectNewer(object, existing)) return;
    this.resultsRaw.set(object.url, object);

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
