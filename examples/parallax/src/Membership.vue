<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { ref } from "vue";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import { addMember, removeMember } from "./setters";
import { parallaxOrProvenance } from "./parallaxOrProvenance";

const props = defineProps<{
    channel: string;
    myMembers: Set<string>;
    session: GraffitiSession;
    admin: string;
}>();

const graffiti = useGraffiti();
const removing = ref(new Set<string>());
async function remove(member: string) {
    removing.value.add(member);
    try {
        await removeMember(
            member,
            props.myMembers,
            props.channel,
            props.session,
        );
    } finally {
        removing.value.delete(member);
    }
}

const newMember = ref("");
const adding = ref(false);
const addError = ref("");
async function add(member = newMember.value) {
    const account = member.trim();
    if (!account) return;

    adding.value = true;
    addError.value = "";
    try {
        const actor = account.startsWith("did:")
            ? account
            : await graffiti.handleToActor(account);
        await addMember(
            actor,
            props.myMembers,
            props.channel,
            props.session,
        );
        newMember.value = "";
    } catch (error) {
        console.error(error);
        addError.value = "That account could not be found.";
    } finally {
        adding.value = false;
    }
}

const copied = ref(false);
async function copyHandle() {
    try {
        const handle = await graffiti.actorToHandle(props.session.actor);
        await navigator.clipboard.writeText(handle);
        copied.value = true;
        await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
        copied.value = false;
    }
}
</script>

<template>
    <p v-if="parallaxOrProvenance === 'Parallax'">
        Your messages will <em>only</em>
        be sent to the members you choose to list below, regardless of who other
        people add to their "views" of the chat.
    </p>

    <form @submit.prevent="add()" v-if="session.actor === admin">
        <input type="text" v-model="newMember" placeholder="Handle" />
        <input type="submit" value="Add" :disabled="adding" />
    </form>
    <p v-if="addError" role="alert">{{ addError }}</p>

    <ul>
        <li>
            <span>
                <code>
                    <GraffitiActorToHandle :actor="props.session.actor" />
                </code>
                (you)
            </span>
            <div class="container">
                <button @click="copyHandle" :disabled="copied">
                    {{ copied ? "Copied!" : "Copy Handle" }}
                </button>
                <button
                    v-if="
                        myMembers.has(session.actor) && session.actor === admin
                    "
                    @click="remove(session.actor)"
                    :disabled="removing.has(session.actor)"
                    class="bad"
                >
                    Leave
                </button>
                <button
                    v-else-if="session.actor === admin"
                    @click="add(session.actor)"
                    :disabled="adding"
                    class="good"
                >
                    Join
                </button>
            </div>
        </li>
        <template v-for="member in myMembers" :key="member">
            <li v-if="member !== session.actor">
                <code>
                    <GraffitiActorToHandle :actor="member" />
                    {{ member === admin ? "(admin)" : "" }}
                </code>
                <button
                    v-if="session.actor === admin"
                    @click="remove(member)"
                    :disabled="removing.has(member)"
                    class="bad"
                >
                    Remove
                </button>
            </li>
        </template>
    </ul>
</template>

<style scoped>
form {
    display: flex;

    input[type="text"] {
        flex: 1;
    }
}

.container {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
}

ul {
    list-style: none;
    width: 30rem;

    li {
        padding: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: space-between;

        .bad {
            background: var(--bad-color);
        }

        .bad:hover {
            background: var(--very-bad-color);
        }

        .good {
            background: var(--highlight);
        }

        .good:hover {
            background: var(--highlight-hover);
        }
    }

    li:nth-child(odd) {
        background: var(--background2);
    }
}
</style>
