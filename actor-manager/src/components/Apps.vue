<script setup>
  import ActorSelector from './ActorSelector.vue'
  import useActorManager from '../actor-manager';
  const { origins } = useActorManager()
</script>

<template>

  <p v-if="!Object.keys(origins).length">
    No applications have been granted access to your Graffiti actors. Go find some apps!
  </p>

  <template v-else>
    <p>
      Applications hosted at the following domains have been granted access to your Graffiti actors.
    </p>

    <table>
      <tr>
        <th>
          Origin
        </th>
        <th>
          Actor
        </th>
      </tr>
      <tr v-for="[origin, thumbprint] of Object.entries(origins)">
        <td>
          {{ origin }}
        </td>
        <td>
          <ActorSelector :origin="origin"/>
        </td>
        <td>
        </td>
      </tr>
    </table>
  </template>
</template>