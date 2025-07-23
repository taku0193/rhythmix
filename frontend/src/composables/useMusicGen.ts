import { ref } from 'vue'

export function useMusicGen() {
  const audio = ref<HTMLAudioElement | null>(null)

  /**
   * サーバーに POST して WAV バイナリを取得し、
   * Blob URL を返す
   */
  async function generateBuffer(
    prompt: string,
    bpm: number = 120,
    duration: number = 30
  ): Promise<string> {
    const res = await fetch('/api/generate-music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, bpm, duration })
    })
    if (!res.ok) {
      throw new Error(`MusicGen API error: ${res.status}`)
    }
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  }

  /**
   * 生成 → 再生
   */
  async function generateAndPlay(
    prompt: string,
    bpm: number = 120,
    duration: number = 30
  ) {
    const url = await generateBuffer(prompt, bpm, duration)
    if (!audio.value) {
      audio.value = new Audio()
    }
    audio.value.src = url
    audio.value.loop = false
    await audio.value.play()
  }

  return { generateBuffer, generateAndPlay }
}
