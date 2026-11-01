<script setup lang="ts">
import { onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import IdentityValue from "../values/IdentityValue.vue";
import StructuredValue from "../values/StructuredValue.vue";
import DetailList from "./shared/DetailList.vue";

defineProps<{
  channels: string[];
  allowed?: string[] | null;
  help?: boolean;
}>();

const channelHelpOpen = ref(false);
const channelHelpId = useId();
const channelHelp = useTemplateRef<HTMLElement>("channelHelp");

function hideChannelHelp() {
  channelHelpOpen.value = false;
}

function closeChannelHelpWithEscape(event: KeyboardEvent) {
  if (!channelHelpOpen.value) return;
  event.stopPropagation();
  event.preventDefault();
  hideChannelHelp();
}

function closeChannelHelp(event: PointerEvent) {
  if (!channelHelp.value?.contains(event.target as Node)) hideChannelHelp();
}

function toggleChannelHelp() {
  if (channelHelpOpen.value) hideChannelHelp();
  else channelHelpOpen.value = true;
}

watch(channelHelpOpen, (open) => {
  if (open) document.addEventListener("pointerdown", closeChannelHelp);
  else document.removeEventListener("pointerdown", closeChannelHelp);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeChannelHelp));
</script>

<template>
  <DetailList>
    <dt class="term">
      Channels
      <span
        v-if="help"
        ref="channelHelp"
        class="context-help"
        :class="{ open: channelHelpOpen }"
        @keydown.esc="closeChannelHelpWithEscape"
      >
        <button
          type="button"
          class="context-help-button"
          aria-label="What are channels?"
          :aria-expanded="channelHelpOpen"
          :aria-controls="channelHelpId"
          :aria-describedby="channelHelpOpen ? channelHelpId : undefined"
          @click="toggleChannelHelp"
        >?</button>
        <span class="context-help-text" role="tooltip" :id="channelHelpId">
          A channel is a label that identifies where data can be found.
          Data can only be found by searching one of its channels.
        </span>
      </span>
    </dt>
    <dd v-if="channels.length" class="channels">
      <ul><li v-for="channel in channels" :key="channel"><StructuredValue :value="channel" /></li></ul>
    </dd>
    <dd v-else><em>None</em></dd>
    <dt>Visibility</dt>
    <dd v-if="allowed == null"><em>Anyone with the link or a channel</em></dd>
    <dd v-else-if="allowed.length === 0"><em>Only you</em></dd>
    <dd v-else><ul class="actors"><li v-for="actor in allowed" :key="actor"><IdentityValue :actor="actor" /></li></ul></dd>
  </DetailList>
</template>

<style scoped>
.actors, .channels ul { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
.channels li { max-width: 100%; }
.term { display: flex; align-items: center; gap: 0.35rem; }
.context-help { position: relative; display: inline-flex; font-weight: 400; }
button.context-help-button { display: grid; width: 1.15rem; min-width: 1.15rem; height: 1.15rem; box-sizing: border-box; place-items: center; border: 1px solid var(--border-color-hover); border-radius: 50%; padding: 0; color: var(--secondary-color); background: var(--background-color-interactive); box-shadow: none; font-size: 0.75rem; font-weight: 750; line-height: 1; cursor: help; }
button.context-help-button:hover, button.context-help-button:focus-visible, .context-help.open button.context-help-button { border-color: var(--border-color-hover); color: var(--text-color); background: var(--background-color-interactive-hover); box-shadow: none; }
.context-help-text { position: absolute; bottom: calc(100% + 0.48rem); left: -0.68rem; z-index: 5; display: block; width: min(18rem, calc(100vw - 3rem)); box-sizing: border-box; border: 1px solid var(--border-color-hover); border-radius: 0.4rem; padding: 0.55rem 0.65rem; color: var(--text-color); background: var(--background-color); box-shadow: 0 0.25rem 0.7rem rgb(0 0 0 / 24%); font-size: 0.85rem; font-weight: 400; line-height: 1.4; opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(0.25rem) scale(0.98); transform-origin: bottom left; transition: opacity 130ms ease, transform 130ms ease, visibility 0s linear 130ms; }
.context-help-text::before, .context-help-text::after { position: absolute; left: 1.25rem; width: 0; height: 0; transform: translateX(-50%); border-right: 0.44rem solid transparent; border-left: 0.44rem solid transparent; content: ""; }
.context-help-text::before { bottom: -0.45rem; border-top: 0.45rem solid var(--border-color-hover); }
.context-help-text::after { bottom: -0.37rem; border-top: 0.4rem solid var(--background-color); border-right-width: 0.39rem; border-left-width: 0.39rem; }
.context-help:hover .context-help-text, .context-help.open .context-help-text { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0) scale(1); transition-delay: 0s; }
@media (max-width: 42rem) {
  .term { position: relative; }
  .context-help { position: static; }
  .context-help-text { top: calc(100% + 0.3rem); right: 0; bottom: auto; left: 0; width: 100%; max-width: 100%; }
  .context-help-text::before, .context-help-text::after { display: none; }
}
</style>
