import * as Vue from 'vue'
import App from './components/App.vue'
import GraffitiPlugin from '../../plugins/vue'

console.log("hiya")

Vue.createApp(App)
  .use(GraffitiPlugin(Vue))
  .mount('#app')