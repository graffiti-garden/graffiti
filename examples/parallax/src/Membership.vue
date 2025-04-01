<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { ref } from "vue";
import { removeMember } from "./setters";
import { addMember } from "./setters";

const props = defineProps<{
    channel: string;
    myMembers: Set<string>;
    session: GraffitiSession;
}>();

const removing = ref(new Set<string>());
async function remove(member: string) {
    removing.value.add(member);
    await removeMember(member, props.myMembers, props.channel, props.session);
    removing.value.delete(member);
}

const newMember = ref("");
const adding = ref(false);
async function add() {
    adding.value = true;
    await addMember(
        newMember.value,
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
    <p>
        Your messages will <em>only</em>
        be sent to the members you choose to list below, regardless of who other
        people add to their "views" of the chat.
    </p>

    <p></p>

    <form @submit.prevent="add()">
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
            <button @click="copyUsername" :disabled="copied">
                {{ copied ? "Copied!" : "Copy Username" }}
            </button>
        </li>
        <li v-for="member in myMembers" :key="member">
            <code>
                {{ member }}
            </code>
            <button
                @click="remove(member)"
                :disabled="removing.has(member)"
                class="bad"
            >
                Remove
            </button>
        </li>
    </ul>
</template>

<style scoped>
form {
    display: flex;

    input[type="text"] {
        flex: 1;
    }
}

ul {
    list-style: none;

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
    }

    li:nth-child(odd) {
        background: var(--background2);
    }
}
</style>
