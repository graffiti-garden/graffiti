import Theater from 'https://theater.csail.mit.edu/js/theater.js'
import Vue     from 'https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.esm.browser.js'

let app = new Vue({
  el: '#app',
  data: {
    th: new Theater('theater.csail.mit.edu'),
    success: false,
    actor: {}
  },

  created: async function() {
    this.actor = await this.th.get('~/actor')
  },

  methods: {
    saveProfile: async function() {
      await this.th.put(this.actor, '~/actor')
      this.success = true
    }
  },
})
