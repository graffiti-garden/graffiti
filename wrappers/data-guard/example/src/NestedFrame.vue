<script setup lang="ts">
import type { Graffiti } from "@graffiti-garden/api";
import { withGuardSource } from "@graffiti-garden/wrapper-data-guard";
import { createGraffitiRelay, serveGraffiti } from "@graffiti-garden/wrapper-iframe-rpc/host";
import { onMounted, onUnmounted, useTemplateRef } from "vue";

const props = defineProps<{ labId: string; createGraffiti: () => Graffiti }>();
const iframe = useTemplateRef<HTMLIFrameElement>("childFrame");
const childPort = window.location.port === "5183" ? "5185" : "5183";
const childUrl = `${window.location.protocol}//${window.location.hostname}:${childPort}/flow-lab-child.html?lab=${encodeURIComponent(props.labId)}&parentOrigin=${encodeURIComponent(window.location.origin)}`;
const child = { id: "flow-lab-child", name: "Flow lab child", url: childUrl };
let stop: (() => void) | undefined;

onMounted(() => {
  const remoteWindow = iframe.value?.contentWindow;
  if (!remoteWindow) return;
  const relay = createGraffitiRelay(props.createGraffiti(), child.id);
  const scoped = withGuardSource(relay.graffiti, () => child);
  const host = serveGraffiti(scoped.graffiti);
  const connection = host.connect({
    remoteWindow,
    allowedOrigins: [new URL(childUrl).origin],
    stateId: relay.stateId,
  });
  stop = () => {
    scoped.destroy();
    relay.destroy();
    void connection.destroy();
    void host.destroy();
  };
});
onUnmounted(() => stop?.());
</script>

<template>
  <iframe
    ref="childFrame"
    :src="childUrl"
    title="Nested flow lab site"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  />
</template>

<style scoped>
iframe { display: block; width: 100%; min-height: 48rem; margin-top: 1rem; border: 1px solid var(--pico-muted-border-color); border-radius: 0.5rem; }
</style>
