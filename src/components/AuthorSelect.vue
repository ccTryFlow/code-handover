<template>
  <el-select
    v-model="selectedAuthorEmail"
    placeholder="请选择交接人"
    filterable
    clearable
    fit-input-width
    popper-class="author-select-dropdown"
    style="width: 100%"
    @change="handleChange"
  >
    <el-option
      v-for="author in authors"
      :key="author.email"
      :label="`${author.name} (${author.email}) - ${author.commitCount} 次提交`"
      :value="author.email"
    />
  </el-select>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import electronAPI from '../api/electron'

interface Author {
  name: string
  email: string
  commitCount: number
}

interface Props {
  localPath: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:authorName': [name: string]
  'update:authorEmail': [email: string]
}>()

const authors = ref<Author[]>([])
const selectedAuthorEmail = ref('')

const loadAuthors = async () => {
  if (!props.localPath) return

  try {
    authors.value = (await electronAPI.getAuthors(props.localPath))
      .sort((left, right) => right.commitCount - left.commitCount)
  } catch (error) {
    console.error('Failed to load authors:', error)
  }
}

watch(() => props.localPath, loadAuthors, { immediate: true })

const handleChange = (email: string) => {
  const author = authors.value.find(item => item.email === email)
  if (author) {
    emit('update:authorName', author.name)
    emit('update:authorEmail', author.email)
    return
  }

  emit('update:authorName', '')
  emit('update:authorEmail', '')
}
</script>

<style>
.author-select-dropdown .el-select-dropdown__wrap {
  max-height: 260px;
}

.author-select-dropdown .el-select-dropdown__item {
  height: 38px;
  padding: 0 18px;
  line-height: 38px;
}
</style>
