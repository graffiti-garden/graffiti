<template>
    <p v-if="handles === undefined">Loading...</p>
    <ul v-else>
        <li v-for="handle in handles" :key="handle.handle">
            <article>
                <h2>
                    {{ handle.handle }}
                </h2>
                <nav>
                    <ul>
                        <li>
                            <button
                                :disabled="deleting"
                                @click="deleteHandle(handle.handle)"
                            >
                                Delete
                            </button>
                        </li>
                    </ul>
                </nav>
            </article>
        </li>
    </ul>
    <RouterLink to="/register-handle">New Actor</RouterLink>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromAPI } from "../globals";

interface Handle {
    handle: string;
    createdAt: number;
    data: Record<string, any>;
}

const handles = ref<Array<Handle> | undefined>(undefined);

function fetchActors() {
    fetchFromAPI("/handles/list").then((value: { handles: Array<Handle> }) => {
        handles.value = value.handles.sort((a, b) => a.createdAt - b.createdAt);
    });
}
fetchActors();

const deleting = ref(false);
function deleteHandle(handle: string) {
    deleting.value = true;
    fetchFromAPI("/handles/delete", {
        method: "POST",
        body: JSON.stringify({ handle }),
    })
        .then(() => {
            fetchActors();
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            deleting.value = false;
        });
}
</script>
