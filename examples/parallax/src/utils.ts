import type { GraffitiObject } from "@graffiti-garden/api";
import { computed, type Ref } from "vue";

export function sortByPublished<
  T extends GraffitiObject<{
    properties: {
      value: {
        required: ["published"];
        properties: {
          published: { type: "number" };
        };
      };
    };
  }>,
>(something: Ref<T[]>) {
  return computed(() =>
    something.value.sort((a, b) => b.value.published - a.value.published),
  );
}
