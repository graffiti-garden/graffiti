<template>
    <header>
        <h2>Handles</h2>
        <nav>
            <ul>
                <li>
                    <RouterLink to="/register-handle"
                        >Register New Handle
                    </RouterLink>
                </li>
            </ul>
        </nav>
    </header>
    <p v-if="handles === undefined">
        <em>Loading...</em>
    </p>
    <template v-else-if="handles === null">
        <p><em>Error loading handles!</em></p>
        <button @click="fetchHandles">Retry</button>
    </template>
    <p v-else-if="handles.length === 0">
        <em>You have no handles.</em>
    </p>
    <ul v-else>
        <li v-for="handle in handles" :key="handle.name">
            <DisplayHandle
                :handle="handle"
                :onUnregister="() => onUnregister(handle)"
            />
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromAPI } from "../globals";
import type { Handle } from "./types";
import DisplayHandle from "./DisplayHandle.vue";

const handles = ref<Array<Handle> | undefined | null>(undefined);
function fetchHandles() {
    handles.value = undefined;
    fetchFromAPI("/handles/list")
        .then((value: { handles: Array<Handle> }) => {
            handles.value = value.handles.sort(
                (a, b) => b.createdAt - a.createdAt,
            );
        })
        .catch((error) => {
            console.error(error);
            handles.value = null;
        });
}
fetchHandles();

function onUnregister(handle: Handle) {
    handles.value?.splice(
        handles.value.findIndex((h) => h.name === handle.name),
        1,
    );
}
</script>
