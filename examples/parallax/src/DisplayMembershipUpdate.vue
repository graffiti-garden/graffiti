<script setup lang="ts">
import type { GraffitiSession } from "@graffiti-garden/api";
import type { MemberUpdateObject } from "./schemas";
import { addMember, removeMember } from "./setters";
import GroupNames from "./GroupNames.vue";
import { ref } from "vue";
import { parallaxOrProvenance } from "./parallaxOrProvenance";

const props = defineProps<{
    group: MemberUpdateObject[];
    myMembers: Set<string>;
    channel: string;
    session: GraffitiSession;
    admin: string;
}>();

const activity = () => props.group[0].value.activity;
const isAdd = () => activity() === "Add";
const member = () => props.group[0].value.target;
const includesMe = () =>
    props.group.some((c) => c.actor === props.session.actor);
const targetsMe = () => member() === props.session.actor;
const actors = () => props.group.map((c) => c.actor);

const pending = ref(new Set<string>());
async function updateMember(activity: "Add" | "Remove", actor: string) {
    const key = `${activity}:${actor}`;
    pending.value.add(key);
    try {
        if (activity === "Add") {
            await addMember(
                actor,
                props.myMembers,
                props.channel,
                props.session,
            );
        } else {
            await removeMember(
                actor,
                props.myMembers,
                props.channel,
                props.session,
            );
        }
    } finally {
        pending.value.delete(key);
    }
}
</script>

<template>
    <aside>
        <p>
            <GroupNames :group="group" />
            {{ isAdd() ? "added" : "removed" }}
            <template v-if="member() === props.session.actor">you</template>
            <GraffitiActorToHandle v-else :actor="member()" />
            {{ isAdd() ? "to" : "from" }}
            <template v-if="parallaxOrProvenance==='Parallax'">
            {{ includesMe() ? "your" : "their" }}
            {{ group.length > 1 ? "views" : "view" }}
            of
            </template>
            the chat.
        </p>

        <template v-if="!targetsMe() && session.actor === admin">
            <button
                v-if="isAdd() && !myMembers.has(member())"
                @click="updateMember('Add', member())"
                :disabled="pending.has(`Add:${member()}`)"
            >
                <template v-if="pending.has(`Add:${member()}`)">
                    Adding...
                </template>
                <template v-else>
                    Add <GraffitiActorToHandle :actor="member()" />
                </template>
            </button>
            <button
                v-else-if="!isAdd() && myMembers.has(member())"
                @click="updateMember('Remove', member())"
                :disabled="pending.has(`Remove:${member()}`)"
            >
                <template v-if="pending.has(`Remove:${member()}`)">
                    Removing...
                </template>
                <template v-else>
                    Remove <GraffitiActorToHandle :actor="member()" />
                </template>
            </button>
        </template>
        <template v-else-if="session.actor=== admin">
            <button
                v-if="isAdd()"
                v-for="actor in actors().filter(
                    (actor) => !myMembers.has(actor),
                )"
                :key="`add-${actor}`"
                @click="updateMember('Add', actor)"
                :disabled="pending.has(`Add:${actor}`)"
            >
                <template v-if="pending.has(`Add:${actor}`)">
                    Adding...
                </template>
                <template v-else>
                    Add <GraffitiActorToHandle :actor="actor" />
                </template>
            </button>
            <button
                v-else
                v-for="actor in actors().filter((actor) =>
                    myMembers.has(actor),
                )"
                :key="`remove-${actor}`"
                @click="updateMember('Remove', actor)"
                :disabled="pending.has(`Remove:${actor}`)"
            >
                <template v-if="pending.has(`Remove:${actor}`)">
                    Removing...
                </template>
                <template v-else>
                    Remove <GraffitiActorToHandle :actor="actor" />
                </template>
            </button>
        </template>
    </aside>
</template>
