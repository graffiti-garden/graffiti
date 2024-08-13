<script setup lang="ts">
import { ref, computed, defineProps } from "vue";
import Name from "./Name.vue";
import Follow from "./Follow.vue";

const props = defineProps({
    webIdEncoded: {
        type: String,
    },
});

const webId = computed(() => decodeURIComponent(props.webIdEncoded));

// const follows = useQuery(()=> [props.webId], {
//   query:
// })

//   {
//   "follow.by": { $type: 'string' },
//   _by: myID
// });

// const followAuthors = computed(() => follows.map((f: any) => f.follow.by));

// const queryMod = computed(() => ({
//   $or: [
//     { _by: props.ID },
//     { at: props.ID }
//   ]
// }));

// const postMod = computed(() => props.ID === myID ? {} : {
//   at: [props.ID],
//   _inContextIf: [{
//     _queryFailsWithout: ['at.0']
//   }]
// });

// const prompt = computed(() => props.ID === myID ?
//   "what's on your mind?" :
//   "to my dear friend..."
// );
</script>

<template>
    <h1>
        <Name :webId="webId" :editable="true" />
    </h1>
    <h2>
        <a :href="webId">{{ webId }}</a>
    </h2>
    <p v-if="webId !== $graffitiSession.webId">
        <Follow :object="webId" />
    </p>
    <!-- <Posts
    :queryMod="queryMod"
    :postMod="postMod"
    :prompt="prompt"
    :follows="followAuthors"
  /> -->
</template>
