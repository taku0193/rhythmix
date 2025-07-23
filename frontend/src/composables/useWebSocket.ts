import { ref, onBeforeUnmount } from 'vue'

export function useWebSocket() {
  // window.location.host (例: localhost:5173) に対して /ws を張る
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl    = `${protocol}//${window.location.host}/ws`
  const ws       = new WebSocket(wsUrl)

  const isConnected = ref(false)
  const lastMessage = ref<string | null>(null)

  ws.onopen = () => {
    console.log('WebSocket connected →', wsUrl)
    isConnected.value = true
  }
  ws.onclose = () => {
    console.log('WebSocket disconnected')
    isConnected.value = false
  }
  ws.onerror = e => {
    console.error('WebSocket error', e)
  }
  ws.onmessage = ev => {
    // JSON 文字列をパースして lastMessage に格納
    lastMessage.value = ev.data
  }

  // 使い終わったら閉じる
  onBeforeUnmount(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close()
    }
  })

  function send(obj: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj))
    }
  }

  return {
    isConnected,
    lastMessage,
    send,
  }
}
