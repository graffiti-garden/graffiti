<template>
    <header>
        <h2>Handle</h2>
        <nav v-if="handles?.length === 0">
            <ul>
                <li>
                    <RouterLink :to="{ name: 'register-handle' }" role="button">
                        Register Handle
                    </RouterLink>
                </li>
            </ul>
        </nav>
    </header>
    <p v-if="handles === undefined">
        <em>Loading...</em>
    </p>
    <template v-else-if="handles === null">
        <p><em>Error loading handle!</em></p>
        <button @click="fetchHandles">Retry</button>
    </template>
    <p v-else-if="handles.length === 0">
        <em>You have no handle.</em>
    </p>
    <ul v-else class="cards">
        <li>
            <DisplayHandle
                :handle="handles[0]"
                :onUnregister="onUnregister"
            />
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromSelf } from "../globals";
import type { Handle } from "./types";
import DisplayHandle from "./DisplayHandle.vue";

const handles = ref<Array<Handle> | undefined | null>(undefined);
function fetchHandles() {
    handles.value = undefined;
    fetchFromSelf("/app/handles/list")
        .then((value: { handles: Array<Handle> }) => {
            handles.value = value.handles;
        })
        .catch((error) => {
            console.error(error);
            handles.value = null;
        });
}
fetchHandles();

function onUnregister() {
    handles.value = [];
}
</script>
