<template>
  <div class="score-display">
    スコア: {{ score }}
  </div>
</template>

<script setup lang="ts">
import { ref, watch, defineProps } from 'vue'

const props = defineProps<{ score?: number }>()

// watch の第一引数は必ず getter 関数に
const score = ref(props.score ?? 0)
watch(
  () => props.score,
  v => {
    score.value = v ?? 0
  }
)
</script>

<style scoped>
.score-display {
  margin-top: 16px;
}
</style>
