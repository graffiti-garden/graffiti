<template>
    <template v-if="isLoggedIn">
        <header>
            <h1>
                <RouterLink :to="{ name: 'home' }"> {{ host }} </RouterLink>
            </h1>

            <details
                v-if="$route.name !== 'create'"
                :open="navOpen"
                @toggle="
                    navOpen =
                        ($event.target as HTMLDetailsElement)?.open ?? false
                "
            >
                <summary>Menu</summary>

                <nav :class="{ open: navOpen }">
                    <ul>
                        <li>
                            <RouterLink :to="{ name: 'handles' }">
                                Handles
                            </RouterLink>
                        </li>
                        <li>
                            <RouterLink :to="{ name: 'actors' }">
                                Actors
                            </RouterLink>
                        </li>
                        <li>
                            <RouterLink :to="{ name: 'storage' }">
                                Storage Buckets
                            </RouterLink>
                        </li>
                        <li>
                            <RouterLink :to="{ name: 'inboxes' }">
                                Inboxes
                            </RouterLink>
                        </li>
                        <li><Logout @click="navOpen = false" /></li>
                    </ul>
                </nav>
            </details>
        </header>

        <main>
            <RouterView />
        </main>
    </template>
    <template v-else-if="isLoggedIn === false">
        <LoginGuard />
    </template>
    <template v-else>
        <dialog open>
            <header>
                <h1>Loading {{ host }}...</h1>
            </header>
            <main>
                <StatusIcon status="loading" />
            </main>
        </dialog>
    </template>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import { isLoggedIn } from "./globals";
import LoginGuard from "./auth/LoginGuard.vue";
import Logout from "./auth/Logout.vue";
import { onMounted, onUnmounted, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import StatusIcon from "./utils/StatusIcon.vue";
import "./auth/floating-panel.css";

const router = useRouter();

const navOpen = ref(false);

const mq = window.matchMedia("(min-width: 800px)");
const syncNav = () => {
    navOpen.value = mq.matches;
};
onMounted(() => {
    syncNav();
    mq.addEventListener("change", syncNav);
});
onUnmounted(() => {
    mq.removeEventListener("change", syncNav);
});

router.afterEach(syncNav);

const host = window.location.host;
</script>

<style scoped>
details {
    display: contents;
}
details[open]::details-content {
    display: contents;
}

@media (min-width: 800px) {
    summary {
        display: none;
    }
}

@media (max-width: 799px) {
    header {
        display: grid;
        gap: 0;
        grid-template-columns: auto auto;
        grid-template-areas:
            "title menu"
            "nav nav";
    }

    h1 {
        grid-area: title;
    }

    details summary {
        text-align: right;
        user-select: none;
        grid-area: menu;
        margin-bottom: 0.5rem;
    }

    nav {
        transition:
            opacity 0.3s ease,
            transform 0.3s ease,
            filter 0.2s ease;
        opacity: 0;
        transform: translateY(-0.5rem) scaleY(0.95);
        filter: blur(2px);
        grid-area: nav;
        justify-content: flex-end;
        margin-bottom: 1rem;

        ul {
            flex-direction: column;
            align-items: flex-end;
            gap: 0.5rem;

            li {
                padding-top: 0;
                padding-bottom: 0;
            }
        }
    }

    nav.open {
        opacity: 1;
        transform: translateY(0) scaleY(1);
        filter: blur(0);
    }
}
</style>
