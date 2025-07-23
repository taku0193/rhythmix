import { createApp } from 'vue'
import { createPinia } from 'pinia' // Piniaをインポート
import App from './App.vue'
const pinia = createPinia() // Piniaインスタンスを作成

const app = createApp(App).mount('#app')
app.use(pinia) // アプリケーションに登録

