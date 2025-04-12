<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { ref } from "vue";
import { removeMember } from "./setters";
import { addMember } from "./setters";
import { parallaxOrProvenance } from "./parallaxOrProvenance";

const props = defineProps<{
    channel: string;
    myMembers: Set<string>;
    session: GraffitiSession;
    admin: string;
}>();

const removing = ref(new Set<string>());
async function remove(member: string) {
    removing.value.add(member);
    await removeMember(member, props.myMembers, props.channel, props.session);
    removing.value.delete(member);
}

const newMember = ref("");
const adding = ref(false);
async function add(member?: string) {
    adding.value = true;
    await addMember(
        member ?? newMember.value,
        props.myMembers,
        props.channel,
        props.session,
    );
    adding.value = false;
    newMember.value = "";
}

const copied = ref(false);
async function copyUsername() {
    navigator.clipboard.writeText(props.session.actor);
    copied.value = true;
    await new Promise((resolve) => setTimeout(resolve, 500));
    copied.value = false;
}
</script>

<template>
    <p v-if="parallaxOrProvenance === 'Parallax'">
        Your messages will <em>only</em>
        be sent to the members you choose to list below, regardless of who other
        people add to their "views" of the chat.
    </p>

    <form @submit.prevent="add()" v-if="session.actor === admin">
        <input type="text" v-model="newMember" placeholder="Username" />
        <input type="submit" value="Add" :disabled="adding" />
    </form>

    <ul>
        <li>
            <span>
                <code>
                    {{ props.session.actor }}
                </code>
                (you)
            </span>
            <div class="container">
                <button @click="copyUsername" :disabled="copied">
                    {{ copied ? "Copied!" : "Copy Username" }}
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
                    {{ member }} {{ member === admin ? "(admin)" : "" }}
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
