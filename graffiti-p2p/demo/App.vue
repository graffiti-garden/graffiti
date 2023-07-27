<script setup>
  import { ref, inject } from 'vue'
  const me = ref('')

  const gf = inject('graffiti')
  const { posts } = gf.usePosts("something")

  const message = ref('')
  async function postMessage() {
    gf.context("something")
    const object = await gf.post({
      type: "Note",
      content: message.value
    }, me.value)
    await gf.context("something").add(object)
  }
</script>

<template>
  <p>
    <button @click="$gf.selectActor().then(actor=>me=actor)">
      Select Actor
    </button>
  </p>

  <p>
    Your Actor ID is: "{{ me }}"
  </p>

  <ul>
    <li v-for="post of posts">
      {{ post.content }}
    </li>
  </ul>

  <form @submit.prevent="postMessage">
    <input v-model="message">
    <input type="submit" value="Post">
  </form>
</template>