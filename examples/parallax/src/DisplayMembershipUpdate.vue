<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import type { MemberUpdateObject } from "./schemas";
import { addMember, removeMember } from "./setters";
import GroupNames from "./GroupNames.vue";
import { ref } from "vue";

const props = defineProps<{
    group: MemberUpdateObject[];
    myMembers: Set<string>;
    channel: string;
    session: GraffitiSession;
}>();

const activity = () => props.group[0].value.activity;
const isAdd = () => activity() === "Add";
const member = () => props.group[0].value.target;
const includesMe = () =>
    props.group.some((c) => c.actor === props.session.actor);
const targetsMe = () => member() === props.session.actor;
const actors = () => props.group.map((c) => c.actor);

const count = ref(0);
const countSquared = () => count.value * count.value;
</script>

<template>
    <aside>
        <p>
            <GroupNames :group="group" />
            {{ isAdd() ? "added" : "removed" }}
            {{ member() === props.session.actor ? "you" : member() }}
            {{ isAdd() ? "to" : "from" }}
            {{ includesMe() ? "your" : "their" }}
            {{ group.length > 1 ? "views" : "view" }}
            of the chat.
        </p>

        <template v-if="!targetsMe()">
            <button
                v-if="isAdd() && !myMembers.has(member())"
                @click="addMember(member(), myMembers, channel, session)"
            >
                Add {{ member() }}
            </button>
            <button
                v-else-if="!isAdd() && myMembers.has(member())"
                @click="removeMember(member(), myMembers, channel, session)"
            >
                Remove {{ member() }}
            </button>
        </template>
        <template v-else>
            <button
                v-if="isAdd()"
                v-for="actor in actors().filter(
                    (actor) => !myMembers.has(actor),
                )"
                :key="`add-${actor}`"
                @click="addMember(actor, myMembers, channel, session)"
            >
                Add {{ actor }}
            </button>
            <button
                v-else
                v-for="actor in actors().filter((actor) =>
                    myMembers.has(actor),
                )"
                :key="`remove-${actor}`"
                @click="removeMember(actor, myMembers, channel, session)"
            >
                Remove {{ actor }}
            </button>
        </template>
    </aside>
</template>
