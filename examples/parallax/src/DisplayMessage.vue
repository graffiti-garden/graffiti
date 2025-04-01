<script setup lang="ts">
import type { MessageObject } from "./schemas";

defineProps<{
    message: MessageObject;
}>();
</script>

<template>
    <article
        :class="{
            'is-own-message': message.actor === $graffitiSession.value?.actor,
        }"
    >
        <header
            :class="{
                'visually-hidden':
                    message.actor === $graffitiSession.value?.actor,
            }"
        >
            <h3>{{ message.actor }}</h3>
        </header>
        <main>
            <p>{{ message.value.content }}</p>
        </main>
        <footer>
            <time :datetime="new Date(message.value.published).toISOString()">
                {{
                    new Date(message.value.published).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "numeric",
                    })
                }}
            </time>
        </footer>
    </article>
</template>

<style scoped>
article {
    border-radius: 1rem;
    padding-left: 1rem;
    padding-right: 1rem;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    max-width: calc(min(70vw, 30rem));

    header {
        flex: 0 0 100%;
    }

    footer {
        color: var(--text3);
        font-size: 0.8rem;
        flex-grow: 1;
        display: flex;
        flex-direction: column;

        time {
            align-self: flex-end;
            margin-left: 0.5rem;
        }
    }
}

article.is-own-message {
    background: var(--highlight);
    align-self: flex-end;
    border-bottom-right-radius: 0;
}

article:not(.is-own-message) {
    background: var(--foreground2);
    align-self: flex-start;
    border-bottom-left-radius: 0;
}
</style>
