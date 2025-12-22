<template>
    <form @submit.prevent="registerHandle">
        <input
            v-model="handle"
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
                Error checking availability
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
import { WatchDirectoryFlags } from "typescript";

const router = useRouter();
const handle = ref("");

// and disable the register button if checking/unavailable
type AvailabilityStatus =
    | "idle"
    | "checking"
    | "available"
    | "unavailable"
    | "error";
const availabilityStatus = ref<AvailabilityStatus>("idle");
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let requestSeq = 0;
watch(
    handle,
    (newHandleRaw) => {
        const newHandle = newHandleRaw.trim();
        if (!newHandle) {
            availabilityStatus.value = "idle";
            if (debounceTimer) clearTimeout(debounceTimer);
            return;
        }

        // show immediate feedback + debounce request
        availabilityStatus.value = "checking";
        if (debounceTimer) clearTimeout(debounceTimer);

        const mySeq = ++requestSeq;
        debounceTimer = setTimeout(() => {
            // ignore if a newer change happened while we waited
            if (mySeq !== requestSeq) return;
            checkHandleAvailability(mySeq);
        }, 500);
    },
    { flush: "post" },
);

async function checkHandleAvailability(mySeq: number) {
    try {
        const { available } = await fetchFromAPI(
            `/handles/available/${handle.value}`,
        );
        if (mySeq !== requestSeq) return;
        availabilityStatus.value = available ? "available" : "unavailable";
    } catch (error) {
        availabilityStatus.value = "error";
        alert(error);
    }
}

const registering = ref(false);
async function registerHandle() {
    registering.value = true;
    const handleValue = handle.value.trim();
    try {
        await fetchFromAPI("/handles/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                handle: handleValue,
                data: {},
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
