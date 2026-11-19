<template>
    <Header />

    <main>
        <section class="title">
            <h1 class="graffiti">Graffiti</h1>

            <h2>Build your own social app.</h2>
        </section>

        <section id="overview">
            <p>
                Graffiti provides all of the backend services you need to build
                your own social app. All you need to do is build the frontend!
            </p>

            <p>
                Graffiti's client-side Typescript API is expressive enough to
                build apps like
                <a href="https://glitter.graffiti.garden">Twitter</a>,
                <a href="https://parallax.graffiti.garden/">Messenger</a>,
                <a href="https://wiki.graffiti.garden">Wikipedia</a>, or
                something completely new. The API also makes it easy to address
                nuanced social dyanamics like <strong>moderation</strong>,
                <strong>privacy</strong>, and <strong>context collapse</strong>.
            </p>
            <p>
                The Graffiti backend is <strong>decentralized</strong> so you
                and your users will never be locked-in to a single provider.
                Every user of a Graffiti app can choose where their data is
                hosted or even host their own.
            </p>
            <p>
                Graffiti apps <strong>interoperate</strong> so you can build an
                app that connects with an existing Graffiti community while
                offering your own aesthetic, features, and moderation.
            </p>
        </section>

        <aside class="paper" aria-label="Paper and talk">
            <section aria-label="Talk">
                <a
                    href="https://www.youtube.com/watch?v=uQhkvRRCezc"
                    @click.prevent="openVideo"
                >
                    <figure>
                        <img
                            src="https://img.youtube.com/vi/uQhkvRRCezc/hqdefault.jpg"
                            alt="Thumbnail for the Graffiti paper talk"
                        />

                        <figcaption class="button-like">
                            Watch the Talk
                        </figcaption>
                    </figure>
                </a>
            </section>

            <section aria-label="Paper">
                <a
                    href="https://dl.acm.org/doi/pdf/10.1145/3746059.3747627?download=true"
                    download
                >
                    <figure>
                        <picture>
                            <source
                                media="(max-width: 899px)"
                                srcset="/assets/paper-wide.avif"
                            />
                            <img
                                src="/assets/paper-tall.avif"
                                alt="Screenshot of the front page of the Graffiti paper"
                            />
                        </picture>

                        <figcaption class="button-like">
                            Read the Paper
                        </figcaption>
                    </figure>
                </a>
                <p>
                    <a href="https://uist.acm.org/2025/awards/">
                        🏆 Best Paper at UIST’25
                    </a>
                </p>
            </section>
        </aside>

        <section>
            <Suspense>
                <Demo />

                <template #fallback>
                    <p class="demo-loading" role="status" aria-live="polite">
                        Loading interactive demo...
                    </p>
                </template>
            </Suspense>
        </section>

        <section>
            <h2>Resources</h2>

            <ul>
                <li>
                    <a href="https://vue.graffiti.garden/examples/">
                        Simple Examples</a
                    >: See how likes, follows, comments, profiles, and more can
                    be implemented in just a few lines of code.
                </li>
                <li>
                    <a href="https://api.graffiti.garden/classes/Graffiti.html">
                        API Documentation</a
                    >: Use Graffiti anywhere you use Javascript or Typescript.
                </li>
                <li>
                    <a
                        href="https://vue.graffiti.garden/variables/GraffitiPlugin.html"
                    >
                        Vue Plugin Documentation</a
                    >: Use Graffiti within <a href="https://vuejs.org">Vue</a>'s
                    reactive programming environment.
                </li>
                <li>
                    <a href="https://github.com/graffiti-garden/graffiti">Source Code</a
                    >: All of the Graffiti codebase is open sourced under GNU
                    GPLv3.
                </li>
            </ul>
        </section>

        <section>
            <h2>Cite Graffiti</h2>

            <div class="bibtex" @click="copyBibtex">
                <button
                    type="button"
                    :data-state="copyState"
                    title="Copy BibTeX to clipboard"
                >
                    <span aria-hidden="true">⧉ </span>
                    <span>
                        {{ copyState === "copied" ? "Copied!" : "Copy" }}
                    </span>
                </button>

                <pre><code>{{ bibtexEntry }}</code></pre>
            </div>
        </section>
    </main>

    <dialog
        id="paper-video-dialog"
        ref="videoDialog"
        class="video-dialog"
        aria-label="Graffiti paper talk"
        @click.self="closeVideo"
        @close="videoPlaying = false"
    >
        <iframe
            v-if="videoPlaying"
            src="https://www.youtube.com/embed/uQhkvRRCezc?autoplay=1&rel=0"
            title="Graffiti paper talk"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowfullscreen
        ></iframe>
    </dialog>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref } from "vue";
import Header from "./Header.vue";

const Demo = defineAsyncComponent(() => import("./Demo.vue"));

