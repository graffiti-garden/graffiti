<script setup lang="ts">
import { ref, toRef, watch } from "vue";
import type {
    GraffitiSession,
    GraffitiMediaRequirements,
    GraffitiMedia,
} from "@graffiti-garden/api";
import { useGraffitiGetMedia } from "../composables";

const props = defineProps<{
    url: string;
    requirements: GraffitiMediaRequirements;
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
    toRef(props, "requirements"),
    toRef(props, "session"),
);
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
            :src="media.dataUrl"
            :alt="`A video by ${media.actor}`"
        />
        <audio
            v-else-if="media?.data.type.startsWith('audio/')"
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
        <p v-else-if="media">Unsupported media type</p>
        <p v-else-if="media === null">Media not found</p>
        <p v-else>Loading...</p>
    </slot>
</template>
