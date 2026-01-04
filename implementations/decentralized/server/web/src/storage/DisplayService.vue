<template>
    <article>
        <h2>
            <span>
                {{ url }}
            </span>
            <CopyButton :text="url" />
        </h2>
        <p>
            <a
                :href="`/${service.type === 'inbox' ? 'i' : 's'}/${service.serviceId}/docs`"
                target="_blank"
            >
                Go to API Docs
            </a>
        </p>
        <nav v-if="service.serviceId !== 'public'">
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
            "Are you sure you want to delete this service? It CANNOT be undone.",
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