const videoDialog = ref<HTMLDialogElement | null>(null);
const videoPlaying = ref(false);

const bibtexEntry = `@inproceedings{graffiti,
    title = {Graffiti: Enabling an Ecosystem of Personalized and Interoperable Social Applications},
    author = {Henderson, Theia and Karger, David R. and Clark, David D.},
    booktitle = {Proceedings of the 38th Annual ACM Symposium on User Interface Software and Technology},
    url = {https://doi.org/10.1145/3746059.3747627},
    doi = {10.1145/3746059.3747627},
    isbn = {9798400720376},
    year = {2025},
    publisher = {ACM},
    address = {New York, NY, USA},
    articleno = {202},
    numpages = {21},
    series = {UIST ’25},
    collection = {UIST ’25}
}`;

const copyState = ref<"idle" | "copied" | "error">("idle");
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function openVideo() {
    videoPlaying.value = true;
    videoDialog.value?.showModal();
}

function closeVideo() {
    videoDialog.value?.close();
}

async function copyBibtex() {
    try {
        await navigator.clipboard.writeText(bibtexEntry);
        copyState.value = "copied";
    } catch {
        copyState.value = "error";
    }

    if (copyFeedbackTimer) {
        clearTimeout(copyFeedbackTimer);
    }

    copyFeedbackTimer = setTimeout(() => {
        copyState.value = "idle";
    }, 2200);
}

onBeforeUnmount(() => {
    if (copyFeedbackTimer) {
        clearTimeout(copyFeedbackTimer);
    }
});
</script>

<style>
main {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    padding: 1rem;
    max-width: 100ch;
    margin: 0 auto;
}
section {
    background: var(--background-color);
    border-radius: 0.5rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    ul {
        margin-left: 1.5em;
    }
}

.paper {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    p {
        text-align: center;
    }

    figure {
        position: relative;
        overflow: hidden;
        border-radius: 0.5rem;

        img {
            display: block;
            width: 100%;
            max-width: 100%;
            max-height: 100%;
            height: auto;
            object-fit: contain;
        }
    }

    section:first-child img {
        aspect-ratio: 16 / 9;
        object-fit: cover;
    }

    figcaption {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: fit-content;
        max-width: calc(100% - 2rem);
        z-index: 100;
    }

    figure::after {
        content: "";
        position: absolute;
        inset: 0;
        background: color-mix(in oklab, var(--highlight) 30%, transparent);
        opacity: 0;
        outline: 2px solid transparent;
        transition:
            opacity 0.2s ease,
            outline 0.2s ease;
        pointer-events: none;
    }

    a:is(:hover, :focus-visible) {
        figure {
            outline: 2px solid var(--highlight);

            &::after {
                opacity: 1;
            }
        }

        .button-like {
            background-color: var(--highlight-hover);
        }
    }
}

.video-dialog {
    width: min(90vw, 72rem);
    margin: auto;
    padding: 0;
    border: 0;
    border-radius: 0.75rem;
    background: #000;
}

.video-dialog::backdrop {
    background: rgb(0 0 0 / 75%);
    backdrop-filter: blur(4px);
}

.video-dialog iframe {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 0.75rem;
}

@media (max-width: 899px) {
    .paper figure {
        max-width: 40ch;
        margin: 0 auto;
    }
}

.bibtex {
    position: relative;
}

.bibtex button {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 1;
}

.bibtex:hover,
.bibtex:focus-within {
    cursor: pointer;

    pre {
        outline: 2px solid var(--highlight);
    }
}

.bibtex pre {
    position: relative;
    width: 100%;
    min-width: 0;
    padding: 1rem;
    border-radius: 0.5rem;
    background-color: var(--solid-background);
    white-space: pre;
    overflow: auto;
    outline: 2px solid transparent;
    transition: outline 0.2s ease;
}

.demo-loading {
    margin: 0;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: var(--solid-background);
    animation: demo-loading-pulse 2s ease-in-out infinite;
}

@keyframes demo-loading-pulse {
    0%,
    100% {
        opacity: 0.6;
    }

    50% {
        opacity: 1;
    }
}

@media (prefers-reduced-motion: reduce) {
    .demo-loading {
        animation: none;
    }
}

@media (min-width: 900px) {
    main {
        grid-template-columns: minmax(0, 1fr) 15rem;
        align-items: start;
    }

    .title,
    #overview {
        grid-column: 1;
    }

    .paper {
        grid-column: 2;
        grid-row: 1 / span 2;
        width: 15rem;
        align-self: center;
    }

    main > section:not(.title):not(#overview):not(.paper) {
        grid-column: 1 / -1;
    }
}

.waving {
    display: inline-block;
    animation: wave 1.5s linear infinite;
    transform-origin: 80% 80%;
}

@keyframes wave {
    25% {
        transform: rotate(-10deg);
    }
    75% {
        transform: rotate(10deg);
    }
}
</style>
