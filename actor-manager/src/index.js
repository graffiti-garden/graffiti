import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
createApp(App)
  .directive('focus', { mounted: e=> e.focus() })
  .mount('#app')
