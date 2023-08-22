<script setup>
import { inject, toRefs } from 'vue'
const gf = inject('graffiti')

const props = defineProps(["context"])
const { context } = toRefs(props)
const { posts } = gf.usePosts(context)
</script>

<template>
  <slot :posts="posts"></slot>
</template>