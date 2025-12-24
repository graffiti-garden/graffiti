<template>
    <header>
        <h1>Actors</h1>
        <nav>
            <ul>
                <li>
                    <button @click="createActor" :disabled="creating">
                        {{ creating ? "Creating New Actor..." : "New Actor" }}
                    </button>
                </li>
                <li>
                    <button :disabled="importing" @click="importActor">
                        {{ importing ? "Importing Actor..." : "Import Actor" }}
                    </button>
                </li>
            </ul>
        </nav>
    </header>
    <p v-if="actors === undefined">
        <em>Loading...</em>
    </p>
    <template v-else-if="actors === null">
        <p><em>Error loading actors!</em></p>
        <button @click="fetchActors">Retry</button>
    </template>
    <ul v-else>
        <li v-for="actor in actors" :key="actor.did">
            <DisplayActor :actor="actor" />
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchFromAPI } from "../globals";
import type { Actor } from "./types";
import DisplayActor from "./DisplayActor.vue";

const actors = ref<Array<Actor> | undefined | null>(undefined);
function fetchActors() {
    actors.value = undefined;
    fetchFromAPI("/actors/list")
        .then((value: { actors: Array<Actor> }) => {
            actors.value = value.actors.sort(
                (a, b) => b.createdAt - a.createdAt,
            );
        })
        .catch((error) => {
            console.error(error);
            actors.value = null;
        });
}
fetchActors();

const creating = ref(false);
async function createActor() {
    creating.value = true;
    try {
        const result = await fetchFromAPI("/actors/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        const { did, rotationKey, createdAt } = result;
        actors.value?.unshift({ did, rotationKey, createdAt });
    } catch (error) {
        alert(error);
    } finally {
        creating.value = false;
    }
}

const importing = ref(false);
async function importActor() {
    importing.value = true;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";

    let finished = false;
    const cleanup = () => {
        finished = true;
        importing.value = false;
        input.value = ""; // allow picking same file again later
        input.remove(); // avoid leaking DOM nodes
        window.removeEventListener("focus", onFocusBack, true);
    };

    // When the dialog closes (Cancel or Select), the window regains focus.
    const onFocusBack = () => {
        // Delay so `change` (if it fires) runs first.
        setTimeout(() => {
            if (!finished) cleanup(); // Cancel / dialog closed without change event
        }, 0);
    };

    window.addEventListener("focus", onFocusBack, true);

    input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return cleanup();

        const reader = new FileReader();

        reader.onload = async () => {
            let json: any;
            try {
                if (typeof reader.result !== "string") {
                    alert("Invalid file type");
                    return;
                }
                json = JSON.parse(reader.result);
            } catch {
                alert("Invalid JSON file");
                return cleanup();
            }

            const { did } = json;
            if (actors.value?.some((actor) => actor.did === did)) {
                alert("Actor already exists");
                return cleanup();
            }

            try {
                const result = await fetchFromAPI("/actors/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(json),
                });
                const { did, rotationKey, createdAt } = result;
                actors.value?.unshift({ did, rotationKey, createdAt });
            } catch (error) {
                alert(error);
            } finally {
                cleanup();
            }
        };

        reader.onerror = () => {
            alert("Error reading file");
            cleanup();
        };

        reader.readAsText(file);
    };

    input.style.display = "none";
    document.body.appendChild(input);
    input.click();
}
</script>
