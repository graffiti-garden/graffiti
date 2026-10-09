<template>
    <h2 class="page-title">A Graffiti Provider</h2>
    <p>
        {{ baseHost }} provides everything you need to create a
        <a href="https://graffiti.garden" target="_blank">Graffiti</a>
        identity and participate in the Graffiti ecosystem.
    </p>

    <p>
        Your Graffiti identity consists of a <a href="#handle">Handle</a>,
        <a href="#actor">Actor</a>, <a href="#bucket">Bucket</a>, and
        <a href="#inboxes">Inboxes</a>. Below, you can inspect and modify each
        service. You may also migrate any of these services to another provider
        at any time.
    </p>

    <aside>
        The open source code for this project is
        <a
            target="_blank"
            href="https://github.com/graffiti-garden/graffiti/tree/main/implementations/decentralized/server"
        >
            available on GitHub
        </a>.
    </aside>

    <section id="handle"><Handles @loaded="sectionLoaded('handle')" /></section>
    <section id="actor"><Actors @loaded="sectionLoaded('actor')" /></section>
    <section id="bucket"><Storage type="bucket" @loaded="sectionLoaded('bucket')" /></section>
    <section id="inboxes"><Storage type="inbox" @loaded="sectionLoaded('inboxes')" /></section>
</template>

<script setup lang="ts">
import { nextTick } from "vue";
import Handles from "./handles/Handles.vue";
import Actors from "./actors/Actors.vue";
import Storage from "./storage/Storage.vue";

const baseHost = window.location.host;
const loadedSections = new Set<string>();
let initialHashHandled = false;

async function sectionLoaded(section: string) {
    loadedSections.add(section);
    if (initialHashHandled || loadedSections.size !== 4) return;
    initialHashHandled = true;

    // The sections above the link target can grow when their data arrives.
    await nextTick();
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
}
</script>

<style scoped>
.page-title {
    font-size: 2.5rem;
}

section {
    scroll-margin-top: 8rem;
    border-top: 1px solid var(--pico-muted-border-color);
    margin-top: 2rem;
    padding-top: 2rem;
}
</style>
