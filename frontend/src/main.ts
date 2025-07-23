import { createApp } from 'vue'
import { createPinia } from 'pinia' // Piniaをインポート
import App from './App.vue'

const pinia = createPinia() // Piniaインスタンスを作成
const app = createApp(App)

// mount() の前に use() を呼び出す
app.use(pinia)

app.mount('#app')