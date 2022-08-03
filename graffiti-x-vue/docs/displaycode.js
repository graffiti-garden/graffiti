export default {
  props: ['path'],

  data: ()=> ({code: ''}),

  async mounted() {
    const request = new Request(this.path)
    const response = await fetch(request)
    this.code = await response.text()
  },

  computed: {
    codePretty() {
      return Prism.highlight(this.code, Prism.languages.javascript, 'javascript');
    }
  },

  template: '<pre><code class="language-javascript" v-html="codePretty"></code></pre>'
}
