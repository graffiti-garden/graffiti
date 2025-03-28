<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
const working = ref(false);
const router = useRouter();

const search = ref("");
</script>
<template>
    <header>
        <h1>
            <RouterLink to="/"> Wikiffiti </RouterLink>
        </h1>
        <p>An encyclopedia you control</p>
        <nav>
            <button
                v-if="!$graffitiSession.value"
                @click="
                    working = true;
                    $graffiti.login().finally(() => (working = false));
                "
                :disabled="working"
            >
                Log in
            </button>
            <button
                v-else
                @click="
                    working = true;
                    $graffiti
                        .logout($graffitiSession.value)
                        .finally(() => (working = false));
                "
                :disabled="working"
            >
                Log out
            </button>
        </nav>
        <form
            role="search"
            @submit.prevent="
                router.push(`/wiki/${encodeURIComponent(search)}`);
                search = '';
            "
        >
            <input
                type="search"
                name="q"
                placeholder="Search..."
                v-model="search"
            />
        </form>
    </header>
    <main>
        <RouterView />
    </main>
    <footer>
        <p>Made of <a href="https://graffiti.garden">Graffiti</a></p>
    </footer>
</template>

<style>
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    --link: #36c;
    --link-hover: #3056a9;
    --link-visted: #6a60b0;
    --link-visted-hover: #534fa3;
}

body {
    font-family: serif;
}

header,
footer,
main {
    padding: 1rem;
}

a {
    text-decoration: none;
    color: var(--link);
}

a:hover {
    text-decoration: underline;
    color: var(--link-hover);
}

a:visited {
    color: var(--link-visted);
}

a:visited:hover {
    color: var(--link-visted-hover);
}

p {
    font-family: sans-serif;
    line-height: 1.5;
}

header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 1rem;
    border-bottom: 1px solid #ccc;

    h1 {
        font-size: 1.75rem;

        a,
        a:hover,
        a:visited,
        a:visited:hover {
            color: black;
        }
    }

    p {
        font-size: 1rem;
        font-family: inherit;
        color: #666;
    }

    form {
        flex: 1 1 100%;
    }

    input {
        width: 100%;
        padding: 0.5rem;
        font-size: 1rem;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

    nav {
        margin-left: auto;

        button {
            color: var(--link);
            background: none;
            border: none;
        }

        button:hover {
            color: var(--link-hover);
            text-decoration: underline;
            cursor: pointer;
        }
    }
}

footer {
    border-top: 1px solid #ccc;
}
</style>
