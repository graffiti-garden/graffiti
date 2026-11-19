<script setup lang="ts">
import Renderer from "./PlaygroundRenderer.vue";
import {
    ref,
    watch,
    onErrorCaptured,
    onBeforeMount,
    onMounted,
    onUnmounted,
} from "vue";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import { VueMonacoEditor } from "@guolao/vue-monaco-editor";

const code = ref("");
const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbersMinChars: 3,
};
const monacoTheme = ref<"vs" | "vs-dark">("vs");

onBeforeMount(async () => {
    const response = await import("./demo/demo.html?raw");
    code.value = response.default.trim();
});

const errorMessage = ref<string | undefined>();
onErrorCaptured((e) => {
    errorMessage.value = "Render error: " + e.message;
    return false;
});
// Reset the error whenever the code changes
watch(code, () => (errorMessage.value = undefined));

const isMobile = ref(false);
const mq = window.matchMedia("(max-width: 800px)");
const colorSchemeMq = window.matchMedia("(prefers-color-scheme: dark)");
const syncNav = () => {
    isMobile.value = mq.matches;
};
const syncTheme = () => {
    monacoTheme.value = colorSchemeMq.matches ? "vs-dark" : "vs";
};
onMounted(() => {
    syncNav();
    syncTheme();
    mq.addEventListener("change", syncNav);
    colorSchemeMq.addEventListener("change", syncTheme);
});
onUnmounted(() => {
    mq.removeEventListener("change", syncNav);
    colorSchemeMq.removeEventListener("change", syncTheme);
});

const data = { processingWave: false };
</script>

<template>
    <Splitter v-if="!isMobile" class="demo-splitter">
        <SplitterPanel :size="40">
            <h3>Demo</h3>

            <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
            <Renderer v-else :code="code" :data="data" />
        </SplitterPanel>
        <SplitterPanel :size="60">
            <h3>Demo Code (Editable!)</h3>

            <VueMonacoEditor
                v-model:value="code"
                language="html"
                :theme="monacoTheme"
                class-name="demo-editor"
                :options="editorOptions"
            />
        </SplitterPanel>
    </Splitter>

    <Tabs v-else value="0" class="demo-tabs">
        <TabList>
            <Tab value="0"> Demo </Tab>
            <Tab value="1"> Edit Demo Code </Tab>
        </TabList>
        <TabPanels>
            <TabPanel value="0">
                <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
                <Renderer v-else :code="code" :data="data" />
            </TabPanel>
            <TabPanel value="1">
                <VueMonacoEditor
                    v-model:value="code"
                    language="html"
                    :theme="monacoTheme"
                    class-name="demo-editor"
                    :options="editorOptions"
                />
            </TabPanel>
        </TabPanels>
    </Tabs>

    <p>
        <em>
            (This demo uses the frontend framework
            <a href="https://vuejs.org/" target="_blank">Vue</a>. Graffiti
            plugins for other frameworks will be available in the future)
        </em>
    </p>
</template>

<style>
.demo-editor,
.demo-splitter .render {
    height: 20rem;
}

.demo-splitter .render {
    border-top-left-radius: 0.5rem;
    border-bottom-left-radius: 0.5rem;
}

.demo-splitter .demo-editor {
    overflow: hidden;
    border-top-right-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
}

.demo-splitter .p-splitter-gutter {
    background: var(--highlight);
}

.demo-splitter h3 {
    text-align: center;
}

.demo-splitter .p-splitterpanel {
    display: flex;
    flex-direction: column;
}

.demo-tabs {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.demo-tabs .p-tablist-tab-list {
    display: flex;
    gap: 0.5rem;
    border: none;
}

.demo-tabs .p-tab {
    padding: 0.5rem;
}

.demo-tabs .p-tab.p-tab-active {
    color: var(--highlight);
    border-bottom-color: var(--highlight);
}

.demo-tabs .p-tabpanels {
    background: var(--solid-background);
    border-radius: 0.5rem;
    overflow: clip;
}
</style>
