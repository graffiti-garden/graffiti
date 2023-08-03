<script setup>
  import { ref, inject } from 'vue'
  const me = ref('')

  const context = ref('something')
  const gf = inject('graffiti')
  const { posts } = gf.usePosts(context)

  const message = ref('')
  async function postMessage() {
    if (!me.value) {
      return alert("You need to sign in before posting!")
    }
    await gf.post({
      type: "Note",
      content: message.value,
      context: [context.value]
    }, me.value)
    message.value = ''
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
      <template v-if="post.actor==me">
        <button @click="post.content+='!!'">
          ‼️
        </button>
        <button @click="gf.delete(post)">
          ␡
        </button>
        <button @click="delete post.content">
          clear
        </button>
      </template>
    </li>
  </ul>

  <form @submit.prevent="postMessage">
    <input v-model="message">
    <input type="submit" value="Post">
  </form>
</template>