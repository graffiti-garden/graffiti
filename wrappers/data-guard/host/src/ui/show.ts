import { markRaw, shallowReactive, type Component } from "vue";

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
