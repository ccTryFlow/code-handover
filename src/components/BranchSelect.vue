<template>
  <el-select
    v-model="selectedBranch"
    placeholder="请选择分支"
    @change="handleChange"
    style="width: 100%"
  >
    <el-option
      v-for="branch in branches"
      :key="branch"
      :label="branch"
      :value="branch"
    />
  </el-select>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import electronAPI from '../api/electron'

interface Props {
  localPath: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:branch': [branch: string]
}>()

const branches = ref<string[]>([])
const selectedBranch = ref('')

const loadBranches = async () => {
  if (props.localPath) {
    try {
      const result = await electronAPI.getBranches(props.localPath)
      branches.value = result.branches
      selectedBranch.value = result.currentBranch || selectedBranch.value
      if (branches.value.length > 0 && !selectedBranch.value) {
        selectedBranch.value = branches.value[0]
        emit('update:branch', branches.value[0])
      } else if (selectedBranch.value) {
        emit('update:branch', selectedBranch.value)
      }
    } catch (error) {
      console.error('Failed to load branches:', error)
    }
  }
}

onMounted(() => {
  loadBranches()
})

watch(() => props.localPath, () => {
  loadBranches()
})

const handleChange = (branch: string) => {
  emit('update:branch', branch)
}

defineExpose({
  loadBranches
})
</script>
