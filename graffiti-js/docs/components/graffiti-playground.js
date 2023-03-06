import { h, compile } from "vue"
import { PrismEditor } from "vue-prism-editor"

const Renderer = {
  props: ['code'],

  render() {
    return h({render: compile(this.code), data: ()=>({message: ''})})
  },

  errorCaptured(e) {
    console.log(e)
    return false
  }
}

export default {
  components: { Renderer, PrismEditor },

  props: {
    'path': String,
    'render': {
      type: Boolean,
      default: true
    }
  },

  data: ()=> ({code: ''}),

  async created() {
    const request = new Request(`./demos/${this.path}.html`)
    const response = await fetch(request)
    this.code = await response.text()
  },

  methods: {
    highlighter(code) {
      return Prism.highlight(code, Prism.languages.markup)
    }
  },

  template: `
    <div class="demo">
      <fieldset v-if="render" class="demo-render">
        <legend>Demo</legend>
        <Renderer :code="code"/>
      </fieldset>
      <fieldset class="demo-code">
        <legend>Source Code</legend>
        <PrismEditor v-model="code" :highlight="highlighter"/>
      </fieldset>
    </div>`
}
