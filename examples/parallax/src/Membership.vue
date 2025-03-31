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
    await new Promise((resolve) => setTimeout(resolve, 1000));
    copied.value = false;
}
</script>

<template>
    <p>
        Your username is <code>{{ props.session.actor }}</code>
        <button @click="copyUsername" :disabled="copied">
            {{ copied ? "Copied!" : "Copy" }}
        </button>
    </p>

    <p>
        Your messages will <emph>only</emph>
        be sent to the members you choose to list below, regardless of who
        others choose to add to their "views" of the chat.
    </p>

    <form @submit.prevent="add()">
        <input v-model="newMember" placeholder="Username" />
        <input type="submit" value="Add" :disabled="adding" />
    </form>

    <ul>
        <li v-for="member in myMembers" :key="member">
            <code>
                {{ member }}
            </code>
            <button @click="remove(member)" :disabled="removing.has(member)">
                Remove
            </button>
        </li>
    </ul>
</template>
