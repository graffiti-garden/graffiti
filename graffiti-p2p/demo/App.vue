<script setup>
  import { ref, inject } from 'vue'
  const gf = inject('graffiti')

  const context = ref('something')

  const message = ref('')
  async function postMessage() {
    if (!gf.me) {
      return alert("You need to sign in before posting!")
    }
    await gf.post({
      type: "Note",
      content: message.value,
      context: [context.value]
    })
    message.value = ''
  }
</script>

<template>
  <p>
    <button @click="$gf.selectActor">
      Select Actor
    </button>
  </p>

  <p>
    Your Actor ID is: "{{ $gf.me }}"
  </p>

  <input v-model="context">

  <GraffitiPosts v-slot={posts} :context="context" :filter="p=> 
    typeof p.content == 'string' &&
    p.type == 'Note'
  ">
    <ul>
      <li v-for="post in posts">
        {{ post.content }}
        <template v-if="post.actor==$gf.me">
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
  </GraffitiPosts>

  <form @submit.prevent="postMessage">
    <input v-model="message">
    <input type="submit" value="Post">
  </form>
</template>
