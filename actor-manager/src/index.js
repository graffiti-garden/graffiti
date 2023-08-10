import { createApp } from 'vue'
import './style.css'
import VueClickAway from "vue3-click-away"
import App from './Index.vue'
createApp(App)
  .use(VueClickAway)
  .directive('focus', { mounted: e=> e.focus() })
  .mount('#app')
