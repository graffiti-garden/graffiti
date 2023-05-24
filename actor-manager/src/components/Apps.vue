<script setup>
  import { inject } from 'vue'
  const actorManager = inject('actorManager')
  const origins = inject('origins')
  const actors = inject('actors')

  function update(origin, event) {
    const thumbprint = event.target.value

    if (thumbprint=='revoke') {
      actorManager.removeOrigin(origin)
    } else {
      actorManager.updateOrigin(origin, thumbprint)
    }
  }
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
          <select :value="thumbprint" @change="update(origin, $event)">
            <option value="revoke">
              <strong>
                Revoke access
              </strong>
            </option>
            <option v-for="actor in actors" :value="actor.thumbprint">
              {{ actor.nickname }}
            </option>
          </select>
        </td>
        <td>
        </td>
      </tr>
    </table>
  </template>
</template>