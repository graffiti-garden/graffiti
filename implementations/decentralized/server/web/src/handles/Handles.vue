<template>
    <header>
        <h2>Handle</h2>
    </header>
    <p>
        Your handle is a human-readable and globally unique username, such as
        <code>example.{{ baseHost }}</code>.
    </p>
    <p v-if="handles === undefined">
        <em>Loading...</em>
    </p>
    <template v-else-if="handles === null">
        <p><em>Error loading handle!</em></p>
        <button @click="fetchHandles">Retry</button>
    </template>
    <ul v-else-if="handles.length" class="cards">
        <li>
            <DisplayHandle :record="handles[0]" />
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromSelf } from "../globals";
import type { HandleRecord } from "./types";
import DisplayHandle from "./DisplayHandle.vue";

const emit = defineEmits(["loaded"]);
const baseHost = window.location.host;
const handles = ref<Array<HandleRecord> | undefined | null>(undefined);
function fetchHandles() {
    handles.value = undefined;
    fetchFromSelf("/app/handles/list")
        .then((value: { handles: Array<HandleRecord> }) => {
            handles.value = value.handles;
        })
        .catch((error) => {
            console.error(error);
            handles.value = null;
        })
        .finally(() => emit("loaded"));
}
fetchHandles();
</script>
