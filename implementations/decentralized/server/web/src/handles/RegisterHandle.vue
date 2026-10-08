<template>
    <header>
        <h3>Choose your handle</h3>
        <aside>Handles can always be changed later.</aside>
    </header>
    <form @submit.prevent="registerHandle">
        <label>
            <div class="handle-control" :data-status="availabilityStatus">
                <span class="prefix">@</span>

                <input
                    v-model="localName"
                    :style="{ width: Math.max(inputHandleWidth, 1) + 'px' }"
                    required
                    v-focus
                    :disabled="registering || registered"
                    autocapitalize="none"
                    autocomplete="off"
                    spellcheck="false"
                    inputmode="text"
                    aria-describedby="handle-status"
                />
                <span class="mirror" ref="mirrorHandleEl" aria-hidden="true">{{
                    localName
                }}</span>

                <span class="suffix" aria-hidden="true">.{{ baseHost }}</span>

                <StatusIcon
                    class="status"
                    :status="
                        availabilityStatus === 'available'
                            ? 'ok'
                            : availabilityStatus === 'unavailable' ||
                                availabilityStatus === 'error'
                              ? 'error'
                              : availabilityStatus === 'checking'
                                ? 'loading'
                                : null
                    "
                />
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
            <button
                v-if="onCancel"
                type="button"
                class="secondary"
                @click="onCancel"
                :class="{ hidden: registered }"
                :disabled="registering || registered"
            >
                Cancel
            </button>
            <button
                :disabled="
                    registering ||
                    availabilityStatus !== 'available' ||
                    registered
                "
                type="submit"
            >
                {{ submitLabel }}
                <StatusIcon v-if="registering" status="loading" />
            </button>
        </div>
    </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { fetchFromSelf } from "../globals";
import StatusIcon from "../utils/StatusIcon.vue";

const props = defineProps<{
    onRegister: (localName: string) => void | Promise<boolean>;
    onCancel?: () => void;
    replace?: boolean;
}>();

const registered = ref(false);
const registering = ref(false);
const submitLabel = computed(() => {
    if (registering.value)
        return props.replace ? "Replacing handle..." : "Creating Account...";
    if (registered.value) return props.replace ? "Replaced" : "Created";
    return props.replace ? "Replace handle" : "Continue";
});

const baseHost = window.location.host;

const localName = ref("");

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
    localName,
    (newLocalName) => {
        const normalizedName = newLocalName.toLowerCase();
        if (normalizedName !== newLocalName) {
            localName.value = normalizedName;
            return;
        }
        const mySeq = ++requestSeq;
        if (debounceTimer) clearTimeout(debounceTimer);

        if (!newLocalName) {
            availabilityStatus.value = "idle";
        } else if (newLocalName.length > 64) {
            errorStatus.value = "Handle is too long";
            availabilityStatus.value = "error";
        } else if (!newLocalName.match(/^[a-z0-9_-]+$/)) {
            errorStatus.value =
                "Handle can only contain lowercase letters, numbers, underscores, and hyphens";
            availabilityStatus.value = "error";
        } else {
            availabilityStatus.value = "checking";
            debounceTimer = setTimeout(() => {
                if (mySeq !== requestSeq) return;
                checkHandleAvailability(newLocalName, mySeq);
            }, 500);
        }
    },
    { flush: "post" },
);

async function checkHandleAvailability(localName: string, mySeq: number) {
    try {
        const { available } = await fetchFromSelf(
            `/app/handles/available/${localName}`,
        );
        if (mySeq !== requestSeq) return;
        availabilityStatus.value = available ? "available" : "unavailable";
    } catch (error) {
        availabilityStatus.value = "error";
        errorStatus.value = String(error);
    }
}

async function registerHandle() {
    registering.value = true;
    const name = localName.value;
    try {
        if ((await props.onRegister(name)) === false) return;
        registered.value = true;
    } catch (error) {
        alert(error);
    } finally {
        registering.value = false;
    }
}

const mirrorHandleEl = ref<HTMLElement | null>(null);
const inputHandleWidth = ref(0);
watch(localName, () => {
    nextTick(() => {
        inputHandleWidth.value = (mirrorHandleEl.value?.offsetWidth ?? 0) + 2;
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
        min-width: 0;
        text-align: right;
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
    margin-right: 0.2rem;
}

.suffix {
    flex: 1 1 auto;
}
.status {
    margin-left: 0.3rem;
}

/* Border feedback */
.handle-control[data-status="available"] {
    border-color: var(--pico-form-element-valid-border-color);
}
.handle-control[data-status="unavailable"],
.handle-control[data-status="error"] {
    border-color: var(--pico-form-element-invalid-border-color);
}

.controls {
    display: flex;
    justify-content: space-between;
}

.controls button:last-child {
    margin-left: auto;
}

.hidden {
    opacity: 0;
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
</style>
