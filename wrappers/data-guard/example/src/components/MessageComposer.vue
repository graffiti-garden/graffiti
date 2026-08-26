<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import { computed, ref, useTemplateRef } from "vue";
import {
  errorMessage,
  messageChannel,
  type MessageAttachment,
} from "../model.js";

const props = defineProps<{ session: GraffitiSession }>();
const graffiti = useGraffiti();
const content = ref("");
const mention = ref("");
const attachment = ref<File>();
const fileInput = useTemplateRef("fileInput");
const busy = ref(false);
const error = ref("");
const notice = ref("");
const canSend = computed(
  () => !busy.value && Boolean(content.value.trim() || attachment.value),
);

function selectAttachment(event: Event) {
  attachment.value = (event.target as HTMLInputElement).files?.[0];
}

async function send() {
  if (!canSend.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  let mediaUrl: string | undefined;

  try {
    const mentions = mention.value.trim()
      ? [await graffiti.handleToActor(mention.value.trim())]
      : undefined;
    let media: MessageAttachment | undefined;
    if (attachment.value) {
      const file = attachment.value;
      mediaUrl = await graffiti.postMedia({ data: file }, props.session);
      media = {
        type: "Document",
        url: mediaUrl,
        mediaType: file.type || "application/octet-stream",
        name: file.name,
        size: file.size,
      };
    }

    await graffiti.post(
      {
        value: {
          type: "Note",
          content: content.value.trim(),
          published: new Date().toISOString(),
          ...(mentions ? { mentions } : {}),
          ...(media ? { attachment: media } : {}),
        },
        // One stable public room; Graffiti channels are discovery indexes.
        channels: [messageChannel],
      },
      props.session,
    );

    content.value = "";
    mention.value = "";
    attachment.value = undefined;
    if (fileInput.value) fileInput.value.value = "";
    notice.value = "Message sent.";
  } catch (cause) {
    error.value = errorMessage(cause);
    if (mediaUrl) {
      try {
        await graffiti.deleteMedia(mediaUrl, props.session);
      } catch {}
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <article class="composer">
    <form @submit.prevent="send">
      <label>
        Message
        <textarea
          v-model="content"
          rows="3"
          placeholder="Write a message…"
          :disabled="busy"
        />
      </label>
      <div class="composer-options">
        <label>
          Mention someone <small>(optional)</small>
          <input
            v-model="mention"
            type="text"
            placeholder="their.handle"
            :disabled="busy"
          />
        </label>
        <label>
          Attachment <small>(optional)</small>
          <input
            ref="fileInput"
            type="file"
            :disabled="busy"
            @change="selectAttachment"
          />
        </label>
      </div>
      <footer class="composer-footer">
        <span>
          <small v-if="notice" class="success">{{ notice }}</small>
          <small v-if="error" class="error" role="alert">{{ error }}</small>
        </span>
        <button
          type="submit"
          :disabled="!canSend"
          :aria-busy="busy"
        >
          Send
        </button>
      </footer>
    </form>
  </article>
</template>
