<template>
    <header>
        <h2>Choose your handle</h2>
        <aside>Handles can always be changed later.</aside>
    </header>
    <form @submit.prevent="registerHandle">
        <label>
            <div class="handle-control" :data-status="availabilityStatus">
                <span class="prefix">@</span>

                <input
                    v-model="handleName"
                    :style="{ width: Math.max(inputHandleWidth, 1) + 'px' }"
                    required
                    v-focus
                    :disabled="registering"
                    autocapitalize="none"
                    autocomplete="off"
                    spellcheck="false"
                    inputmode="text"
                    aria-describedby="handle-status"
                />
                <span class="mirror" ref="mirrorHandleEl" aria-hidden="true">{{
                    handleName
                }}</span>

                <span class="suffix" aria-hidden="true">.{{ baseHost }}</span>

                <span class="status" aria-hidden="true"></span>
            </div>

            <output id="handle-status" role="status" aria-live="polite">
                <span v-if="availabilityStatus === 'checking'">
                    Checking availability…
                </span>
                <span v-else-if="availabilityStatus === 'available'">
                    Handle Available
                </span>
                <span v-else-if="availabilityStatus === 'unavailable'">
                    Handle Not Available
                </span>
                <span v-else-if="availabilityStatus === 'error'">
                    {{ errorStatus }}
                </span>
            </output>
        </label>

        <div class="controls">
            <button type="button" class="secondary" @click="$router.back()">
                Cancel
            </button>
            <button
                :disabled="registering || availabilityStatus !== 'available'"
                type="submit"
            >
                {{ registering ? "Registering..." : "Register" }}
            </button>
        </div>
    </form>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { fetchFromSelf } from "../globals";
import {
    OptionalAlsoKnownAsSchema,
    OptionalServicesSchema,
} from "../../../shared/did-schemas";
import { z } from "zod";

const props = defineProps<{
    alsoKnownAs: z.infer<typeof OptionalAlsoKnownAsSchema>;
    services: z.infer<typeof OptionalServicesSchema>;
}>();

const baseHost = window.location.host;

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
        const { available } = await fetchFromSelf(
            `/app/handles/available/${handleName}`,
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
        await fetchFromSelf("/app/handles/register", {
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

const mirrorHandleEl = ref<HTMLElement | null>(null);
const inputHandleWidth = ref(0);
watch(handleName, () => {
    nextTick(() => {
        inputHandleWidth.value = mirrorHandleEl.value?.offsetWidth ?? 0;
    });
});
</script>

<style scoped>
.mirror {
    position: absolute;
    visibility: hidden;
    white-space: pre;
    font: inherit;
    padding: 0;
    margin: 0;
    border: 0;
}

.handle-control {
    display: flex;
    align-items: center;
    margin-top: 0.5rem;

    border: var(--pico-border-width, 1px) solid
        var(--pico-form-element-border-color);
    border-radius: var(--pico-border-radius);
    background: var(--pico-form-element-background-color);
    padding: 0rem 0.5rem;

    input {
        border: 0;
        margin: 0;
        padding: 0;
        background: transparent;
        outline: none;
    }

    input:focus {
        outline: none;
        box-shadow: none;
    }
}

.handle-control:focus-within {
    border-color: var(--pico-form-element-active-border-color);
}

.prefix,
.suffix {
    opacity: 0.7;
    white-space: nowrap;
    user-select: none;
}

.prefix {
    margin-right: 0.5rem;
}

.suffix {
    flex: 1 1 auto;
}

/* Border feedback */
.handle-control[data-status="available"] {
    border-color: var(--pico-form-element-valid-border-color);
}
.handle-control[data-status="unavailable"],
.handle-control[data-status="error"] {
    border-color: var(--pico-form-element-invalid-border-color);
}

/* Status icon slot */
.status {
    width: 1.25rem;
    height: 1.25rem;
    place-items: center;
    flex: 0 0 auto;
}
.status::before {
    content: "";
    width: 1.25rem;
    height: 1.25rem;
    display: block;
}

/* Icons (purely presentational) */
.handle-control[data-status="available"] .status::before {
    background: var(--pico-icon-valid) no-repeat center/contain;
}
.handle-control[data-status="error"] .status::before,
.handle-control[data-status="unavailable"] .status::before {
    background: var(--pico-icon-invalid) no-repeat center/contain;
}

/* “Checking” spinner */
@media (prefers-reduced-motion: no-preference) {
    .handle-control[data-status="checking"] .status {
        border-radius: 999px;
        border: 2px solid
            color-mix(in srgb, var(--pico-muted-color) 35%, transparent);
        border-top-color: var(--pico-muted-color);
        animation: spin 0.9s linear infinite;
    }
}
@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.controls {
    display: flex;
    justify-content: space-between;
}

output {
    display: block;
    text-align: center;
    min-height: 1.5rem;
    font-size: 0.9em;
    color: var(--pico-muted-color);
}

/* Make error text read as error, but keep it subtle */
.handle-control[data-status="error"] + output,
.handle-control[data-status="unavailable"] + output {
    color: var(--pico-del-color);
}

button[type="submit"] {
    width: auto;
}

aside {
    color: var(--pico-muted-color);
    font-style: italic;
}
</style>
