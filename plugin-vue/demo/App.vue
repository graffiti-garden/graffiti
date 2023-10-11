<script setup>
  import { ref } from 'vue'

  const context = ref('something')
  const message = ref('')
</script>

<template>
  <p>
    <button @click="$gf.logIn">
      Select Actor
    </button>
    <button @click="$gf.logOut">
      Log Out
    </button>
  </p>

  <p>
    Your Actor ID is: {{ $gf.me }}
  </p>

  <input v-model="context">

  <GraffitiLinks v-slot="{ links }" :source="context">
    <ul>
      <li v-for="link in links">
        {{ link.target }}
        <template v-if="link.actor==$gf.me">
          <button @click="$gf.deleteLink(link)">
            ␡
          </button>
        </template>
      </li>
    </ul>
  </GraffitiLinks>

  <form v-if="$gf.me" @submit.prevent="
    $gf.postLink(context, message);
    message='';
  ">
    <input v-model="message">
    <input type="submit" value="Post">
  </form>
  <div v-else>
    You need to log in to post yourself.
  </div>
</template>