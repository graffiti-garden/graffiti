<template>
    <header>
        <h2>Service Instances</h2>
        <nav>
            <ul>
                <li>
                    <button v-if="!createOpen" @click="createOpen = true">
                        Create New Service Instance
                    </button>
                    <form v-else @submit.prevent="createService">
                        <label for="new-service-name"
                            >Choose a name for your new service instance:</label
                        >
                        <input
                            v-focus
                            type="text"
                            id="new-service-name"
                            v-model="newServiceName"
                            placeholder="My Service Instance"
                            required
                            :disabled="creating"
                        />
                        <button type="submit" :disabled="creating">
                            {{ creating ? "Creating..." : "Create" }}
                        </button>
                    </form>
                </li>
            </ul>
        </nav>
    </header>

    <p v-if="services === undefined">
        <em>Loading...</em>
    </p>
    <template v-else-if="services === null">
        <p><em>Error loading services!</em></p>
        <button @click="fetchServices">Retry</button>
    </template>
    <p v-else-if="services.length === 0">
        <em>You have no service instances.</em>
    </p>
    <ul v-else>
        <li v-for="service in services" :key="service.serviceId">
            <DisplayService
                :service="service"
                :onDelete="() => services?.splice(services.indexOf(service), 1)"
            />
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { fetchFromSelf } from "../globals";
import type { Service } from "./types";
import DisplayService from "./DisplayService.vue";

const services = ref<Array<Service> | null | undefined>(undefined);

const props = defineProps<{
    type: "bucket" | "indexer";
}>();

function fetchServices() {
    services.value = undefined;
    fetchFromSelf(`/app/service-instances/list/${props.type}`)
        .then((value: Array<Service>) => {
            services.value = value.sort((a, b) => b.createdAt - a.createdAt);
        })
        .catch((error) => {
            console.error(error);
            services.value = null;
        });
}
fetchServices();

watch(
    () => props.type,
    () => {
        fetchServices();
    },
);

const createOpen = ref(false);
const newServiceName = ref("");
const creating = ref(false);
function createService() {
    const name = newServiceName.value;
    if (!name) return;
    creating.value = true;
    fetchFromSelf("/app/service-instances/create", {
        method: "POST",
        body: JSON.stringify({ name, type: props.type }),
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then(({ serviceId, createdAt }) => {
            services.value = [
                { serviceId, name, createdAt },
                ...(services.value ?? []),
            ];
            newServiceName.value = "";
            createOpen.value = false;
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            creating.value = false;
        });
}
</script>
