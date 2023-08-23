<script setup>
  import { ref } from 'vue'

  const context = ref('something')
  const message = ref('')
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
    p.type == 'Note' &&
    typeof p.content == 'string'
  ">
    <ul>
      <li v-for="post in posts">
        {{ post.content }}
        <template v-if="post.actor==$gf.me">
          <button @click="post.content+='!!'">
            ‼️
          </button>
          <button @click="$gf.delete(post)">
            ␡
          </button>
          <button @click="delete post.content">
            clear
          </button>
        </template>
      </li>
    </ul>

    <form v-if="$gf.me" @submit.prevent="posts.post({
      type: 'Note',
      content: message
    }); message=''">
      <input v-model="message">
      <input type="submit" value="Post">
    </form>
    <div v-else>
      You need to log in to post yourself.
    </div>
  </GraffitiPosts>
</template>
