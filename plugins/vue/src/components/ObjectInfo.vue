<script setup lang="ts">
import type { GraffitiObjectBase, GraffitiSession } from "@graffiti-garden/api";
import ActorToHandle from "./ActorToHandle.vue";
import { useGraffiti } from "../globals";
import { ref } from "vue";

defineProps<{
    object: GraffitiObjectBase | null | undefined;
}>();

const graffiti = useGraffiti();
const deleting = ref(false);
async function deleteObject(
    object: GraffitiObjectBase,
    session: GraffitiSession,
) {
    deleting.value = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (
        confirm(
            "Are you sure you want to delete this object? It cannot be undone.",
        )
    ) {
        await graffiti.delete(object, session);
    }
    deleting.value = false;
}
</script>

<template>
    <article v-if="object" :data-url="object.url">
        <header>
            <h2>Graffiti Object</h2>

            <dl>
                <dt>Object URL</dt>
                <dd>
                    <code>{{ object.url }}</code>
                </dd>

                <dt>Actor</dt>
                <dd>
                    <code>{{ object.actor }}</code>
                </dd>

                <dt>Handle</dt>
                <dd>
                    <ActorToHandle :actor="object.actor" />
                </dd>
            </dl>
        </header>

        <section>
            <h3>Content</h3>
            <pre>{{ object.value }}</pre>
        </section>

        <section>
            <h3>Allowed Actors</h3>

            <p v-if="!Array.isArray(object.allowed)">
                <em>Public</em>
            </p>
            <p v-else-if="object.allowed.length === 0">
                <em>Noone</em>
            </p>
            <ul>
                <li v-for="actor in object.allowed" :key="actor">
                    <dl>
                        <dt>Actor</dt>
                        <dd>
                            <code>{{ actor }}</code>
                        </dd>
                        <dt>Handle</dt>
                        <dd>
                            <ActorToHandle :actor="actor" />
                        </dd>
                    </dl>
                </li>
            </ul>
        </section>

        <section>
            <h3>Channels</h3>

            <ul v-if="object.channels?.length">
                <li v-for="channel in object.channels" :key="channel">
                    <code>{{ channel }}</code>
                </li>
            </ul>
            <p v-else>
                <em>No channels</em>
            </p>
        </section>

        <footer>
            <nav>
                <ul>
                    <li v-if="$graffitiSession.value?.actor === object.actor">
                        <button
                            :disabled="deleting"
                            @click="
                                deleteObject(object, $graffitiSession.value)
                            "
                        >
                            {{ deleting ? "Deleting..." : "Delete" }}
                        </button>
                    </li>
                </ul>
            </nav>
        </footer>
    </article>

    <article v-else-if="object === null">
        <header>
            <h2>Graffiti Object</h2>
        </header>
        <p><em>Object not found</em></p>
    </article>

    <article v-else>
        <header>
            <h2>Graffiti Object</h2>
        </header>
        <p><em>Loading...</em></p>
    </article>
</template>
