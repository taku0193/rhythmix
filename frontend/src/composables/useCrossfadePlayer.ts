// src/composables/useCrossfadePlayer.ts
import { ref } from 'vue'

/**
 * 2つの <audio> 要素でクロスフェード再生する簡易プレーヤ
 */
export function useCrossfadePlayer() {
  const players = [new Audio(), new Audio()]
  players.forEach(p => {
    p.crossOrigin = 'anonymous'
    p.loop = true
    p.volume = 0
  })

  const currentIdx = ref<0 | 1>(0)

  function getCurrentAudioEl() {
    return players[currentIdx.value]
  }
  function getNextAudioEl() {
    return players[1 - currentIdx.value]
  }

  async function playFirst(url: string) {
    const cur = getCurrentAudioEl()
    cur.src = url
    cur.volume = 1
    await cur.play().catch(console.warn)
  }

  /**
   * url の曲へ fadeSec 秒かけてクロスフェード
   */
  async function crossfadeTo(url: string, fadeSec: number) {
    const from = getCurrentAudioEl()
    const to = getNextAudioEl()

    to.src = url
    to.currentTime = 0
    to.volume = 0
    await to.play().catch(console.warn)

    const start = performance.now()
    const durMs = fadeSec * 1000

    return new Promise<void>((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / durMs)
        from.volume = 1 - t
        to.volume = t
        if (t < 1) {
          requestAnimationFrame(step)
        } else {
          // 切替完了
          from.pause()
          from.src = ''
          currentIdx.value = (currentIdx.value === 0 ? 1 : 0)
          resolve()
        }
      }
      requestAnimationFrame(step)
    })
  }

  function dispose() {
    players.forEach(p => {
      p.pause()
      p.src = ''
    })
  }

  return {
    playFirst,
    crossfadeTo,
    getCurrentAudioEl,
    dispose,
  }
}
