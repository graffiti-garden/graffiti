<template>
    <p>
        {{ baseHost }} is a
        <a href="https://graffiti.garden" target="_blank">Graffiti</a>
        provider.
    </p>

    <button>Create New Profile</button>
</template>

<script setup lang="ts">
const baseHost = window.location.host;
</script>
