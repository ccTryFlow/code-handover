<template>
  <div class="progress-log-container">
    <div class="log-header">
      <span>分析日志</span>
    </div>
    <div class="log-content" ref="logContent">
      <div
        v-for="(log, index) in logs"
        :key="index"
        class="log-entry"
      >
        <span class="log-time">{{ log.time }}</span>
        <span class="log-message">{{ log.message }}</span>
      </div>
      <div v-if="logs.length === 0" class="log-empty">
        等待开始...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'

interface LogEntry {
  time: string
  message: string
}

interface Props {
  logs: LogEntry[]
}

const props = defineProps<Props>()
const logContent = ref<HTMLElement>()

watch(() => props.logs.length, async () => {
  await nextTick()
  if (logContent.value) {
    logContent.value.scrollTop = logContent.value.scrollHeight
  }
})
</script>

<style scoped>
.progress-log-container {
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.log-header {
  background: #2d2d2d;
  color: #c5c5c5;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid #3e3e3e;
}

.log-content {
  max-height: 280px;
  overflow-y: auto;
  padding: 12px 16px;
}

.log-content::-webkit-scrollbar {
  width: 8px;
}

.log-content::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.log-content::-webkit-scrollbar-thumb {
  background: #4a4a4a;
  border-radius: 4px;
}

.log-entry {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 1.6;
}

.log-time {
  color: #569cd6;
  flex-shrink: 0;
}

.log-message {
  color: #d4d4d4;
}

.log-empty {
  color: #6a6a6a;
  text-align: center;
  padding: 40px 0;
  font-style: italic;
}
</style>
