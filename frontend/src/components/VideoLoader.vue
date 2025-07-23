<template>
  <div>
    <input type="file" accept="video/mp4" @change="onFileChange" />
    <video
      ref="videoRef"
      controls
      @loadedmetadata="onLoaded"
      style="max-width: 100%;"
    ></video>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useWebSocket } from '../composables/useWebSocket';

const videoRef = ref<HTMLVideoElement>();
const { send, messages } = useWebSocket();

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  videoRef.value!.src = url;

  // infer tempo by events
  const form = new FormData();
  form.append('video', file);
  const res = await fetch('/api/infer_tempo_by_events', { method: 'POST', body: form });
  const { bpm } = await res.json();
  if (bpm) {
    await fetch('/api/generate_bgm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bpm, duration: videoRef.value!.duration }),
    });
  } else {
    alert('テンポ推定に失敗しました。手動で入力してください。');
  }
}

function onLoaded() {
  send({ type: 'start_game' });
  videoRef.value!.play();
}
</script>