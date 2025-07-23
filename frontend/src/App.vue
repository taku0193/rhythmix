<template>
  <div id="app">
    <GameCanvas :bpm="bpm" @update:bpm="bpm = $event" />
    <MusicPlayer :bpm="bpm" />
    <ScoreDisplay />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import GameCanvas from './components/GameCanvas.vue'
import MusicPlayer from './components/MusicPlayer.vue'
import ScoreDisplay from './components/ScoreDisplay.vue'

const bpm = ref(120)
</script>

<style>
#app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}
</style>
