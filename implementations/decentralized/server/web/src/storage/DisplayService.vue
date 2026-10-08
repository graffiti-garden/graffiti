<template>
    <article>
        <h2 v-if="service.type === 'inbox'">
            {{
                service.serviceId === "shared"
                    ? "Shared inbox"
                    : "Personal inbox"
            }}
        </h2>
        <h2>
            <span>
                {{ url }}
            </span>
            <CopyButton :text="url" />
        </h2>
        <p v-if="service.serviceId === 'shared'">Available to everyone.</p>
        <p>
            <a
                :href="`/${service.type === 'inbox' ? 'i' : 's'}/${service.serviceId}/docs`"
                target="_blank"
            >
                Go to API Docs
            </a>
        </p>
        <nav v-if="service.serviceId !== 'shared'">
            <ul>
                <li>
                    <button @click="deleteService" :disabled="deleting">
                        {{ deleting ? "Deleting..." : "Delete" }}
                    </button>
                </li>
            </ul>
        </nav>
    </article>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { fetchFromSelf } from "../globals";
import type { Service } from "./types";
import CopyButton from "../utils/CopyButton.vue";
import { serviceIdToUrl } from "../../../shared/service-urls";

const props = defineProps<{
    service: Service;
    onDelete: () => void;
}>();
const service = props.service;

const baseHost = window.location.host;
const url = computed(() =>
    serviceIdToUrl(props.service.serviceId, props.service.type, baseHost),
);

const deleting = ref(false);
function deleteService() {
    deleting.value = true;

    if (
        !confirm(
            `Delete this service? This cannot be undone. If your actor's DID points to ${url.value}, update the DID separately; deleting the service will not change it.`,
        )
    ) {
        deleting.value = false;
        return;
    }

    fetchFromSelf(
        `/app/service-instances/${service.type}/service/${service.serviceId}`,
        {
            method: "DELETE",
        },
    )
        .then(() => {
            props.onDelete();
        })
        .catch((error) => {
            alert(error.message);
        })
        .finally(() => {
            deleting.value = false;
        });
}
</script>
