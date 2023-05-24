<script setup>
  import Welcome from './components/Welcome.vue'
  import { inject } from 'vue'
  const actors = inject('actors')
</script>

<template>
  <Welcome v-if="!Object.keys(actors).length"/>
  <template v-else>
    <header>
      <h1>
        Graffiti Actor Manager
      </h1>
      <!-- <ul>
        <li>
          <router-link to="/">My Actors</router-link>
        </li>
        <li> 
          <router-link to="/apps">My Apps</router-link>
        </li>
      </ul> -->
    </header>
    <!-- <main>
      <router-view></router-view>
    </main> -->
  </template>
</template>