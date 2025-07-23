<!-- src/components/MusicPlayer.vue -->
<template>
  <div class="music-player">
    <label>
      Prompt:
      <input v-model="userPrompt" placeholder="音楽の説明を入力" />
    </label>
    <label>
      Duration (s):
      <input type="number" v-model.number="duration" min="5" />
    </label>
    <button @click="startFlow" :disabled="loading || isRunning">
      {{ loading ? '生成中…' : isRunning ? '再生中' : '🎵 生成' }}
    </button>

    <div v-if="error" class="error">⚠️ {{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useCrossfadePlayer } from '../composables/useCrossfadePlayer'

interface GenerateBgmResponse {
  success: boolean
  url: string
  bpm: number
  prompt?: string
}

const userPrompt = ref('')
const duration = ref(15)
const loading = ref(false)
const error = ref('')
const isRunning = ref(false)

const { playFirst, crossfadeTo, getCurrentAudioEl } = useCrossfadePlayer()

let currentBpm: number | null = null
let remainTimer: number | null = null
let nextTrackUrl: string | null = null
let nextTrackBpm: number | null = null

async function startFlow() {
  loading.value = true
  error.value = ''
  try {
    const first = await requestBgm({
      prompt: userPrompt.value,          // 1曲目はユーザープロンプト
      duration: duration.value,
      hr: (window as any).__HR_BPM__ ?? undefined,
      intensity: (window as any).__EX_INTENSITY__ ?? undefined,
      bpm: undefined,
    })

    await playFirst(first.url)
    currentBpm = first.bpm
    isRunning.value = true

    prefetchNext()
    startRemainWatcher()
  } catch (e: any) {
    console.error(e)
    error.value = e?.message || '生成に失敗しました'
  } finally {
    loading.value = false
  }
}

function startRemainWatcher() {
  stopRemainWatcher()
  const el = getCurrentAudioEl()
  if (!el) return

  remainTimer = window.setInterval(() => {
    if (!el.duration || isNaN(el.duration)) return
    const remain = el.duration - el.currentTime

    const bpm = currentBpm || 120
    const beatLen = 60 / bpm
    const fadeSec = beatLen * 4
    const leadSec = fadeSec + 2

    if (remain <= leadSec) {
      stopRemainWatcher()
      swapToNext(fadeSec)
    }
  }, 1000)
}

function stopRemainWatcher() {
  if (remainTimer !== null) {
    clearInterval(remainTimer)
    remainTimer = null
  }
}

async function prefetchNext() {
  try {
    const next = await requestBgm({
      prompt: '', // ★空で送ってバックエンドに任せる
      duration: duration.value,
      bpm: currentBpm || undefined,
      hr: (window as any).__HR_BPM__ ?? undefined,
      intensity: (window as any).__EX_INTENSITY__ ?? undefined,
    })
    nextTrackUrl = next.url
    nextTrackBpm = next.bpm
  } catch (e) {
    console.error('next gen failed', e)
    setTimeout(prefetchNext, 5000)
  }
}

async function swapToNext(fadeSec: number) {
  if (!nextTrackUrl) {
    const waitId = setInterval(() => {
      if (nextTrackUrl) {
        clearInterval(waitId)
        swapToNext(fadeSec)
      }
    }, 1000)
    return
  }

  try {
    await crossfadeTo(nextTrackUrl, fadeSec)

    currentBpm = nextTrackBpm
    nextTrackUrl = null
    nextTrackBpm = null

    prefetchNext()
    startRemainWatcher()
  } catch (e) {
    console.error('crossfade error', e)
  }
}

/** 同期API版。ジョブ方式ならここを差し替え */
async function requestBgm(params: {
  prompt?: string
  duration: number
  bpm?: number
  hr?: number
  intensity?: number
}): Promise<{ url: string; bpm: number }> {
  const body = {
    prompt: params.prompt ?? '',
    duration: params.duration,
    bpm: params.bpm,
    hr: params.hr,
    intensity: params.intensity,
  }
  const res = await fetch('/api/generate-bgm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || `HTTP ${res.status}`)
  }
  const data = (await res.json()) as GenerateBgmResponse
  if (!data.success) throw new Error('Generation failed')
  return { url: data.url, bpm: data.bpm }
}

onBeforeUnmount(() => {
  stopRemainWatcher()
})
</script>

<style scoped>
.music-player {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
label {
  display: flex;
  align-items: center;
  gap: 8px;
}
button {
  width: 120px;
}
.error {
  color: red;
  margin-top: 8px;
}
</style>
