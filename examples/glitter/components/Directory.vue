<script setup lang="ts">
import { computed, ref } from "vue";
import {
    useGraffitiDiscover,
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import Follow from "./Follow.vue";
import Name from "./Name.vue";
import { joinSchema } from "./schemas";

const graffiti = useGraffiti();
const sessionRef = useGraffitiSession();

const joinChannel = "Namebook";

const { results: joinsUnfiltered, isPolling: isPollingJoins } =
    useGraffitiDiscover(
        [joinChannel],
        joinSchema(joinChannel),
        () => sessionRef.value,
    );

const joins = computed(() => {
    const results = joinsUnfiltered.value;
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
                    type: "Join",
                    object: joinChannel,
                    actor: session.actor,
                },
                channels: ["Namebook"],
            },
            session,
        );
    }
    isTogglingJoin.value = false;
}
</script>

<template>
    <div v-if="isPollingJoins || isTogglingJoin">loading...</div>
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
    </ul>
</template>
