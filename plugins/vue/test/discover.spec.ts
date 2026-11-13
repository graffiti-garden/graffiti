import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, watch, type EffectScope, type Ref } from "vue";
import {
  compileGraffitiObjectSchema,
  type GraffitiObjectBase,
  type GraffitiObjectStream,
} from "@graffiti-garden/api";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiSynchronize } from "@graffiti-garden/wrapper-synchronize";
import * as globals from "../src/globals";
import { useGraffitiDiscover } from "../src/composables/discover";

let scope: EffectScope;
let release: (() => void)[];

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  release.push(resolve);
  return { promise, resolve };
}

function object(number: number): GraffitiObjectBase {
  return {
    url: `graffiti:did:example:author:object-${number}`,
    actor: "did:example:author",
    channels: ["items"],
    value: { number },
  };
}

function discover() {
  const second = gate();
  const end = gate();
  const local = new GraffitiLocal();
  Object.assign(local, {
    discover: async function* (): GraffitiObjectStream<{}> {
      yield { object: object(1) };
      await second.promise;
      yield { object: object(2) };
      await end.promise;
      yield { tombstone: true, object: object(1) };
      return { cursor: "complete" };
    },
  });
  vi.spyOn(globals, "useGraffitiSynchronize")
    .mockReturnValue(new GraffitiSynchronize(local));
  const result = scope.run(() => useGraffitiDiscover<{}>(["items"], {}))!;
  return {
    ...result,
    objects: result.objects as Ref<GraffitiObjectBase[]>,
    second,
    end,
  };
}

beforeEach(async () => {
  // Keep schema compilation outside the controlled delivery/timer sequence.
  await compileGraffitiObjectSchema({});
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  scope = effectScope();
  release = [];
});

afterEach(async () => {
  scope.stop();
  release.forEach(resolve => resolve());
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("flushes final objects and tombstones before the first poll completes", async () => {
  const result = discover();
  const pendingPoll = result.poll();
  await vi.advanceTimersByTimeAsync(0);
  expect(result.objects.value.map(o => o.url)).toEqual([object(1).url]);

  await vi.advanceTimersByTimeAsync(10);
  result.second.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(result.objects.value.map(o => o.url)).toEqual([object(1).url]);
  expect(result.isFirstPoll.value).toBe(true);

  result.end.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(result.objects.value.map(o => o.url)).toEqual([object(2).url]);
  expect(result.isFirstPoll.value).toBe(false);
  await pendingPoll;

  const updates = vi.fn();
  const stop = watch(result.objects, updates);
  await vi.advanceTimersByTimeAsync(50);
  expect(updates).not.toHaveBeenCalled();
  stop();
});

it("retains the 50 ms batch window while objects are still streaming", async () => {
  const result = discover();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(10);
  result.second.resolve();
  await vi.advanceTimersByTimeAsync(49);
  expect(result.objects.value.map(o => o.url)).toEqual([object(1).url]);
  await vi.advanceTimersByTimeAsync(1);
  expect(result.objects.value.map(o => o.url)).toEqual([object(1).url, object(2).url]);
  expect(result.isFirstPoll.value).toBe(true);
});

it("cancels a pending batch when the discovery scope is disposed", async () => {
  const result = discover();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(10);
  result.second.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  scope.stop();
  expect(vi.getTimerCount()).toBe(0);
  result.end.resolve();
  await vi.runAllTimersAsync();
  expect(result.objects.value.map(o => o.url)).toEqual([object(1).url]);
  expect(result.isFirstPoll.value).toBe(true);
});
