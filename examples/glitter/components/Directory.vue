<script setup lang="ts">
import { computed, ref } from "vue";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/client-vue";
import { useJoins, putJoin } from "../activities/joins";
import Follow from "./Follow.vue";
import Name from "./Name.vue";

const graffiti = useGraffiti();
const session = useGraffitiSession();

const { results: joins, isPolling: isPollingJoins } = useJoins("Namebook");

const myJoins = computed(() =>
    joins.value.filter((join) => join.webId === session.webId),
);

const isTogglingJoin = ref(false);
async function toggleJoin() {
    isTogglingJoin.value = true;
    if (myJoins.value.length) {
        const deletes = myJoins.value.map((join) => graffiti.delete(join));
        await Promise.allSettled(deletes);
    } else {
        await putJoin("Namebook");
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
                    <Name :webId="session.webId" />
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
