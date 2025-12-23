<template>
    <form @submit.prevent="registerHandle">
        <input
            v-model="handleName"
            placeholder="my-handle"
            required
            v-focus
            :disabled="registering"
        />
        <output v-if="availabilityStatus !== 'idle'">
            <span v-if="availabilityStatus === 'checking'">
                Checking availability...
            </span>
            <span v-else-if="availabilityStatus === 'available'">
                Available
            </span>
            <span v-else-if="availabilityStatus === 'unavailable'">
                Unavailable
            </span>
            <span v-else-if="availabilityStatus === 'error'">
                {{ errorStatus }}
            </span>
        </output>
        <button :disabled="registering || availabilityStatus !== 'available'">
            {{ registering ? "Registering..." : "Register" }}
        </button>
    </form>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { fetchFromAPI } from "../globals";
import {
    OptionalAlsoKnownAsSchema,
    OptionalServicesSchema,
} from "../../../shared/did-schemas";
import { z } from "zod";

const props = withDefaults(
    defineProps<{
        alsoKnownAs: z.infer<typeof OptionalAlsoKnownAsSchema>;
        services: z.infer<typeof OptionalServicesSchema>;
    }>(),
    {
        services: undefined,
        alsoKnownAs: () => ["did:plc:12354"],
    },
);

const router = useRouter();
const handleName = ref("");

// and disable the register button if checking/unavailable
type AvailabilityStatus =
    | "idle"
    | "checking"
    | "available"
    | "unavailable"
    | "error";
const availabilityStatus = ref<AvailabilityStatus>("idle");
const errorStatus = ref<string | null>(null);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let requestSeq = 0;

watch(
    handleName,
    (newHandleName) => {
        const mySeq = ++requestSeq;
        if (debounceTimer) clearTimeout(debounceTimer);

        if (!newHandleName) {
            availabilityStatus.value = "idle";
        } else if (newHandleName.length > 64) {
            errorStatus.value = "Handle is too long";
            availabilityStatus.value = "error";
        } else if (!newHandleName.match(/^[a-zA-Z0-9_-]+$/)) {
            errorStatus.value =
                "Handle can only contain letters, numbers, underscores, and hyphens";
            availabilityStatus.value = "error";
        } else {
            availabilityStatus.value = "checking";
            debounceTimer = setTimeout(() => {
                if (mySeq !== requestSeq) return;
                checkHandleAvailability(newHandleName, mySeq);
            }, 500);
        }
    },
    { flush: "post" },
);

async function checkHandleAvailability(handleName: string, mySeq: number) {
    try {
        const { available } = await fetchFromAPI(
            `/handles/available/${handleName}`,
        );
        if (mySeq !== requestSeq) return;
        availabilityStatus.value = available ? "available" : "unavailable";
    } catch (error) {
        availabilityStatus.value = "error";
        errorStatus.value = String(error);
    }
}

const registering = ref(false);
async function registerHandle() {
    registering.value = true;
    try {
        await fetchFromAPI("/handles/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: handleName.value,
                services: props.services,
                alsoKnownAs: props.alsoKnownAs,
            }),
        });
        router.push("/handles");
    } catch (error) {
        alert(error);
    } finally {
        registering.value = false;
    }
}
</script>
