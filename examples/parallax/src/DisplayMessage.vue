<script setup lang="ts">
import type { DisplayMessageObject } from "./schemas";

defineProps<{
    message: DisplayMessageObject;
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
            <h3><GraffitiActorToHandle :actor="message.actor" /></h3>
        </header>
        <main>
            <p>{{ message.value.content }}</p>
        </main>
        <footer>
            <span class="metadata">
                <time
                    :datetime="new Date(message.value.published).toISOString()"
                >
                    {{
                        new Date(message.value.published).toLocaleTimeString(
                            [],
                            {
                                hour: "numeric",
                                minute: "numeric",
                            },
                        )
                    }}
                </time>
                <span
                    :class="[
                        'delivery-status',
                        message.deliveryStatus ?? 'sent',
                    ]"
                    :aria-label="
                        message.deliveryStatus === 'sending'
                            ? 'Sending'
                            : message.deliveryStatus === 'failed'
                              ? 'Failed to send'
                              : 'Sent'
                    "
                    :title="
                        message.deliveryStatus === 'sending'
                            ? 'Sending'
                            : message.deliveryStatus === 'failed'
                              ? 'Failed to send'
                              : 'Sent'
                    "
                >
                    <template v-if="message.deliveryStatus !== 'sending'">
                        <template v-if="message.deliveryStatus === 'failed'">
                            !
                        </template>
                        <template v-else>
                            ✓
                        </template>
                    </template>
                </span>
            </span>
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

        .metadata {
            align-self: flex-end;
            margin-left: 0.5rem;
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }

        .delivery-status {
            width: 1em;
            height: 1em;
            flex: 0 0 1em;
            border: 1px solid currentColor;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            font-size: 0.9em;
            line-height: 1;
        }

        .delivery-status.sending {
            opacity: 0.6;
            border-top-color: transparent;
            animation: spin 0.8s linear infinite;
        }

        .delivery-status.failed {
            color: var(--very-bad-color);
            font-weight: bold;
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

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
