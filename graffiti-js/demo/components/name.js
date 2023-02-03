export const Name = {

  props: ["of"],

  methods: {
    name(objects) {
      const nameObjects = objects
                 .filter(o=> 
                   'name' in o &&
                   'of' in o &&
                   'timestamp' in o &&
                   typeof o.name == 'string' &&
                   o.of == this.of &&
                   o._by == this.of &&
                   typeof o.timestamp == 'number')
                 .sortBy('-timestamp')

      return nameObjects.length?
        nameObjects[0].name : 'anonymous'
    }
  },

  template: `
    <graffiti-objects :tags="[of]" v-slot="{objects}">
      {{ name(objects) }}
    </graffiti-objects>`
}

export const SetMyName = {

  props: ["tags"],

  data: ()=> ({
    name: ''
  }),

  methods: {
    setMyName() {
      this.$graffitiUpdate({
        name: this.name,
        timestamp: Date.now(),
        of: this.$graffitiMyID,
        _tags: this.tags
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
