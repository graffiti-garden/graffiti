export default {
  props: ['path'],

  data: ()=> ({html: ''}),

  async mounted() {
    const request = new Request(this.path)
    const response = await fetch(request)
    this.html = await response.text()
  },

  template: '<pre><code class="language-javascript">{{html}}</code></pre>'
}
