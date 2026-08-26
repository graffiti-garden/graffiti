<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import { computed, ref, watch } from "vue";
import AttachmentView from "./AttachmentView.vue";
import {
  errorMessage,
  messageSchema,
  type MessageObject,
} from "../model.js";

const props = defineProps<{
  message: MessageObject;
  session?: GraffitiSession;
}>();
const graffiti = useGraffiti();
const current = ref(props.message);
const busy = ref<"reload" | "delete">();
const error = ref("");
const canDelete = computed(
  () => props.session?.actor === current.value.actor,
);
const published = computed(() =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(current.value.value.published)),
);

watch(
  () => props.message,
  (message) => (current.value = message),
);

async function reload() {
  busy.value = "reload";
  error.value = "";
  try {
    current.value = (await graffiti.get(
      current.value.url,
      messageSchema,
    )) as MessageObject;
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = undefined;
  }
}

async function remove() {
  if (!props.session || !canDelete.value) return;
  busy.value = "delete";
  error.value = "";
  try {
    if (current.value.value.attachment) {
      await graffiti.deleteMedia(
        current.value.value.attachment.url,
        props.session,
      );
    }
    await graffiti.delete(current.value.url, props.session);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = undefined;
  }
}
</script>

<template>
  <article class="message">
    <header class="message-meta">
      <strong>
        <GraffitiActorToHandle :actor="current.actor" />
      </strong>
      <small>{{ published }}</small>
    </header>

    <p v-if="current.value.content" class="message-content">
      {{ current.value.content }}
    </p>
    <p v-if="current.value.mentions?.length" class="mentions">
      <small>
        Mentioned:
        <template v-for="actor in current.value.mentions" :key="actor">
          <GraffitiActorToHandle :actor="actor" />
        </template>
      </small>
    </p>
    <AttachmentView
      v-if="current.value.attachment"
      :attachment="current.value.attachment"
    />

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <footer class="message-actions">
      <button
        type="button"
        class="secondary outline"
        :aria-busy="busy === 'reload'"
        :disabled="Boolean(busy)"
        @click="reload"
      >
        Reload
      </button>
      <button
        v-if="canDelete"
        type="button"
        class="secondary outline"
        :aria-busy="busy === 'delete'"
        :disabled="Boolean(busy)"
        @click="remove"
      >
        Delete
      </button>
    </footer>
  </article>
</template>
