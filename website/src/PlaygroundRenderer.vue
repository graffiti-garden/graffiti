<script setup lang="ts">
import { computed, h, compile, watch, onErrorCaptured, ref } from "vue";

const props = withDefaults(
    defineProps<{
        code: string;
        data?: {};
    }>(),
    {
        data: () => ({}),
    },
);

const errorMessage = ref<string | undefined>();

// Reset the error message when the code changes
watch(
    () => props.code,
    () => (errorMessage.value = undefined),
);

onErrorCaptured((error) => {
    errorMessage.value = "Internal error: " + error.message;
    return false;
});

const errorCache = new Map<string, string>();

const hyperscript = computed(() => {
    const code = props.code;
    errorCache.delete(code);

    const renderBare = compile(code, {
        onError(error) {
            errorCache.set(code, error.message);
        },
    });

    if (errorCache.has(code)) {
        return h("p", {
            class: "error",
            innerHTML: "Compile Error: " + errorCache.get(code),
        });
    }

    if (typeof renderBare !== "function") {
        return h("p", {
            class: "error",
            innerHTML:
                'Compile Error: Runtime template compilation is unavailable. Configure Vite to alias "vue" to "vue/dist/vue.esm-bundler.js".',
        });
    }

    const render = new Proxy(renderBare, {
        apply(target, thisArg, args: Parameters<typeof renderBare>) {
            let result: ReturnType<typeof renderBare>;
            try {
                result = target.apply(thisArg, args);
            } catch (e) {
                return h("p", {
                    class: "error",
                    innerHTML:
                        "Render function error: " +
                        (e instanceof Error ? e.message : JSON.stringify(e)),
                });
            }
            return result;
        },
    });

    try {
        const out = h({
            render,
            data: () => props.data,
            errorCaptured(e) {
                errorMessage.value =
                    "Runtime Error: " +
                    (e instanceof Error ? e.message : JSON.stringify(e));
                return false;
            },
        });
        return out;
    } catch (e) {
        return h("p", {
            class: "error",
            innerHTML:
                "Setup error: " +
                (e instanceof Error ? e.message : JSON.stringify(e)),
        });
    }
});
</script>

<template>
    <div class="render">
        <p class="error" v-if="errorMessage">{{ errorMessage }}</p>
        <hyperscript v-else />
    </div>
</template>

<style scoped>
.error {
    color: red;
}

.render {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--solid-background);
}
</style>
