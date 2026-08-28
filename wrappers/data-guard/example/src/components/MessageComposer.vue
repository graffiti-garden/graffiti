<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import { computed, ref, useTemplateRef } from "vue";
import {
  errorMessage,
  messageChannel,
  type MessageAttachment,
} from "../model.js";

const props = defineProps<{
  session: GraffitiSession;
  inReplyTo?: string;
}>();
const graffiti = useGraffiti();
const content = ref(
  "Hello world, this is a sort of long piece text just to test what happens with wrapping, hope it works!!! and im going to keep going for a little bit... okkkkk now its.... good",
);
const mention = ref(
  "did:plc:numtqzbw74lmrguyvpzq6uf5, did:plc:ewvi7nxzyoun6zhxrhs64oiz, did:web:graffiti.garden",
);
const attachment = ref<File>();
const privateAttachment = ref(false);
const fileInput = useTemplateRef("fileInput");
const busy = ref(false);
const error = ref("");
const notice = ref("");
const canSend = computed(
  () => !busy.value && Boolean(content.value.trim() || attachment.value),
);

function selectAttachment(event: Event) {
  attachment.value = (event.target as HTMLInputElement).files?.[0];
  if (!attachment.value) privateAttachment.value = false;
}

async function send() {
  if (!canSend.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  let mediaUrl: string | undefined;

  try {
    const mentions = await Promise.all(
      mention.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) =>
          value.startsWith("did:") ? value : graffiti.handleToActor(value),
        ),
    );
    let media: MessageAttachment | undefined;
    if (attachment.value) {
      const file = attachment.value;
      mediaUrl = await graffiti.postMedia(
        {
          data: file,
          ...(privateAttachment.value ? { allowed: [] } : {}),
        },
        props.session,
      );
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
          content: content.value.trim(),
          published: new Date().toISOString(),
          inReplyTo:
            props.inReplyTo ??
            "graffiti:did!plc!numtqzbw74lmrguyvpzq6uf5:uEiBQi0oYnjV_A-EOuv0Vwpz7ExiNmZ2YlAm4liR4jZq-dQ",
          mentions,
          replies: false,
          id: crypto.randomUUID(),
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
    privateAttachment.value = false;
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
          Mention people <small>(comma-separated, optional)</small>
          <input
            v-model="mention"
            type="text"
            placeholder="handles or DIDs"
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
        <label class="private-attachment">
          <input
            v-model="privateAttachment"
            type="checkbox"
            :disabled="busy || !attachment"
          />
          Private attachment <small>(only you can access it)</small>
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
