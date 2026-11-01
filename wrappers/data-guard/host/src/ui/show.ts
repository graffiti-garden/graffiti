import { markRaw, ref, shallowReactive, type Component } from "vue";
import { setVisible } from "../bootstrap/protocol.js";

export const pendingRequests = ref(0);
export const privateResult = ref<number>();

export const componentState = shallowReactive<{
  component: Component | null;
  props: Record<string, unknown>;
}>({ component: null, props: {} });

let promptQueue = Promise.resolve();

/** Inline prompts share one dialog surface and always clean up before the next. */
export function withPrompt<T>(open: () => Promise<T>): Promise<T> {
  const result = promptQueue.then(async () => {
    setVisible(true);
    try {
      return await open();
    } finally {
      clear();
      pendingRequests.value = 0;
      privateResult.value = undefined;
      setVisible(false);
    }
  });
  promptQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function show(component: Component, props: Record<string, unknown> = {}) {
  componentState.component = markRaw(component);
  componentState.props = props;
}

export function clear() {
  componentState.component = null;
  componentState.props = {};
}
