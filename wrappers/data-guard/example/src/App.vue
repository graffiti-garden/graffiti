<script setup lang="ts">
import {
  useGraffiti,
  useGraffitiDiscover,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { computed, ref } from "vue";
import MessageComposer from "./components/MessageComposer.vue";
import MessageCard from "./components/MessageCard.vue";
import { graffiti as guardedGraffiti } from "./graffiti.js";
import {
  errorMessage,
  messageChannel,
  messageSchema,
  type MessageObject,
} from "./model.js";

const graffiti = useGraffiti();
const session = useGraffitiSession();
const accountBusy = ref(false);
const accountError = ref("");
const { objects, isFirstPoll, poll } = useGraffitiDiscover(
  [messageChannel],
  messageSchema,
  undefined,
  true,
);
const messages = computed(() =>
  [...objects.value]
    .map((object) => object as MessageObject)
    .sort(
      (a, b) =>
        Date.parse(a.value.published) - Date.parse(b.value.published),
    ),
);
const guardedSession = computed(() =>
  session.value
    ? {
        ...session.value,
        source: [{ id: "garden-chat", name: "Garden Chat" }],
      }
    : undefined,
);

async function logOut() {
  if (!guardedSession.value) return;
  accountBusy.value = true;
  accountError.value = "";
  try {
    await graffiti.logout(guardedSession.value);
  } catch (error) {
    accountError.value = errorMessage(error);
  } finally {
    accountBusy.value = false;
  }
}
</script>

<template>
  <header class="container">
    <nav>
      <ul>
        <li><strong>Garden Chat</strong></li>
      </ul>
      <ul>
        <li>
          <button
            type="button"
            class="secondary outline"
            @click="guardedGraffiti.audit(guardedSession)"
          >
            Audit
          </button>
        </li>
        <li v-if="session === undefined"><small>Restoring session…</small></li>
        <li v-else-if="session === null">
          <button type="button" @click="graffiti.login()">Log in</button>
        </li>
        <template v-else>
          <li>
            <small>
              Signed in as
              <GraffitiActorToHandle :actor="session.actor" />
            </small>
          </li>
          <li>
            <button
              type="button"
              class="secondary outline"
              :aria-busy="accountBusy"
              :disabled="accountBusy"
              @click="logOut"
            >
              Log out
            </button>
          </li>
        </template>
      </ul>
    </nav>
    <p v-if="accountError" class="error" role="alert">{{ accountError }}</p>
  </header>

  <main class="container">
    <MessageComposer v-if="guardedSession" :session="guardedSession" />
    <article v-else-if="session === null" class="welcome">
      <h1>Join the conversation</h1>
      <p>You can read messages now. Log in when you want to send one.</p>
    </article>

    <section aria-labelledby="messages-heading">
      <header class="feed-header">
        <div>
          <h2 id="messages-heading">Messages</h2>
          <small>Public conversation</small>
        </div>
        <button
          type="button"
          class="secondary outline"
          :aria-busy="isFirstPoll"
          :disabled="isFirstPoll"
          @click="poll"
        >
          Refresh
        </button>
      </header>

      <p v-if="isFirstPoll" aria-busy="true">Loading messages…</p>
      <p v-else-if="messages.length === 0">No messages yet.</p>
      <div v-else class="message-list" aria-live="polite">
        <MessageCard
          v-for="message in messages"
          :key="message.url"
          :message="message"
          :session="guardedSession"
        />
      </div>
    </section>
  </main>
</template>
