<script setup>
import { ref } from 'vue'

const isDragging = ref(false)
const props = defineProps(['onactor'])

const fileEl = ref(null)
function onChange() {
    for (const file of fileEl.value.files) {
        const reader = new FileReader()
        reader.addEventListener(
            "load",
            async () => {
                try {
                    const json = JSON.parse(reader.result)
                    await props.onactor(json)
                } catch (e) {
                    alert("Actor file not understood.")
                    throw e
                }
            }, {
            passive: true,
            once: true
        })

        if (file) reader.readAsText(file)
    }
}

function drop(e) {
    isDragging.value = false;
    for (const file of e.dataTransfer.files) {
        if (file.type != "application/json") {
            return alert("You must upload a JSON file.")
        }
    }
    fileEl.value.files = e.dataTransfer.files
    onChange()
}
</script>

<template>
    <div class="dropzone" @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false" @drop.prevent="drop">
        <input type="file" multiple id="fileInput" @change="onChange" ref="fileEl" accept="application/json" />

        <label for="fileInput">
            <template v-if="isDragging">
                Release to drop actor file here.
            </template>
            <template v-else>
                Drop actor file here or <u>click here</u> to upload.
            </template>
        </label>
    </div>
</template>

<style>
.dropzone {
    border: 1px solid var(--frontfaded);
    border-radius: 1rem;
}

.dropzone input {
    opacity: 0;
    overflow: hidden;
    position: absolute;
}

.dropzone label {
    padding: 1rem;
    padding-top: 4rem;
    padding-bottom: 4rem;
    text-align: center;
    display: block;
    cursor: pointer;
}
</style>
