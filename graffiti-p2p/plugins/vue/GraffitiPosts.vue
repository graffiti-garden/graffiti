<script setup>
import { inject, computed, toRefs } from 'vue'
const gf = inject('graffiti')

const props = defineProps({
  context: String,
  filter: Function
})

const { context } = toRefs(props)
const { posts: postsRaw } = gf.usePosts(context)

const posts = computed(()=> {
  let posts = postsRaw.value
  posts = props.filter?posts.filter(props.filter):posts
  return posts
})
</script>

<template>
  <slot :posts="posts"></slot>
</template>