<script setup lang="ts">
import { computed, ref } from "vue";
import {
    useGraffitiDiscover,
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import Follow from "./Follow.vue";
import Name from "./Name.vue";
import { type FollowObject } from "./follows";
import { followSchema, joinSchema } from "./schemas";

const graffiti = useGraffiti();
const sessionRef = useGraffitiSession();
const joinChannel = "glitter";

const { objects: joinObjects, isFirstPoll: isPollingDirectory } =
    useGraffitiDiscover([joinChannel], joinSchema(joinChannel));

type DirectoryJoin = {
    url: string;
    actor: string;
    value: { object: string };
};
function validJoinObjects() {
    return (joinObjects.value as unknown as DirectoryJoin[]).filter(
        (join) => join.actor === join.value.object,
    );
}

const joins = computed(() => {
    const joinsByActor = new Map<string, DirectoryJoin>();
    for (const join of validJoinObjects()) {
        joinsByActor.set(join.actor, join);
    }
    return [...joinsByActor.values()];
});

const { objects: followObjects, isFirstPoll: isPollingFollows } =
    useGraffitiDiscover(
        () => (sessionRef.value ? [sessionRef.value.actor] : []),
        () => followSchema(sessionRef.value?.actor ?? ""),
    );
const followsByActor = computed(() => {
    const grouped = new Map<string, FollowObject[]>();
    for (const follow of followObjects.value as unknown as FollowObject[]) {
        const actorFollows = grouped.get(follow.value.object) ?? [];
        actorFollows.push(follow);
        grouped.set(follow.value.object, actorFollows);
    }
    return grouped;
});
function followsFor(actor: string) {
    return followsByActor.value.get(actor) ?? [];
}

const myJoins = computed(() =>
    validJoinObjects().filter(
        (join) => join.actor === sessionRef.value?.actor,
    ),
);

const isTogglingJoin = ref(false);
async function toggleJoin() {
    const session = sessionRef.value;
    if (!session || isTogglingJoin.value) return;

    isTogglingJoin.value = true;
    try {
        if (myJoins.value.length) {
            await Promise.all(
                myJoins.value.map((join) =>
                    graffiti.delete(join.url, session),
                ),
            );
        } else {
            await graffiti.post<ReturnType<typeof joinSchema>>(
                {
                    value: {
                        activity: "Add",
                        object: session.actor,
                        target: joinChannel,
                    },
                    channels: [joinChannel],
                },
                session,
            );
        }
    } finally {
        isTogglingJoin.value = false;
    }
}

</script>

<template>
    <section>
        <h1>Directory</h1>
        <div class="directory-membership">
            <p>Add yourself so other people can find and follow you.</p>
            <button
                type="button"
                @click="toggleJoin"
                :disabled="isPollingDirectory || isTogglingJoin"
            >
                <template v-if="isPollingDirectory">
                    Loading directory...
                </template>
                <template v-else-if="isTogglingJoin">
                    {{ myJoins.length ? "Leaving..." : "Joining..." }}
                </template>
                <template v-else>
                    {{
                        myJoins.length
                            ? "Remove me from the directory"
                            : "Add me to the directory"
                    }}
                </template>
            </button>
        </div>

        <p v-if="isPollingDirectory">Loading...</p>
        <p v-else-if="!joins.length">No one has joined the directory yet.</p>
        <ul v-else class="directory">
            <li v-for="join in joins" :key="join.actor">
                <Name :actor="join.actor" />
                <div
                    v-if="join.actor !== $graffitiSession.value?.actor"
                    class="modifiers"
                >
                    <Follow
                        :object="join.actor"
                        :follows="followsFor(join.actor)"
                        :loading="isPollingFollows"
                    />
                </div>
                <span v-else>you</span>
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

.directory-membership {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
}

p {
    font-size: 1rem;
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

li {
    width: 100%;
    padding: 1rem;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
}

.directory {
    width: 100%;
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
