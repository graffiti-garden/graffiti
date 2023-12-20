<script setup>
import { inject, computed, toRefs } from 'vue'
const gf = inject('graffiti')

const props = defineProps(
  ['source']
)

const { source } = toRefs(props)
const { links } = gf.useLinks(source)
</script>

<template>
  <slot :links="links"></slot>
</template>