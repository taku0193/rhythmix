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
import { useUserState } from '../stores/userState'

// ★ Piniaストアのインスタンスを取得
const userState = useUserState()

// APIのレスポンス型定義
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
    const first = await requestBgmAsJob({
      prompt: userPrompt.value,          // 1曲目はユーザープロンプト
      duration: duration.value,
      // ★ Piniaストアから値を取得
      hr: userState.heartRate,
      intensity: userState.exerciseIntensity,
      last_prompt: userState.lastMusicPrompt,
    })

    await playFirst(first.url)
    currentBpm = first.bpm
    isRunning.value = true
    // ★ ストアのlastMusicPromptを更新
    if (first.prompt) {
      userState.setLastMusicPrompt(first.prompt)
    }

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
    const next = await requestBgmAsJob({
      prompt: '', // ★空で送ってバックエンドに任せる
      duration: duration.value,
      bpm: currentBpm || undefined,
      // ★ Piniaストアから値を取得
      hr: userState.heartRate,
      intensity: userState.exerciseIntensity,
      last_prompt: userState.lastMusicPrompt,
    })
    nextTrackUrl = next.url
    nextTrackBpm = next.bpm
    // ★ ストアのlastMusicPromptを更新
    if (next.prompt) {
      userState.setLastMusicPrompt(next.prompt)
    }
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

/**
 * ★修正点: API呼び出しを非同期ジョブ方式に統一
 * BGM生成をリクエストし、完了までポーリングする
 */
async function requestBgmAsJob(params: {
  prompt?: string
  duration: number
  bpm?: number
  hr?: number
  intensity?: number
  last_prompt?: string
}): Promise<{ url:string; bpm: number; prompt?: string }> {
  // 1. ジョブの作成をリクエスト
  const createRes = await fetch('/api/music-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt ?? '',
      duration: params.duration,
      bpm: params.bpm,
      hr: params.hr,
      intensity: params.intensity,
      last_prompt: params.last_prompt,
    }),
  })
  if (!createRes.ok) {
    throw new Error(`ジョブ作成失敗: HTTP ${createRes.status}`)
  }
  const { job_id } = (await createRes.json()) as JobCreateRes

  // 2. ジョブの完了をポーリング
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const statusRes = await fetch(`/api/music-jobs/${job_id}`)
        if (!statusRes.ok) throw new Error(`ポーリング失敗: HTTP ${statusRes.status}`)
        const data = (await statusRes.json()) as JobStatusRes

        if (data.status === 'done') {
          if (!data.url || !data.bpm) {
            return reject(new Error('APIレスポンスにURLまたはBPMが含まれていません'))
          }
          // URLの整形
          const url = data.url.startsWith('http')
            ? data.url
            : `${location.origin}${data.url}`
          resolve({ url, bpm: data.bpm, prompt: data.prompt })
        } else if (data.status === 'error') {
          reject(new Error(data.error || 'BGM生成中に不明なエラーが発生しました'))
        } else {
          setTimeout(poll, 1500) // 1.5秒待って再試行
        }
      } catch (err) {
        reject(err)
      }
    }
    poll()
  })
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
