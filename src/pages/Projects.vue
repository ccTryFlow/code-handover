<template>
  <section class="projects-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">Projects</span>
        <h1>项目工作台</h1>
      </div>
      <el-button type="primary" size="large" :icon="Plus" @click="goLocal">
        新建分析
      </el-button>
    </div>

    <div class="summary-strip">
      <div v-for="item in summaries" :key="item.label" class="summary-item">
        <span>{{ item.value }}</span>
        <em>{{ item.label }}</em>
      </div>
    </div>

    <div class="filters">
      <el-input v-model="keyword" :prefix-icon="Search" placeholder="搜索项目、路径或语言" clearable />
      <el-select v-model="status" placeholder="状态">
        <el-option label="全部状态" value="all" />
        <el-option label="已完成" value="done" />
        <el-option label="待更新" value="pending" />
      </el-select>
      <el-select v-model="language" placeholder="语言">
        <el-option label="全部语言" value="all" />
        <el-option v-for="item in languages" :key="item" :label="item" :value="item" />
      </el-select>
      <el-select v-model="sortBy" placeholder="排序">
        <el-option label="最近分析" value="modified" />
        <el-option label="项目名称" value="name" />
      </el-select>
    </div>

    <section class="project-table">
      <div class="table-head">
        <span>项目名称</span>
        <span>路径</span>
        <span>语言</span>
        <span>最后分析</span>
        <span>操作</span>
      </div>

      <div v-if="filteredProjects.length === 0" class="empty-projects">
        <el-empty description="暂无真实项目记录，完成一次项目分析后会显示在这里。" />
      </div>

      <div v-for="project in paginatedProjects" :key="project.path" class="table-row">
        <div class="name-cell">
          <span class="folder-icon">
            <el-icon><Folder /></el-icon>
          </span>
          <div>
            <strong>{{ project.name }}</strong>
            <small>{{ project.documentPath ? '交接文档已生成' : '已识别项目' }}</small>
          </div>
        </div>
        <span class="path-cell">{{ project.path }}</span>
        <span>
          <em class="language-tag">{{ project.language }}</em>
        </span>
        <span class="modified">
          <el-icon><Clock /></el-icon>
          {{ project.modified }}
        </span>
        <div class="actions">
          <el-tooltip content="重新分析" placement="top">
            <el-button :icon="VideoPlay" circle @click="reanalyzeProject(project)" />
          </el-tooltip>
          <el-tooltip content="打开文档" placement="top">
            <el-button :icon="Document" circle :disabled="!project.documentPath" @click="openDocument(project.documentPath)" />
          </el-tooltip>
          <el-tooltip content="移除记录" placement="top">
            <el-button :icon="Delete" circle @click="removeProject(project)" />
          </el-tooltip>
        </div>
      </div>

      <div class="pagination-bar">
        <el-button :icon="ArrowLeft" :disabled="page === 1" @click="page--" />
        <el-button
          v-for="pageNumber in totalPages"
          :key="pageNumber"
          :type="pageNumber === page ? 'primary' : 'default'"
          @click="page = pageNumber"
        >
          {{ pageNumber }}
        </el-button>
        <el-button :icon="ArrowRight" :disabled="page === totalPages" @click="page++" />
        <el-select v-model="pageSize" class="page-size" @change="page = 1">
          <el-option label="10 / page" :value="10" />
          <el-option label="20 / page" :value="20" />
        </el-select>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Delete,
  Document,
  Folder,
  Plus,
  Search,
  VideoPlay,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'

import electronAPI from '../api/electron'
import store from '../store'

const router = useRouter()
const keyword = ref('')
const status = ref('all')
const language = ref('all')
const sortBy = ref('modified')
const page = ref(1)
const pageSize = ref(10)

interface ProjectView {
  name: string
  path: string
  language: string
  modified: string
  rawModified: string
  status: 'done' | 'pending'
  documentPath?: string
}

const projects = ref<ProjectView[]>([])

const summaries = computed(() => [
  { label: '已分析项目', value: projects.value.length },
  { label: '已生成文档', value: projects.value.filter(item => item.documentPath).length },
  { label: '涉及语言', value: languages.value.length },
])

const languages = computed(() => Array.from(new Set(projects.value.map(item => item.language))))

const filteredProjects = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return projects.value
    .filter(item => status.value === 'all' || item.status === status.value)
    .filter(item => language.value === 'all' || item.language === language.value)
    .filter(item => {
      if (!text) return true
      return [item.name, item.path, item.language].some(value => value.toLowerCase().includes(text))
    })
    .sort((a, b) => {
      if (sortBy.value === 'name') return a.name.localeCompare(b.name)
      return b.rawModified.localeCompare(a.rawModified)
    })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredProjects.value.length / pageSize.value)))

const paginatedProjects = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredProjects.value.slice(start, start + pageSize.value)
})

