<script setup lang="ts">
import { ref } from "vue";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/wrapper-vue";
import {
    deleteFollows,
    postFollow,
    type FollowObject,
} from "./follows";

const graffiti = useGraffiti();
const sessionRef = useGraffitiSession();

const props = withDefaults(
    defineProps<{
        object: string;
        follows: FollowObject[];
        loading?: boolean;
    }>(),
    {
        loading: false,
    },
);

const isToggling = ref(false);
async function toggleFollow() {
    const session = sessionRef.value;
    if (!session) {
        alert("You are not logged in!");
        return;
    }
    isToggling.value = true;
    try {
        if (props.follows.length) {
            await deleteFollows(graffiti, props.follows, session);
        } else if (props.object) {
            await postFollow(graffiti, props.object, session);
        }
    } finally {
        isToggling.value = false;
    }
}
</script>

<template>
    <button
        type="button"
        @click="toggleFollow"
        :disabled="loading || isToggling"
    >
        <template v-if="loading">loading...</template>
        <template v-else-if="isToggling">
            {{ follows.length ? "unfollowing..." : "following..." }}
        </template>
        <template v-else>{{ follows.length ? "unfollow" : "follow" }}</template>
    </button>
</template>
