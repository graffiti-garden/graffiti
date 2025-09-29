<template>
    <template v-if="!$graffitiSession.value">
        <dialog>
            <h1>
                <RouterLink to="/"> ✨ glitter ✨ </RouterLink>
            </h1>
            <h2>Made with <a href="https://graffiti.garden">Graffiti</a></h2>
            <p v-if="$graffitiSession.value === undefined">Loading...</p>
            <button v-else @click="$graffiti.login()">log in</button>
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
                        :to="`/profile/${encodeURIComponent($graffitiSession.value.actor)}`"
                    >
                        my profile
                    </RouterLink>
                </li>
                <li>
                    <RouterLink to="/directory"> directory </RouterLink>
                </li>
                <li>
                    <button @click="$graffiti.logout($graffitiSession.value)">
                        log out
                    </button>
                </li>
            </menu>
        </header>

        <main class="glitter">
            <RouterView />
            <footer>
                made of
                <a href="https://graffiti.garden" target="_blank">graffiti</a>
            </footer>
        </main>
    </template>
</template>

<style scoped>
li button {
    color: inherit;
    font-size: inherit;
    padding: 0.5em;
    border: none;
    text-decoration: none;
}

li button:hover {
    background: var(--dark-blue) !important;
}

h2 {
    color: white;
}
</style>
