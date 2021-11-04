import Theater from 'https://theater.csail.mit.edu/js/theater.js'
import Vue     from 'https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.esm.browser.js'

let app = new Vue({
  el: '#app',
  data: {
    th: new Theater('theater.csail.mit.edu'),
    costume: {}
  },

  created: async function() {
    this.costume = await this.th.get('~/actor')
  },

  methods: {
    saveCostume: async function() {
      await this.th.put(this.costume, '~/actor')
    }
  },
})
