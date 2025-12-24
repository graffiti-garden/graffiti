<script setup lang="ts">
import { computed } from "vue";
import type {
    OptionalAlsoKnownAs,
    OptionalServices,
} from "../../../shared/did-schemas";

const props = defineProps<{
    alsoKnownAs: OptionalAlsoKnownAs;
    services: OptionalServices;
}>();

const emit = defineEmits<{
    (e: "update:alsoKnownAs", v: OptionalAlsoKnownAs): void;
    (e: "update:services", v: OptionalServices): void;
}>();

const aka = computed({
    get: () => props.alsoKnownAs ?? [],
    set: (v: OptionalAlsoKnownAs) =>
        emit("update:alsoKnownAs", v?.length ? v : undefined),
});

const svcs = computed({
    get: () => props.services ?? {},
    set: (v: OptionalServices) =>
        emit("update:services", Object.keys(v ?? {}).length ? v : undefined),
});

const addAka = () => (aka.value = [...aka.value, ""]);
const delAka = (i: number) => (aka.value = aka.value.filter((_, j) => j !== i));

const addSvc = () => {
    const s = { ...svcs.value };
    let i = 1;
    while (`service-${i}` in s) i++;
    s[`service-${i}`] = { type: "", endpoint: "" };
    svcs.value = s;
};

const delSvc = (k: string) => {
    const { [k]: _, ...rest } = svcs.value;
    svcs.value = rest;
};

const renameSvcKey = (oldKey: string, newKey: string) => {
    newKey = newKey.trim();
    if (newKey && newKey !== oldKey && !(newKey in svcs.value)) {
        const s = { ...svcs.value };
        s[newKey] = s[oldKey];
        delete s[oldKey];
        svcs.value = s;
    }
};
</script>

<template>
    <fieldset>
        <legend><code>alsoKnownAs</code></legend>
        <button type="button" @click="addAka">Add Alias</button>

        <ul>
            <li v-for="(u, i) in aka" :key="i">
                <input
                    type="url"
                    placeholder="https://…"
                    v-model="aka[i]"
                    v-focus
                    required
                />
                <button type="button" @click="delAka(i)">Remove</button>
            </li>
        </ul>

        <p v-if="aka.length === 0"><em>No Aliases</em></p>
    </fieldset>

    <fieldset>
        <legend><code>services</code></legend>
        <button type="button" @click="addSvc">Add Service</button>

        <dl>
            <template v-for="(v, k) in svcs" :key="k">
                <dt>
                    <input
                        :defaultValue="k"
                        aria-label="Service key"
                        placeholder="serviceKey"
                        @blur="
                            renameSvcKey(
                                k,
                                ($event.target as HTMLInputElement).value,
                            )
                        "
                    />
                </dt>
                <dd>
                    <label>
                        Type
                        <input v-model="v.type" required />
                    </label>

                    <label>
                        Endpoint
                        <input
                            type="url"
                            placeholder="https://…"
                            v-model="v.endpoint"
                            required
                        />
                    </label>

                    <button type="button" @click="delSvc(k)">
                        Remove Service "{{ k }}"
                    </button>
                </dd>
            </template>
        </dl>

        <p v-if="Object.keys(svcs).length === 0"><em>No Services</em></p>
    </fieldset>
</template>
