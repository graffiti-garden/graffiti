<template>
    <article>
        <h2>
            <a :href="documentUrl" target="_blank">
                {{ fullHandle }}
            </a>
            <CopyButton :text="fullHandle" />
        </h2>
        <RouterLink :to="{ name: 'replace-handle' }" role="button">
            Replace handle
        </RouterLink>
    </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { identifierToDocumentUrl, identifierToHandle } from "../../../shared/did-schemas";
import type { HandleRecord } from "./types";
import CopyButton from "../utils/CopyButton.vue";

const props = defineProps<{
    record: HandleRecord;
}>();

const baseHost = window.location.host;
const fullHandle = computed(() => identifierToHandle(props.record.identifier, baseHost));
const documentUrl = computed(() => identifierToDocumentUrl(props.record.identifier, baseHost));
</script>
