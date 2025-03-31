<template>
    <header>
        <h1>Parallax Chat</h1>
        <nav>
            <button v-if="!$graffitiSession.value" @click="$graffiti.login()">
                Log in
            </button>
            <button v-else @click="$graffiti.logout($graffitiSession.value)">
                Log out
            </button>
        </nav>
    </header>
    <main>
        <RouterView />
    </main>
    <footer>
        <p>Made of <a href="https://graffiti.garden">Graffiti</a></p>
    </footer>
</template>

<style>
body {
    font-family: sans-serif;
    margin: 0;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

header,
footer {
    background-color: #222;
    color: white;
    padding: 1em;
    text-align: center;
}
</style>
