<template>
    <template v-if="!$graffitiSession.value">
        <dialog>
            <h1>
                <RouterLink to="/"> namebook </RouterLink>
            </h1>
            <button @click="$graffiti.login()">log in</button>
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
