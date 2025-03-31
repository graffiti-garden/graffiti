import type { GraffitiObject } from "@graffiti-garden/api";
import { computed, toValue, type MaybeRefOrGetter } from "vue";

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
>(objects: MaybeRefOrGetter<T[]>) {
  return computed(() =>
    toValue(objects).sort((a, b) => b.value.published - a.value.published),
  );
}

export function groupAdjacentBy<T>(
  objects: MaybeRefOrGetter<T[]>,
  isGroupMember: (group: T[], item: T) => boolean,
) {
  return computed(() => {
    const grouped: T[][] = [];

    for (const item of toValue(objects)) {
      const lastGroup = grouped.at(-1);
      if (lastGroup && isGroupMember(lastGroup, item)) {
        lastGroup.push(item);
      } else {
        grouped.push([item]);
      }
    }

    return grouped;
  });
}
