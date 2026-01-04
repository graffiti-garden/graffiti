<template>
    <header>
        <h2>{{ type === "inbox" ? "Inboxes" : "Storage Buckets" }}</h2>
        <nav>
            <ul>
                <li>
                    <form @submit.prevent="createService">
                        <button :disabled="creating">
                            {{
                                creating
                                    ? "Creating..."
                                    : `Create New ${type === "inbox" ? "Inbox" : "Storage Bucket"}`
                            }}
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
        <em
            >You have no
            {{ type === "inbox" ? "inboxes" : "storage buckets" }}.</em
        >
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
    type: "bucket" | "inbox";
}>();

function fetchServices() {
    services.value = undefined;
    fetchFromSelf(`/app/service-instances/${props.type}/list`)
        .then((value: Array<Service>) => {
            services.value = value
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((s) => ({ ...s, type: props.type }));
            if (props.type === "inbox") {
                services.value = [
                    ...services.value,
                    {
                        createdAt: 0,
                        serviceId: "public",
                        type: "inbox",
                    },
                ];
            }
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

const creating = ref(false);
function createService() {
    creating.value = true;
    fetchFromSelf(`/app/service-instances/${props.type}/create`, {
        method: "POST",
    })
        .then(({ serviceId, createdAt }) => {
            services.value = [
                { serviceId, createdAt, type: props.type },
                ...(services.value ?? []),
            ];
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            creating.value = false;
        });
}
</script>
