<template>
  <div class="music-gen">
    <label>
      Prompt:
      <input v-model="prompt" placeholder="例: upbeat workout track" />
    </label>
    <label>
      BPM:
      <input type="number" v-model.number="bpm" />
    </label>
    <label>
      Duration (s):
      <input type="number" v-model.number="duration" />
    </label>
    <button @click="onGenerate" :disabled="loading">
      {{ loading ? '生成中…' : '音楽生成' }}
    </button>

    <audio v-if="audioUrl" :src="audioUrl" controls autoplay />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const prompt = ref<string>('')
const bpm = ref<number>(120)
const duration = ref<number>(30)
const loading = ref<boolean>(false)
const audioUrl = ref<string|null>(null)

async function onGenerate() {
  loading.value = true
  audioUrl.value = null
  try {
    const res = await fetch('/api/generate-music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt.value,
        bpm: bpm.value,
        duration: duration.value
      })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    audioUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    console.error(e)
    alert('生成に失敗しました')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.music-gen {
  border: 1px solid #ccc;
  padding: 12px;
  margin-bottom: 16px;
}
.music-gen label {
  display: block;
  margin-bottom: 8px;
}
</style>
