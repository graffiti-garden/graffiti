<template>
    <h2>A Graffiti Provider</h2>
    <p>
        {{ baseHost }} provides everything you need to create a
        <a href="https://graffiti.garden" target="_blank">Graffiti</a>
        identity and participate in the Graffiti ecosystem.
    </p>

    <p>
        <RouterLink :to="{ name: 'create' }" role="button">
            Create a Graffiti identity
        </RouterLink>
    </p>

    <p>
        Alternatively you may create or manage the individual components that
        make up a Graffiti identity. An identity is comprised of the following
        components:
    </p>

    <ul>
        <li>
            <RouterLink :to="{ name: 'handles' }">Handle</RouterLink>: A
            human-readable and globally unique username, such as
            <code>example.{{ baseHost }}</code
            >.
        </li>
        <li>
            <RouterLink :to="{ name: 'actors' }">Actor</RouterLink>: A
            <a href="https://www.w3.org/TR/did-1.0/"
                >decentralized identifier</a
            >
            that permanently represent you, even if you change your handle.
        </li>
        <li>
            <RouterLink :to="{ name: 'storage' }">Storage Bucket</RouterLink>: A
            simple file hosting service where your posts, images, and other
            media are stored.
        </li>
        <li>
            <RouterLink :to="{ name: 'inboxes' }">Inbox</RouterLink>: An
            email-like inbox where you can receive messages from other Graffiti
            users.
        </li>
    </ul>

    <aside>
        If you are unhappy with {{ baseHost }} you may migrate any and all
        services to another provider at any time.
    </aside>
</template>

<script setup lang="ts">
const baseHost = window.location.host;
</script>
