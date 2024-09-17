<script setup lang="ts">
import { inject, type Ref } from "vue";
import { type GraffitiSession } from "@graffiti-garden/client-vue";
import { getDefaultSession } from "@inrupt/solid-client-authn-browser";
const session = inject<Ref<GraffitiSession>>("graffitiSession")!;

function login() {
    getDefaultSession().login({
        oidcIssuer: "https://solid.theias.place",
        redirectUrl: window.origin,
        clientName: "graffiti vue demo",
    });
}
</script>

<template>
    <template v-if="!session.webId">
        <dialog>
            <h1>
                <RouterLink to="/"> namebook </RouterLink>
            </h1>
            <button @click="login">Login</button>
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
                        :to="`/profile/${encodeURIComponent(session.webId)}`"
                    >
                        my profile
                    </RouterLink>
                </li>
                <li>
                    <RouterLink to="/directory"> directory </RouterLink>
                </li>
                <!-- <li>
            <a href="" @click.prevent="variationsOpen=true">
              variations
            </a>
            <menu v-if="variationsOpen" v-click-away="()=> variationsOpen=false">
              <li>
                <a href="./minimal.html">
                  minimal
                </a>
              </li>
              <li>
                <a href="./thewall.html">
                  the wall
                </a>
              </li>
            </menu>
          </li>
          <li>
            <a href="" @click.prevent="toggleLogIn">
              log out
            </a>
          </li> -->
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
