import { createApp } from 'vue'
import App from './App.vue'
import { i18n, initializeApplicationLocale } from './i18n/index.js'
import './style.css'

async function bootstrap() {
  await initializeApplicationLocale()
  createApp(App).use(i18n).mount('#app')
}

bootstrap()
