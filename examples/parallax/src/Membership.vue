<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import type { MemberUpdateSchema } from "./schemas";
import { ref } from "vue";

const props = defineProps<{
    channel: string;
    myMembers: Set<string>;
    session: GraffitiSession;
}>();

const graffiti = useGraffiti();
const removing = ref(new Set<string>());
async function remove(member: string) {
    removing.value.add(member);
    await graffiti.put<MemberUpdateSchema>(
        {
            value: {
                activity: "Remove",
                target: member,
                object: props.channel,
                published: Date.now(),
            },
            channels: [props.channel],
        },
        props.session,
    );
    removing.value.delete(member);
}

const newMember = ref("");
const adding = ref(false);
async function add() {
    const target = newMember.value;
    if (!target.length) return;
    if (props.myMembers.has(target)) return;
    if (props.session.actor === target) return;
    adding.value = true;
    await graffiti.put<MemberUpdateSchema>(
        {
            value: {
                activity: "Add",
                target,
                object: props.channel,
                published: Date.now(),
            },
            channels: [props.channel],
        },
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
