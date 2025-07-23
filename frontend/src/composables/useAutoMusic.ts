// src/composables/useAutoMusic.ts
import { ref,watch } from 'vue'

export interface AutoParams {
  prompt?: string
  duration: number
  bpm?: number
  hr?: number
  intensity?: number
}

interface JobCreateRes {
  job_id: string
}
interface JobStatusRes {
  status: 'queue' | 'running' | 'done' | 'error'
  url?: string
  error?: string
  bpm?: number
  prompt?: string
}

export function useAutoMusic() {
  const currentEl = ref<HTMLAudioElement | null>(null)
  const nextEl = ref<HTMLAudioElement | null>(null)

  const generating = ref(false)
  const nextUrl = ref<string | null>(null)
  const nextBpm = ref<number | null>(null)
  const nextPrompt = ref<string | null>(null)

  // nextPrompt が変わるたびにログ
  watch(nextPrompt, (v) => {
    console.log('[nextPrompt changed]', v)
  })

  let asked = false
  let leadTimeSec = 5
  const fadeSec = 4

  function attach(el: HTMLAudioElement) {
    detach()
    currentEl.value = el
    el.loop = false
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('ended', onEnded)
  }

  function detach() {
    if (!currentEl.value) return
    currentEl.value.removeEventListener('timeupdate', onTimeUpdate)
    currentEl.value.removeEventListener('ended', onEnded)
    currentEl.value = null
  }

  function onTimeUpdate() {
    const el = currentEl.value
    if (!el || asked || !isFinite(el.duration)) return
    const remain = el.duration - el.currentTime
    if (remain < leadTimeSec) {
      asked = true
      requestNext({ duration: 20 })
    }
  }

  function onEnded() {
    switchNow()
  }

  async function requestNext(params: AutoParams) {
    generating.value = true
    try {
      const globalHr = (window as any).__HR_BPM__ ?? undefined
      const globalIntensity = (window as any).__EX_INTENSITY__ ?? undefined

      // **ここがポイント**：prompt が無ければ '' を送ってバックエンドに任せる
      const body = JSON.stringify({
        prompt: params.prompt ?? '',
        duration: params.duration,
        bpm: params.bpm,
        hr: params.hr ?? globalHr,
        intensity: params.intensity ?? globalIntensity,
      })

      const res = await fetch('/api/music-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { job_id } = (await res.json()) as JobCreateRes
      poll(job_id)
    } catch (e) {
      console.error(e)
      generating.value = false
      asked = false
    }
  }

  function poll(jobId: string) {
    const tick = async () => {
      try {
        const r = await fetch(`/api/music-jobs/${jobId}`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as JobStatusRes

        if (data.status === 'done') {
          nextUrl.value = data.url?.startsWith('http')
            ? data.url!
            : `${location.origin}${data.url}`
          nextBpm.value = data.bpm ?? null
          nextPrompt.value = data.prompt ?? null

          // ★ 実際のプロンプトをコンソールに出す
          console.debug('[MusicGen Prompt]', data.prompt)
          console.log('[MusicGen JobData]', data)
          ;(window as any).__LAST_MUSIC_PROMPT__ = data.prompt

          generating.value = false
          switchNow()
        } else if (data.status === 'error') {
          console.error(data.error)
          generating.value = false
          asked = false
        } else {
          setTimeout(tick, 1000)
        }
      } catch (err) {
        console.error(err)
        generating.value = false
        asked = false
      }
    }
    tick()
  }

  function switchNow() {
    const cur = currentEl.value
    if (!cur || !nextUrl.value) return

    const nxt = new Audio(nextUrl.value)
    nxt.crossOrigin = 'anonymous'
    nxt.volume = 0
    nxt.loop = false
    nextEl.value = nxt

    const startPlay = () => {
      nxt.play().catch(console.warn)
      crossfade(cur, nxt, fadeSec).then(() => {
        cur.pause()
        cur.src = ''
        currentEl.value = nxt
        nextEl.value = null
        asked = false

        if (nextBpm.value) {
          const beat = 60 / nextBpm.value
          leadTimeSec = Math.max(beat * 4, 3)
        }
      })
    }

    if (nxt.readyState >= 2) startPlay()
    else nxt.addEventListener('canplay', startPlay, { once: true })
  }

  function crossfade(from: HTMLAudioElement, to: HTMLAudioElement, sec: number) {
    return new Promise<void>((resolve) => {
      const frames = Math.floor(sec * 60)
      let i = 0
      const fromStartVol = from.volume
      const tick = () => {
        i++
        const t = i / frames
        from.volume = fromStartVol * (1 - t)
        to.volume = t
        if (i < frames) requestAnimationFrame(tick)
        else {
          from.volume = fromStartVol
          to.volume = 1
          resolve()
        }
      }
      requestAnimationFrame(tick)
    })
  }

  return {
    attach,
    detach,
    requestNext,
    generating,
    nextUrl,
    nextBpm,
    nextPrompt,
  }
}
