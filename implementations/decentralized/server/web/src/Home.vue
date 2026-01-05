<template>
    <h2>A Graffiti Provider</h2>
    <p>
        {{ baseHost }} provides all the services you need to participate in the
        <a href="https://graffiti.garden" target="_blank">Graffiti</a>
        ecosystem.
    </p>

    <p>
        <RouterLink :to="{ name: 'create' }">
            Click here to create a complete Graffiti identity
        </RouterLink>
    </p>

    <p>Alternatively you may create or manage the individual services below.</p>

    <ul>
        <li>
            <RouterLink :to="{ name: 'handles' }"> Handles </RouterLink>:
            Human-readable usernames like <code>example.{{ baseHost }}</code>
        </li>
        <li><RouterLink :to="{ name: 'actors' }"> Actors </RouterLink>:</li>
        <li>
            <RouterLink :to="{ name: 'storage' }"> Storage Buckets </RouterLink
            >: A place where your
        </li>
        <li>
            <RouterLink :to="{ name: 'inboxes' }"> Inboxes </RouterLink>:
            Receive messages from other Graffiti users.
        </li>
    </ul>

    <aside>
        If you are unhappy with {{ baseHost }} you may migrate to another
        provider at any time.
    </aside>
</template>

<script setup lang="ts">
const baseHost = window.location.host;
</script>
