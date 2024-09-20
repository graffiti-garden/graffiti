<script setup lang="ts">
import { GraffitiIdentityProviderLogin } from "@graffiti-garden/client-vue";
</script>

<template>
    <template v-if="!$graffitiSession.value.webId">
        <dialog>
            <h1>
                <RouterLink to="/"> namebook </RouterLink>
            </h1>
            <GraffitiIdentityProviderLogin client-name="namebook" />
        </dialog>
    </template>
    <template v-else>
        <header>
            <menu>
                <li>
                    <RouterLink to="/"> feed </RouterLink>
                </li>
                <li>
                    <RouterLink
                        :to="`/profile/${encodeURIComponent($graffitiSession.value.webId)}`"
                    >
                        my profile
                    </RouterLink>
                </li>
                <li>
                    <RouterLink to="/directory"> directory </RouterLink>
                </li>
            </menu>
        </header>

        <main>
            <RouterView />
            <footer>
                made with
                <a href="https://graffiti.garden" target="_blank">graffiti</a>
            </footer>
        </main>
    </template>
</template>
