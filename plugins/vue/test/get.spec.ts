import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, ref, type EffectScope } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiSynchronize } from "@graffiti-garden/wrapper-synchronize";
import * as globals from "../src/globals";
import { useGraffitiGetMedia } from "../src/composables/get-media";
import { useGraffitiGet } from "../src/composables/get";

let scope: EffectScope;
beforeEach(() => { scope = effectScope(); });
afterEach(() => { scope.stop(); vi.restoreAllMocks(); });

it("leaves repeated media reads to core and explicitly refreshes on poll", async () => {
  const graffiti = new GraffitiSynchronize(new GraffitiLocal());
  const getMedia = vi.spyOn(graffiti, "getMedia").mockResolvedValue({
    data: new Blob(["image"], { type: "image/png" }), actor: "did:example:owner",
  });
  vi.spyOn(globals, "useGraffitiSynchronize").mockReturnValue(graffiti);
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  const first = scope.run(() => useGraffitiGetMedia("url", {}))!;
  await vi.waitFor(() => expect(first.media.value).toBeTruthy());
  const second = scope.run(() => useGraffitiGetMedia("url", {}))!;
  await vi.waitFor(() => expect(second.media.value).toBeTruthy());
  expect(getMedia).toHaveBeenCalledTimes(2);
  const oldUrl = first.media.value!.dataUrl;
  await first.poll();
  expect(getMedia).toHaveBeenLastCalledWith("url", {}, { session: undefined, refresh: true });
  expect(revoke).toHaveBeenCalledWith(oldUrl);
  const finalUrl = first.media.value!.dataUrl;
  scope.stop();
  expect(revoke).toHaveBeenCalledWith(finalUrl);
});

it("allows the initial object cache hit but explicitly refreshes on poll", async () => {
  const graffiti = new GraffitiSynchronize(new GraffitiLocal());
  const get = vi.spyOn(graffiti, "get").mockResolvedValue({
    url: "url", actor: "did:example:owner", channels: [], value: {},
  });
  vi.spyOn(globals, "useGraffitiSynchronize").mockReturnValue(graffiti);
  const result = scope.run(() => useGraffitiGet("url", {}))!;
  await result.poll();
  expect(get).toHaveBeenLastCalledWith("url", {}, { session: undefined, refresh: undefined });
  await result.poll();
  expect(get).toHaveBeenLastCalledWith("url", {}, { session: undefined, refresh: true });
});


it("reacts to the refresh option on object and media reads", async () => {
  const graffiti = new GraffitiSynchronize(new GraffitiLocal());
  const get = vi.spyOn(graffiti, "get").mockResolvedValue({
    url: "url", actor: "did:example:owner", channels: [], value: {},
  });
  const getMedia = vi.spyOn(graffiti, "getMedia").mockResolvedValue({
    data: new Blob(["image"]), actor: "did:example:owner",
  });
  vi.spyOn(globals, "useGraffitiSynchronize").mockReturnValue(graffiti);
  const refresh = ref(false);
  scope.run(() => {
    useGraffitiGet("url", {}, { refresh });
    useGraffitiGetMedia("url", {}, { refresh: () => refresh.value });
  });
  await vi.waitFor(() => {
    expect(get).toHaveBeenLastCalledWith("url", {}, { session: undefined, refresh: false });
    expect(getMedia).toHaveBeenLastCalledWith("url", {}, { session: undefined, refresh: false });
  });
  refresh.value = true;
  await vi.waitFor(() => {
    expect(get).toHaveBeenLastCalledWith("url", {}, { session: undefined, refresh: true });
    expect(getMedia).toHaveBeenLastCalledWith("url", {}, { session: undefined, refresh: true });
  });
});
