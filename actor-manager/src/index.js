import { createApp } from 'vue'
import './style.css'
import App from './Index.vue'
createApp(App)
  .directive('focus', { mounted: e=> e.focus() })
  .mount('#app')
