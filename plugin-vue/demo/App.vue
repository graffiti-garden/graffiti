<script setup>
  import { reactive, ref } from 'vue'

  const contexts = reactive(['something'])
  const context1 = ref('something')
  const context2 = ref('something-else')
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

  <template v-for="(context, index) in contexts" :key="index">
    <input :value="context" @input="contexts[index]=$event.target.value">
  </template>
  <button @click="contexts.push('something')">
    add context
  </button>

  <!-- <input v-model="context1">
  <input v-model="context2"> -->

  <GraffitiLinks v-slot="{ links }" :source="contexts">
  <!-- <GraffitiLinks v-slot="{ links }" :source="[context1, context2]"> -->
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
    $gf.postLink(context1, message);
    message='';
  ">
    <input v-model="message">
    <input type="submit" value="Post">
  </form>
  <div v-else>
    You need to log in to post yourself.
  </div>
</template>