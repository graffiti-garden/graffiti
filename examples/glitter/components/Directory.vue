<script setup lang="ts">
import { computed, ref } from "vue";
import {
    useGraffitiDiscover,
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import Follow from "./Follow.vue";
import Name from "./Name.vue";
import { followSchema, joinSchema, type JoinObject } from "./schemas";

const graffiti = useGraffiti();
const sessionRef = useGraffitiSession();

const joinChannel = "Namebook";

const { objects: joinsUnfiltered, isInitialPolling: isPollingJoins } =
    useGraffitiDiscover(
        [joinChannel],
        joinSchema(joinChannel),
        () => sessionRef.value,
    );

const joins = computed(() => {
    const results: JoinObject[] = joinsUnfiltered.value;
    // Only show joins that
    return results.filter((v) =>
        v.value.actor ? v.actor === v.value.actor : true,
    );
});

const myJoins = computed(() =>
    joins.value.filter((join) => join.actor === sessionRef.value?.actor),
);

const isTogglingJoin = ref(false);
async function toggleJoin() {
    const session = sessionRef.value;
    if (!session) {
        alert("You are not logged in!");
        return;
    }
    isTogglingJoin.value = true;
    if (myJoins.value.length) {
        await Promise.all(
            myJoins.value.map((join) => graffiti.delete(join, session)),
        );
    } else {
        const schema = joinSchema(joinChannel);
        await graffiti.put<typeof schema>(
            {
                value: {
                    activity: "Add",
                    object: session.actor,
                    target: joinChannel,
                },
                channels: ["Namebook"],
            },
            session,
        );
    }
    isTogglingJoin.value = false;
}

const followTarget = ref("");
async function follow() {
    if (!followTarget.value) return;
    if (!sessionRef.value) return;
    if (following.value.some((f) => f.value.object === followTarget.value))
        return;
    await graffiti.put<ReturnType<typeof followSchema>>(
        {
            value: {
                activity: "Follow",
                object: followTarget.value,
            },
            channels: [sessionRef.value?.actor],
        },
        sessionRef.value,
    );
    followTarget.value = "";
}

const { objects: following } = useGraffitiDiscover(
    () => (sessionRef.value ? [sessionRef.value.actor] : []),
    () => followSchema(sessionRef.value?.actor ?? ""),
    sessionRef,
);

const copying = ref(false);
function copyActor() {
    if (!sessionRef.value) return;
    copying.value = true;
    navigator.clipboard.writeText(sessionRef.value.actor);
    setTimeout(() => {
        copying.value = false;
    }, 500);
}
</script>

<template>
    <section>
        <h1>
            ⚠️⚠️The Public Directory is Disabled While The Graffiti Paper is
            Under Review!!⚠️⚠️
        </h1>

        <p>
            In the mean time, you can manually follow someone. Your username is:
        </p>
        <div class="username">
            <code>{{ $graffitiSession.value?.actor }}</code>
            <button @click="copyActor">
                {{ !copying ? "Copy" : "Copied" }}
            </button>
        </div>

        <form @submit.prevent="follow">
            <input
                v-model="followTarget"
                type="text"
                placeholder="Enter a username"
            />
            <button type="submit">Follow</button>
        </form>

        <h2>Following</h2>
        <ul>
            <li v-for="follow in following">
                <Name :actor="follow.actor" />
                <div class="modifiers">
                    <button
                        @click="
                            $graffiti.delete(follow, $graffitiSession.value!)
                        "
                    >
                        unfollow
                    </button>
                </div>
            </li>
        </ul>
    </section>

    <!-- In the mean time,
        <button>
        Click here to copy your username
        </button>,
        and m -->

    <!-- <div v-if="isPollingJoins || isTogglingJoin">loading...</div>
    <ul class="directory">
        <li>
            <h1>
                <Name v-if="sessionRef" :actor="sessionRef.actor" />
            </h1>
            <div class="modifiers">
                <input
                    type="checkbox"
                    :checked="!myJoins.length"
                    id="directorycheck"
                    @change="toggleJoin"
                />
                <label for="directorycheck">
                    <template v-if="!myJoins.length">
                        add me to the directory!
                    </template>
                    <template v-else> remove me </template>
                </label>
            </div>
        </li>
    </ul>

    <h1>namebook entries:</h1>

    <ul>
        <li v-for="join in joins" :key="join.actor">
            <h1>
                <Name :actor="join.actor" />
            </h1>
            <div class="modifiers">
                <Follow :object="join.actor" />
            </div>
        </li>
    </ul> -->
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
    color: #d93025;
    background: #fff3cd;
    padding: 1rem;
    border: 2px solid #d93025;
    font-size: 1.5rem;
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
    padding: 0.5rem 0.5rem;
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
    flex-direction: row;
}

input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    font-size: 1rem;
}

h2 {
    font-size: 1.25rem;
    padding-bottom: 0.25rem;
}

li {
    width: 100%;
    padding: 1rem;
    display: flex;
    flex-direction: row;
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
