<script setup>
  import Welcome from './Welcome.vue'
  import useActorManager from '../actor-manager';
  const { actors } = useActorManager()
</script>

<template>
  <Welcome v-if="!Object.keys(actors).length"/>
  <template v-else>
    <header>
      <h1>
        Graffiti Actor Manager
      </h1>
      <ul>
        <li>
          <RouterLink to="/">My Actors</RouterLink>
        </li>
        <li> 
          <RouterLink to="/apps">My Apps</RouterLink>
        </li>
      </ul>
    </header>
    <main>
      <RouterView/>
    </main>
  </template>
</template>