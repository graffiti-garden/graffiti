import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, ref, shallowRef, type EffectScope } from "vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiSynchronize } from "@graffiti-garden/wrapper-synchronize";
import * as globals from "../src/globals";
import { useGraffitiDiscover } from "../src/composables/discover";
import { useGraffitiGet } from "../src/composables/get";
import { useGraffitiGetMedia } from "../src/composables/get-media";

let scope: EffectScope;
let local: GraffitiLocal;

beforeEach(() => {
  scope = effectScope();
  local = new GraffitiLocal();
  vi.spyOn(globals, "useGraffitiSynchronize").mockReturnValue(new GraffitiSynchronize(local));
});
afterEach(() => {
  scope.stop();
  vi.restoreAllMocks();
});

it.each(["options", "legacy"])("reacts to session changes in all read composables (%s)", async (shape) => {
  const session = shallowRef<GraffitiSession | null>({ actor: "did:example:vue-reader" });
  const channels = [crypto.randomUUID()];
  const object = await local.post({ value: {}, channels, allowed: [] }, session.value!);
  const mediaUrl = await local.postMedia({ data: new Blob(["private"]), allowed: [] }, session.value!);
  const argument = shape === "options" ? { session } : session;
  const results = scope.run(() => ({
    get: useGraffitiGet(object.url, {}, argument),
    media: useGraffitiGetMedia(mediaUrl, {}, argument),
    discover: useGraffitiDiscover(channels, {}, shape === "options"
      ? { session: () => session.value }
      : () => session.value),
  }))!;
  try {
    await Promise.all([results.get.poll(), results.discover.poll()]);
    await vi.waitFor(() => expect(results.media.media.value?.actor).toBe(object.actor));
    expect(results.get.object.value?.url).toBe(object.url);
    expect(results.discover.objects.value.map(o => o.url)).toEqual([object.url]);

    session.value = null;
    await vi.waitFor(() => {
      expect(results.get.object.value).toBeNull();
      expect(results.media.media.value).toBeNull();
      expect(results.discover.isFirstPoll.value).toBe(false);
      expect(results.discover.objects.value).toEqual([]);
    });
  } finally {
    await local.delete(object.url, { actor: object.actor });
    await local.deleteMedia(mediaUrl, { actor: object.actor });
  }
});

it.each(["options", "legacy"])("reacts to autopoll without restarting discovery (%s)", async (shape) => {
  const autopoll = ref(false);
  const discover = vi.spyOn(local, "discover");
  const continuation = vi.spyOn(local, "continueDiscover").mockImplementation(async function* () {
    autopoll.value = false;
    return { cursor: "next" };
  });
  const result = scope.run(() => shape === "options"
    ? useGraffitiDiscover([], {}, { autopoll })
    : useGraffitiDiscover([], {}, undefined, autopoll))!;
  await result.poll();
  expect(continuation).not.toHaveBeenCalled();
  autopoll.value = true;
  await vi.waitFor(() => expect(continuation).toHaveBeenCalledOnce());
  expect(discover).toHaveBeenCalledOnce();
  expect(continuation).toHaveBeenCalledWith(expect.any(String), { session: undefined });
});
