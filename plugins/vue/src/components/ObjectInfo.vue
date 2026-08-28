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
        <p>@<ActorToHandle :actor="object.actor" /> posted:</p>
        <pre>{{ object.value }}</pre>
        <details>
            <summary>Show object properties</summary>

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

                <dt>Content</dt>
                <dd>
                    <pre>{{ object.value }}</pre>
                </dd>

                <dt>Allowed actors</dt>
                <dd>
                    <p v-if="!Array.isArray(object.allowed)">
                        <em>Public</em>
                    </p>
                    <p v-else-if="object.allowed.length === 0">
                        <em>No one is allowed (except you)</em>
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
                </dd>

                <dt>Channels</dt>
                <dd>
                    <ul v-if="object.channels?.length">
                        <li v-for="channel in object.channels" :key="channel">
                            <code>{{ channel }}</code>
                        </li>
                    </ul>
                    <p v-else>
                        <em>No channels</em>
                    </p>
                </dd>
            </dl>
        </details>
        <button
            v-if="$graffitiSession.value?.actor === object.actor"
            :disabled="deleting"
            @click="deleteObject(object, $graffitiSession.value)"
        >
            {{ deleting ? "Deleting..." : "Delete" }}
        </button>
    </article>

    <article v-else-if="object === null">
        <p><em>Graffiti object not found</em></p>
    </article>

    <article v-else>
        <p><em>Graffiti object loading...</em></p>
    </article>
</template>
