<script setup lang="ts">
import { ref } from "vue";
import { GraffitiSessionManager } from "@graffiti-garden/client-vue";
const variationsOpen = ref(false);
</script>

<template>
    <template v-if="!$graffitiSession.isReady">
        <dialog>
            <h1>
                <RouterLink to="/"> namebook </RouterLink>
            </h1>
            <GraffitiSessionManager clientName="Namebook" />
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
                        :to="`/profile/${encodeURIComponent($graffitiSession.webId ?? '')}`"
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
