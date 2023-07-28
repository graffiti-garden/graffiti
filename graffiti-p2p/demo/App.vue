<script setup>
  import { ref, inject } from 'vue'
  const me = ref('')

  const context = ref('something')
  const gf = inject('graffiti')
  const { posts } = gf.usePosts(context)

  const message = ref('')
  async function postMessage() {
    const object = await gf.post({
      type: "Note",
      content: message.value
    }, me.value)
    await gf.context(context.value).add(object)
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

  <input v-model="context">

  <ul>
    <li v-for="post of posts">
      {{ post.content }}
      <button @click="post.content+='!!'">
        ‼️
      </button>
      <button @click="gf.context(context).delete(post)">
        ␡
      </button>
      <button @click="delete post.content">
        bah
      </button>
    </li>
  </ul>

  <form @submit.prevent="postMessage">
    <input v-model="message">
    <input type="submit" value="Post">
  </form>
</template>