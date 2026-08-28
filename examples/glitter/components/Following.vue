<script setup lang="ts">
import { computed, ref } from "vue";
import {
    useGraffiti,
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import Follow from "./Follow.vue";
import Name from "./Name.vue";
import { postFollow, type FollowObject } from "./follows";
import { followSchema } from "./schemas";

const graffiti = useGraffiti();
const sessionRef = useGraffitiSession();

const { objects: following, isFirstPoll } = useGraffitiDiscover(
    () => (sessionRef.value ? [sessionRef.value.actor] : []),
    () => followSchema(sessionRef.value?.actor ?? ""),
);
const followsByActor = computed(() => {
    const grouped = new Map<string, FollowObject[]>();
    for (const follow of following.value as unknown as FollowObject[]) {
        const actorFollows = grouped.get(follow.value.object) ?? [];
        actorFollows.push(follow);
        grouped.set(follow.value.object, actorFollows);
    }
    return grouped;
});

const followTarget = ref("");
const isFollowing = ref(false);
const followError = ref("");
async function follow() {
    const account = followTarget.value.trim();
    const session = sessionRef.value;
    if (!account || !session || isFollowing.value) return;

    isFollowing.value = true;
    followError.value = "";
    try {
        const actor = account.startsWith("did:")
            ? account
            : await graffiti.handleToActor(account);
        if (following.value.some((entry) => entry.value.object === actor)) {
            followTarget.value = "";
            return;
        }

        await postFollow(graffiti, actor, session);
        followTarget.value = "";
    } catch (error) {
        console.error(error);
        followError.value = "That account could not be found.";
    } finally {
        isFollowing.value = false;
    }
}

const copying = ref(false);
async function copyHandle() {
    const session = sessionRef.value;
    if (!session || copying.value) return;

    try {
        const handle = await graffiti.actorToHandle(session.actor);
        await navigator.clipboard.writeText(handle);
        copying.value = true;
        await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
        copying.value = false;
    }
}

</script>

<template>
    <section>
        <h1>Following</h1>
        <div class="manual-follow">
            <p>Follow someone by their Graffiti handle or actor DID.</p>
            <div class="username">
                <code>
                    <GraffitiActorToHandle
                        v-if="$graffitiSession.value"
                        :actor="$graffitiSession.value.actor"
                    />
                </code>
                <button @click="copyHandle" :disabled="copying">
                    {{ !copying ? "Copy handle" : "Copied" }}
                </button>
            </div>

            <form @submit.prevent="follow">
                <input
                    v-model="followTarget"
                    type="text"
                    placeholder="Handle or actor DID"
                    :disabled="isFollowing"
                />
                <button type="submit" :disabled="isFollowing">
                    {{ isFollowing ? "Following..." : "Follow" }}
                </button>
            </form>
            <p v-if="followError" role="alert">{{ followError }}</p>
        </div>

        <p v-if="isFirstPoll">Loading...</p>
        <p v-else-if="!following.length">You are not following anyone yet.</p>
        <ul v-else>
            <li v-for="[actor, follows] in followsByActor" :key="actor">
                <Name :actor="actor" />
                <div class="modifiers">
                    <Follow :object="actor" :follows="follows" />
                </div>
            </li>
        </ul>
    </section>
</template>

<style scoped>
section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
}

section * {
    margin: 0;
    padding: 0;
}

h1 {
    font-size: 1.5rem;
    text-align: center;
}

.manual-follow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: center;
}

.username {
    display: flex;
    align-items: center;
}

p {
    font-size: 1rem;
}

code {
    display: inline-block;
    background: white;
    padding: 0.5rem;
    font-family: monospace;
}

button:not(li *) {
    background: var(--blue);
    color: white;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 1rem;
}

button:not(li *):hover {
    background: var(--dark-blue);
}

form {
    width: 100%;
    display: flex;
}

input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    font-size: 1rem;
}

li {
    width: 100%;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modifiers {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;

    button {
        padding: 0.5rem;
    }
}
</style>
