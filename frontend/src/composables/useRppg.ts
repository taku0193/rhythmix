import { ref, onBeforeUnmount } from 'vue'
import { sendHR } from '../utils/sendHR'

export function useRppg() {
  const bpm = ref<number | null>(null)
  const confidence = ref(0)

  const worker = new Worker(new URL('../workers/rppgWorker.ts', import.meta.url), { type: 'module' })

  worker.onmessage = (e: MessageEvent) => {
    if (e.data?.type === 'bpm') {
      const { bpm: v, confidence: c } = e.data.payload
      bpm.value = v
      confidence.value = c
      sendHR(v, c) // ← ここで保存APIへ送信
    }
  }

  const timer = setInterval(() => worker.postMessage({ type: 'estimate' }), 1000)

  onBeforeUnmount(() => {
    clearInterval(timer)
    worker.terminate()
  })

  return { bpm, confidence, worker }
}
