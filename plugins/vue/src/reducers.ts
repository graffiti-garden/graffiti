import { ref } from "vue";
import type { JSONSchema4 } from "@graffiti-garden/api";
import type { GraffitiObject, Graffiti } from "@graffiti-garden/api";
import { isObjectNewer } from "@graffiti-garden/implementation-local/utilities";

export abstract class Reducer<Schema extends JSONSchema4> {
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
export class SingletonReducer<Schema extends JSONSchema4>
  implements Reducer<Schema>
{
  readonly result = ref<
    (GraffitiObject<Schema> & { tombstone: false }) | null | undefined
  >(undefined);

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
        this.result.value = object;
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
export class ArrayReducer<Schema extends JSONSchema4>
  implements Reducer<Schema>
{
  REFRESH_RATE = 100; // milliseconds
  readonly results = ref<(GraffitiObject<Schema> & { tombstone: false })[]>([]);
  readonly resultsRaw = new Map<string, GraffitiObject<Schema>>();
  batchFlattenTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(readonly graffiti: Graffiti) {}

  clear() {
    this.resultsRaw.clear();
    this.results.value = [];
    clearTimeout(this.batchFlattenTimer);
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
    const url = this.graffiti.objectToUri(object);
    const existing = this.resultsRaw.get(url);
    if (existing && !isObjectNewer(object, existing)) return;
    this.resultsRaw.set(url, object);

    // Don't flatten the results all at once,
    // because we may get a lot of results
    // and we don't want the interface to
    // freeze up
    if (!this.batchFlattenTimer) {
      this.batchFlattenTimer = setTimeout(() => {
        this.flattenResults();
        this.batchFlattenTimer = undefined;
      }, this.REFRESH_RATE);
    }
  }
}
