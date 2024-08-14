export default function({myID, useCollection}) { return {

  props: ['name', 'ID', 'collection', 'checked', 'unchecked'],

  methods: {
    toggleAnnotation() {
      if (this.collection.mine.length) {
        this.collection.removeMine()
      } else {
        this.collection.update({
          [this.name]: { id: this.ID },
          _inContextIf: [{
            _queryFailsWithout: [this.name + '.id']
          }]
        })
      }
    }
  },

  template: `
    <input type="checkbox"
      :id="name+ID"
      :checked="collection.mine.length">
    <label :for="name+ID" @click.prevent="toggleAnnotation">
      {{ collection.mine.length? checked : unchecked }}
    </label>`
  }
}
