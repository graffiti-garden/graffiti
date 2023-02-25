export const Name = {

  props: ['of'],

  template: `
    <GraffitiObjects v-slot="{objects}"
      :tags="[of]"
      :properties="{
        type: {enum: ['Profile'] },
        actor: {enum: [of] },
        describes: {enum: [of] }
      }"
      :required="['describes', 'name']"
      sortBy="-updated">

      {{ objects.length? objects[0].name : 'Anonymous' }}
    </GraffitiObjects>`
}

export const SetMyName = {

  data: ()=> ({
    name: ''
  }),

  methods: {
    setMyName() {
      this.$graffitiUpdate({
        type: 'Profile',
        name: this.name,
        describes: this.$graffitiMyActor,
        tag: [this.$graffitiMyActor]
      })
      this.name = ''
    }
  },

  template: `
    <form @submit.prevent="setMyName">
      <label for="nameBox">Change your name:</label>
      <input v-model="name" id="nameBox"/>
      <br>
      <input type="submit" value="Submit"/>
    </form>`
}
