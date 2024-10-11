<script setup lang="ts">
import { computed, ref } from "vue";
import {
    useDiscover,
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/client-vue";
import Follow from "./Follow.vue";
import Name from "./Name.vue";
import { joinSchema } from "./schemas";

const sessionRef = useGraffitiSession();

const joinChannel = "Namebook";

const { results: joinsUnfiltered, isPolling: isPollingJoins } = useDiscover(
    [joinChannel],
    joinSchema(joinChannel),
    () => sessionRef.value,
);

const joins = computed(() => {
    const results = joinsUnfiltered.value;
    return results.filter((v) =>
        v.value.actor ? v.webId === v.value.actor : true,
    );
});

const myJoins = computed(() =>
    joins.value.filter((join) => join.webId === sessionRef.value?.webId),
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
            myJoins.value.map((join) => useGraffiti().delete(join, session)),
        );
    } else {
        await useGraffiti().put<typeof joinSchema>(
            {
                value: {
                    type: "Join",
                    object: joinChannel,
                    actor: session.webId,
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
    <template v-if="isPollingJoins || isTogglingJoin">
        <div>loading...</div>
    </template>
    <template v-else>
        <ul class="directory">
            <li>
                <h1>
                    <Name v-if="sessionRef" :webId="sessionRef.webId" />
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
            <li v-for="join in joins" :key="join.webId">
                <h1>
                    <Name :webId="join.webId" />
                </h1>
                <div class="modifiers">
                    <Follow :object="join.webId" />
                </div>
            </li>
        </ul>
    </template>
</template>
