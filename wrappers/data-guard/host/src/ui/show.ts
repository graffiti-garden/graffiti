import { markRaw, ref, shallowReactive, type Component } from "vue";

export const pendingRequests = ref(0);
export const privateResult = ref<number>();

export const componentState = shallowReactive<{
  component: Component | null;
  props: Record<string, unknown>;
}>({ component: null, props: {} });

export function show(component: Component, props: Record<string, unknown> = {}) {
  componentState.component = markRaw(component);
  componentState.props = props;
}

export function clear() {
  componentState.component = null;
  componentState.props = {};
}
