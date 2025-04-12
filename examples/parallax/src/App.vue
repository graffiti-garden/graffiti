<script setup lang="ts">
import { parallaxOrProvenance } from "./parallaxOrProvenance";
</script>

<template>
    <dialog v-if="$graffitiSession.value === null" open class="login">
        <h1>{{ parallaxOrProvenance }}</h1>
        <button @click="$graffiti.login()">Log In</button>
    </dialog>
    <dialog v-else-if="$graffitiSession.value === undefined" open class="login">
        <h1>{{ parallaxOrProvenance }} is loading...</h1>
    </dialog>
    <RouterView v-else v-slot="{ Component }">
        <component :is="Component" :session="$graffitiSession.value" />
    </RouterView>
</template>

<style>
.login {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1rem;
}

:root {
    --background1: #121212;
    --background2: #2e2e2e;
    --foreground1: #4a4a4a;
    --foreground2: #3b3b3b;
    --highlight: #406ec9;
    --highlight-hover: #4a8bff;
    --text1: #f5f5f5;
    --text2: #e9e9e9;
    --text3: #dedede;
    --text4: #b9b9b9;
    --bad-color: #c9372c;
    --very-bad-color: #f44336;
    font-family: sans-serif;
    color: var(--text1);
    background: var(--background2);
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
}
</style>
