<script setup>
  let name = ''
</script>

<template>
  <form @submit.prevent="$gf.createActor(name);name='';">
    <input v-model="name">
    <input type="submit" value="Create an actor">
  </form>

  <p>
    <button @click="$gf.selectActor()">
      Select Actor
    </button>
  </p>

  <p>
    Your Actor ID is: "{{ $gf.me }}"
  </p>
</template>