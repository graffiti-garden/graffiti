<template>
    <details ref="menu" class="account-switcher" @toggle="onToggle">
        <summary role="button">{{ accountLabel(currentAccount) }}</summary>
        <div ref="accountMenu" class="account-menu">
            <div class="account-group">
                <article
                    class="current-account"
                    :class="{ connected: otherAccounts.length }"
                >
                    <small>Current account</small>
                    <p><strong>{{ accountLabel(currentAccount) }}</strong></p>
                    <Logout class="secondary" />
                </article>
                <ul v-if="otherAccounts.length" class="other-accounts">
                    <li v-for="account in otherAccounts" :key="account.id">
                        <button
                            type="button"
                            class="secondary"
                            :aria-label="`Switch to ${accountLabel(account)}`"
                            @click="selectAccount(account.id)"
                        >
                            {{ accountLabel(account) }}
                        </button>
                    </li>
                </ul>
            </div>
            <div class="account-actions">
                <button type="button" @click="router.push({ name: 'add-account' })">
                    Add another account
                </button>
                <Logout v-if="otherAccounts.length" class="secondary" all />
            </div>
        </div>
    </details>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
    accountLabel,
    accounts,
    currentAccount,
    selectedAccount,
    selectAccount,
} from "../globals";
import Logout from "./Logout.vue";

const menu = ref<HTMLDetailsElement>();
const accountMenu = ref<HTMLElement>();
const router = useRouter();
const otherAccounts = computed(() =>
    accounts.value?.filter((account) => account.id !== selectedAccount.value) ?? [],
);
watch(selectedAccount, () => {
    if (menu.value) menu.value.open = false;
});

function closeOnOutsideClick(event: PointerEvent) {
    if (menu.value?.open && !event.composedPath().includes(menu.value)) {
        menu.value.open = false;
    }
}

function onToggle() {
    if (menu.value?.open && window.matchMedia("(max-width: 799px)").matches) {
        window.scrollTo(0, 0);
    }
}

// The desktop dropdown overlays the page, so include its bottom edge in the
// page's minimum height when it is open.
let menuObserver: ResizeObserver | undefined;
onMounted(() => {
    document.addEventListener("pointerdown", closeOnOutsideClick);
    menuObserver = new ResizeObserver(() => {
        const app = document.getElementById("app");
        if (!app || !accountMenu.value) return;
        app.style.setProperty(
            "--account-menu-bottom",
            `${accountMenu.value.getBoundingClientRect().bottom - app.getBoundingClientRect().top + 8}px`,
        );
    });
    if (accountMenu.value) menuObserver.observe(accountMenu.value);
});
onUnmounted(() => {
    document.removeEventListener("pointerdown", closeOnOutsideClick);
    menuObserver?.disconnect();
    document.getElementById("app")?.style.removeProperty("--account-menu-bottom");
});
</script>

<style scoped>
.account-switcher {
    position: relative;
    margin-bottom: 0;
}
.account-switcher > summary {
    white-space: nowrap;
    width: fit-content;
    margin-left: auto;
}
.account-switcher[open] > summary {
    margin-bottom: 0;
}
.account-menu {
    position: absolute;
    right: 0;
    z-index: 20;
    width: min(20rem, calc(100vw - 2rem));
    padding: 1rem;
    background: var(--pico-background-color);
    border: 1px solid var(--pico-muted-border-color);
    border-radius: var(--pico-border-radius);
    box-shadow: var(--pico-card-box-shadow);
}
.current-account {
    margin: 0;
}
.current-account.connected {
    border-radius: var(--pico-border-radius) var(--pico-border-radius) 0 0;
}
.current-account p {
    overflow-wrap: anywhere;
}
.account-menu button {
    width: 100%;
    margin: 0;
}
.other-accounts {
    display: block;
    padding: 0;
    margin: 0;
}
.other-accounts li {
    display: block;
    list-style: none;
    padding: 0;
}
.other-accounts li + li {
    margin-top: -1px;
}
.other-accounts button {
    padding-inline: var(--pico-block-spacing-horizontal);
    border-radius: 0;
    text-align: left;
}
.other-accounts li:last-child button {
    border-radius: 0 0 var(--pico-border-radius) var(--pico-border-radius);
}
.account-actions {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--pico-muted-border-color);
}

@media (max-width: 799px) {
    .account-menu {
        position: static;
        margin-top: 0.5rem;
    }
}
</style>
