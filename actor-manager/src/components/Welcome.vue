<script setup>
  import useActorManager from '../actor-manager';
  const { actorManager } = useActorManager()
</script>

<template>
  <h1>
    Welcome to the Graffiti!
  </h1>

  <p>
    Graffiti is a common system for sharing data between different social media applications.
    This allows you to freely switch between different applications in the Graffiti ecosystem
    without losing your posts, message history, friends, and so on.
  </p>

  <p>
    This tool helps you manage your Graffiti "actors",
    which you can think of as different accounts.
    For example, you might have a main actor,
    a friends-only "finsta"-like actor,
    a professional actor that you use with LinkedIn-like apps,
    a dating actor that you use with a Tinder-like apps,
    and several throwaway actors that you use to be anonymous.
  </p>

  <p>
    To get started, create your first actor:
  </p>

  <form @submit.prevent="actorManager.createActor('My New Actor')">
    <input type="submit" value="Create New Actor"/>
  </form>
</template>