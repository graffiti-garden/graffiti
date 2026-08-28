<script setup lang="ts">
import { toRef } from "vue";
import type {
    GraffitiSession,
    GraffitiMediaAccept,
    GraffitiMedia,
} from "@graffiti-garden/api";
import { useGraffitiGetMedia } from "../composables/get-media";

const props = defineProps<{
    url: string;
    accept: GraffitiMediaAccept;
    session?: GraffitiSession | null;
}>();

defineSlots<{
    default?(props: {
        media: (GraffitiMedia & { dataUrl: string }) | null | undefined;
        poll: () => Promise<void>;
    }): any;
}>();

const { media, poll } = useGraffitiGetMedia(
    toRef(props, "url"),
    toRef(props, "accept"),
    toRef(props, "session"),
);

function downloadMedia() {
    if (media.value) {
        window.location.href = media.value.dataUrl;
    }
}
</script>

<template>
    <slot :media="media" :poll="poll">
        <img
            v-if="media?.data.type.startsWith('image/')"
            :src="media.dataUrl"
            :alt="`An image by ${media.actor}`"
        />
        <video
            v-else-if="media?.data.type.startsWith('video/')"
            controls
            :src="media.dataUrl"
            :alt="`A video by ${media.actor}`"
        />
        <audio
            v-else-if="media?.data.type.startsWith('audio/')"
            controls
            :src="media.dataUrl"
            :alt="`Audio by ${media.actor}`"
        />
        <iframe
            v-else-if="media?.data.type === 'text/html'"
            :src="media.dataUrl"
            :alt="`HTML by ${media.actor}`"
            sandbox=""
        />
        <object
            v-else-if="media?.data.type.startsWith('application/pdf')"
            :data="media.dataUrl"
            type="application/pdf"
            :alt="`PDF by ${media.actor}`"
        />
        <button v-else-if="media" @click="downloadMedia">Download media</button>
        <p v-else-if="media === null">
            <em>Media not found</em>
        </p>
        <p v-else>
            <em> Media loading... </em>
        </p>
    </slot>
</template>
