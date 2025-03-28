<script setup lang="ts">
import { computed, ref, type Ref } from "vue";
import {
    useGraffiti,
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { editSchema } from "./schemas";
import { Logoot } from "./logoot";
import type { GraffitiSession } from "@graffiti-garden/api";
import markdownit from "markdown-it";

const props = defineProps<{
    channel: string;
}>();

const title = computed(() => {
    // Decode and convert the channel to title case
    return decodeURIComponent(props.channel)
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
});

const { results: edits, isPolling } = useGraffitiDiscover(
    () => [props.channel],
    () => editSchema(title.value),
);

const myEdit: Ref<{
    editing: true;
    value: (typeof edits.value)[0]["value"];
}> = ref({
    value: {
        activity: "Edit",
        target: title.value,
        inserts: [],
        deletes: {},
    },
    editing: true,
});

const bannedActors = ref(new Set<string>());

const liveInserts = computed(() => {
    const deleteSet = new Set<string>();

    for (const edit of [myEdit.value, ...edits.value]) {
        if (!("editing" in edit) && bannedActors.value.has(edit.actor)) {
            continue;
        }
        const deletes = edit.value.deletes;
        if (deletes) {
            for (const [url, indexes] of Object.entries(deletes)) {
                for (const index of indexes) {
                    deleteSet.add(JSON.stringify([url, index]));
                }
            }
        }
    }

    const liveInserts: ({ char: string; position: number[] } & (
        | {
              url: string;
              index: number;
          }
        | {
              editing: true;
              index: number;
          }
    ))[] = [];

    for (const edit of [myEdit.value, ...edits.value]) {
        if (!("editing" in edit) && bannedActors.value.has(edit.actor)) {
            continue;
        }
        const inserts = edit.value.inserts;
        if (inserts) {
            for (const [index, { char, position }] of inserts.entries()) {
                if ("editing" in edit) {
                    liveInserts.push({ char, position, editing: true, index });
                } else {
                    const url = edit.url;
                    if (!deleteSet.has(JSON.stringify([url, index]))) {
                        liveInserts.push({ char, position, url, index });
                    }
                }
            }
        }
    }

    // Sort the inserts
    return liveInserts.sort((a, b) => Logoot.compare(a.position, b.position));
});

const liveText = computed(() => {
    return liveInserts.value.map(({ char }) => char).join("");
});

function findSingleCharDiff(a: string, b: string) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;

    if (longer.length - shorter.length !== 1) {
        throw new Error();
    }

    let changedIndex: number | undefined;
    for (let i = 0; i < shorter.length; i++) {
        const offset = changedIndex === undefined ? 0 : 1;
        if (shorter[i - offset] !== longer[i]) {
            if (changedIndex === undefined) {
                changedIndex = i;
            } else {
                throw new Error();
            }
        }
    }

    if (changedIndex === undefined) {
        changedIndex = shorter.length;
    } else if (shorter.at(-1) !== longer.at(-1)) {
        throw new Error();
    }

    return changedIndex;
}

function onInput(event: Event) {
    if (!event.target || !(event.target instanceof HTMLTextAreaElement)) return;
    const inputText = event.target.value;
    const existingInserts = liveInserts.value;
    const existingText = liveText.value;
    if (inputText === existingText) return;

    let diffIndex: number;
    try {
        diffIndex = findSingleCharDiff(existingText, inputText);
    } catch (e) {
        alert(
            "Due to current limitations, you can only\
              change one character at a time. No pasting\
              or deleting selections.",
        );
        event.target.value = existingText;
        return;
    }

    if (existingText.length < inputText.length) {
        const lower =
            diffIndex === 0
                ? Logoot.min
                : existingInserts[diffIndex - 1].position;
        const upper =
            diffIndex === existingInserts.length
                ? Logoot.max
                : existingInserts[diffIndex].position;
        const position = Logoot.randomBetween(lower, upper);

        myEdit.value.value.inserts!.push({
            char: inputText[diffIndex],
            position,
        });
    } else {
        const entry = existingInserts[diffIndex];
        if ("editing" in entry) {
            myEdit.value.value.inserts!.splice(entry.index, 1);
        } else {
            const { url, index } = entry;
            myEdit.value.value.deletes![url] = [
                index,
                ...(myEdit.value.value.deletes![url] ?? []),
            ];
        }
    }
}

const graffiti = useGraffiti();
async function saveEdits(session: GraffitiSession) {
    myEdit.value.value.target = title.value;
    await graffiti.put(
        {
            channels: [props.channel],
            value: myEdit.value.value,
        },
        session,
    );

    myEdit.value.value = {
        ...myEdit.value.value,
        inserts: [],
        deletes: {},
    };

    editing.value = false;
}

const preview = ref(false);
const editing = ref(false);
const md = markdownit({
    html: true,
    linkify: true,
});
</script>

<template>
    <article>
        <header>
            <h2>
                {{ title }}
            </h2>
            <nav>
                <button v-if="!editing" @click="editing = true">Edit</button>
                <button v-else @click="editing = false">Cancel</button>
            </nav>
        </header>
        <main v-if="editing">
            <p v-if="!$graffitiSession.value">
                You must <button @click="$graffiti.login()">log in</button> to
                edit.
            </p>
            <template v-else>
                <button v-if="!preview" @click="preview = true">
                    Show preview
                </button>
                <button v-else @click="preview = false">Show editor</button>
                <textarea
                    v-if="!preview"
                    @input="onInput"
                    :value="liveText"
                ></textarea>
                <div v-else v-html="md.render(liveText)"></div>

                <button
                    @click="saveEdits($graffitiSession.value)"
                    :disabled="
                        !myEdit.value.inserts?.length &&
                        !Object.keys(myEdit.value.deletes ?? {}).length
                    "
                >
                    Save edits
                </button>
            </template>
        </main>
        <main v-else>
            <p v-if="isPolling">Loading...</p>
            <p v-else-if="!liveText.length">
                <strong>
                    Wikiffiti does not have an article with this exact name.
                </strong>
                Please consider
                <button @click="editing = true">creating it</button>
            </p>
            <div v-else v-html="md.render(liveText)"></div>
        </main>
    </article>
</template>

<style>
article {
    max-width: 30rem;
    margin: auto;
}

textarea {
    width: 100%;
    resize: vertical;
    height: 10rem;
}
</style>
