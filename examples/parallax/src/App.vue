<template>
    <!-- <header>
        <h1>Parallax Chat</h1>
        <nav>
            <button v-if="!$graffitiSession.value" @click="$graffiti.login()">
                Log in
            </button>
            <button v-else @click="$graffiti.logout($graffitiSession.value)">
                Log out
            </button>
        </nav>
    </header> -->
    <main>
        <RouterView />
    </main>
</template>

<style>
:root {
    --background1: #121212;
    --background2: #2e2e2e;
    --foreground1: #4a4a4a;
    --foreground2: #3b3b3b;
    --highlight: #406ec9;
    --text1: #f5f5f5;
    --text2: #e9e9e9;
    --text3: #dedede;
    --text4: #b9b9b9;
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
