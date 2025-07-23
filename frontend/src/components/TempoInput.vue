<template>
  <label>
    BPM:
    <input type="number" v-model.number="input" />
    <button @click="apply">適用</button>
  </label>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, defineEmits } from 'vue'

// v-model:bpm を受け取る
const props = defineProps<{ bpm: number }>()
// defineEmits の型定義をオブジェクトシグネチャで記述
const emit = defineEmits<{ (event: 'update:bpm', val: number): void }>()

// 内部入力値
const input = ref<number>(props.bpm)

// ボタン押下で親を更新
function apply() {
  emit('update:bpm', input.value)
}

// 親から bpm が変わったら反映
watch(
  () => props.bpm,
  val => {
    input.value = val
  }
)
</script>

<style scoped>
label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
input {
  width: 60px;
}
</style>
