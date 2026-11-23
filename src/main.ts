import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { refreshToday, reload } from './store'
import { initPwa } from './services/pwa'
import './style.css'

initPwa()
reload().then(() => createApp(App).use(router).mount('#app'))

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshToday()
})