watch(filteredProjects, () => {
  if (page.value > totalPages.value) {
    page.value = totalPages.value
  }
})

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (num: number) => num.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const loadProjects = async () => {
  const list = await electronAPI.getRecentProjects()
  projects.value = list.map(item => ({
    name: item.name,
    path: item.path,
    language: item.framework || item.language || 'Unknown',
    modified: formatDateTime(item.lastAnalyzed),
    rawModified: item.lastAnalyzed,
    status: item.documentPath ? 'done' : 'pending',
    documentPath: item.documentPath,
  }))
}

const goLocal = () => router.push('/local-project')
const openDocument = async (documentPath?: string) => {
  if (!documentPath) return

  const opened = await electronAPI.openFile(documentPath)
  if (!opened) {
    ElMessage.error('打开文档失败')
  }
}

const reanalyzeProject = (project: ProjectView) => {
  store.clearConfig()
  store.setAnalyzeConfig({
    projectPath: project.path,
  })
  router.push('/analyze-config')
}

const removeProject = async (project: ProjectView) => {
  try {
    await ElMessageBox.confirm(`确定从最近项目中移除「${project.name}」吗？`, '移除项目', {
      type: 'warning',
      confirmButtonText: '移除',
      cancelButtonText: '取消',
    })
    const result = await electronAPI.removeRecentProject(project.path)
    if (!result) {
      ElMessage.error('移除失败')
      return
    }
    projects.value = projects.value.filter(item => item.path !== project.path)
    ElMessage.success('已移除项目记录')
  } catch {
    // 用户取消时不提示
  }
}

onMounted(loadProjects)
</script>

<style scoped>
.projects-page {
  max-width: 1550px;
  margin: 0 auto;
  display: grid;
  gap: 22px;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.eyebrow {
  color: #2563eb;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-heading h1 {
  margin: 8px 0 0;
  color: #0f172a;
  font-size: 42px;
  line-height: 1.1;
  letter-spacing: 0;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.summary-item {
  min-height: 94px;
  border-radius: 12px;
  padding: 18px 22px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(203, 213, 225, 0.78);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
  display: grid;
  align-content: center;
  gap: 6px;
}

.summary-item span {
  color: #0f172a;
  font-size: 30px;
  font-weight: 800;
}

.summary-item em {
  color: #64748b;
  font-size: 14px;
  font-style: normal;
}

.filters {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 150px 180px 170px;
  gap: 14px;
}

.filters :deep(.el-input__wrapper),
.filters :deep(.el-select__wrapper) {
  min-height: 48px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px #dbe3ed inset;
}

.project-table {
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(203, 213, 225, 0.86);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.07);
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: minmax(220px, 1.25fr) minmax(180px, 1.2fr) minmax(92px, 0.42fr) minmax(130px, 0.58fr) minmax(132px, auto);
  align-items: center;
  column-gap: 14px;
}

.table-head {
  height: 68px;
  padding: 0 34px;
  color: #475569;
  font-size: 15px;
  font-weight: 800;
  border-bottom: 1px solid #dfe7f0;
}

.table-row {
  min-height: 74px;
  padding: 0 34px;
  border-bottom: 1px solid #edf2f7;
}

.name-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;
}

.folder-icon {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #ffffff;
  background: linear-gradient(135deg, #2f80ed, #0ea5e9);
}

.name-cell strong,
.path-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-cell strong {
  display: block;
  color: #0f172a;
  font-size: 17px;
}

.name-cell small {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 13px;
}

.path-cell,
.modified {
  color: #64748b;
  font-size: 15px;
}

.language-tag {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  padding: 0 10px;
  border-radius: 7px;
  color: #15803d;
  background: #dcfce7;
  font-size: 14px;
  font-style: normal;
}

.modified {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  min-width: 132px;
  white-space: nowrap;
}

.actions :deep(.el-button.is-circle) {
  flex: 0 0 auto;
}

.pagination-bar {
  min-height: 62px;
  padding: 0 30px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}

.empty-projects {
  padding: 42px 24px;
  border-bottom: 1px solid #edf2f7;
}

.page-size {
  width: 130px;
  margin-left: 8px;
}

@media (max-width: 1180px) {
  .summary-strip,
  .filters {
    grid-template-columns: 1fr;
  }

  .table-head,
  .table-row {
    grid-template-columns: minmax(220px, 1fr) minmax(100px, 0.45fr) minmax(132px, auto);
  }

  .table-head span:nth-child(2),
  .table-head span:nth-child(4),
  .path-cell,
  .modified {
    display: none;
  }
}

@media (max-width: 760px) {
  .table-head {
    display: none;
  }

  .table-row {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 10px;
    padding: 14px 18px;
  }

  .name-cell {
    grid-column: 1;
  }

  .language-tag {
    width: fit-content;
  }

  .actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
  }

  .pagination-bar {
    justify-content: center;
    flex-wrap: wrap;
    padding: 12px 18px;
  }
}
</style>
