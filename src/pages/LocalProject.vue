<template>
  <section class="flow-page">
    <div class="flow-heading">
      <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
      <div>
        <span>Local Project</span>
        <h1>选择本地项目</h1>
      </div>
    </div>

    <div class="flow-card">
      <div class="select-panel">
        <div class="select-icon">
          <el-icon><FolderOpened /></el-icon>
        </div>
        <span class="panel-eyebrow">Local Workspace</span>
        <h2>项目目录</h2>
        <ul class="select-benefits">
          <li><el-icon><Check /></el-icon> 自动检测 Git 仓库</li>
          <li><el-icon><Check /></el-icon> 读取当前分支</li>
          <li><el-icon><Check /></el-icon> 后续可按作者生成交接文档</li>
        </ul>
        <el-button type="primary" size="large" :icon="FolderOpened" @click="handleSelectDirectory">
          选择目录
        </el-button>
      </div>

      <div class="detail-panel">
        <div class="detail-row">
          <span>项目路径</span>
          <strong>{{ selectedPath || '尚未选择' }}</strong>
        </div>
        <div class="detail-row">
          <span>Git 状态</span>
          <div class="git-status" :class="gitStatusClass">
            <el-icon><component :is="gitStatusIcon" /></el-icon>
            <strong>{{ gitStatusText }}</strong>
          </div>
        </div>
        <div class="detail-row">
          <span>当前分支</span>
          <strong>{{ currentBranch || '-' }}</strong>
        </div>

        <el-alert
          v-if="selectedPath && !isGitRepo"
          title="当前目录不是 Git 仓库，只能生成基础结构分析，无法按作者统计负责代码。"
          type="warning"
          :closable="false"
          show-icon
        />

        <div class="flow-actions">
          <el-button @click="goBack">取消</el-button>
          <el-button type="primary" :disabled="!selectedPath" @click="proceedToConfig">
            下一步
          </el-button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, CircleCheckFilled, Clock, FolderOpened, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import electronAPI from '../api/electron'
import store from '../store'

const router = useRouter()
const selectedPath = ref('')
const isGitRepo = ref(false)
const currentBranch = ref('')

const gitStatusClass = computed(() => selectedPath.value ? (isGitRepo.value ? 'success' : 'warning') : 'pending')
const gitStatusIcon = computed(() => selectedPath.value ? (isGitRepo.value ? CircleCheckFilled : WarningFilled) : Clock)
const gitStatusText = computed(() => selectedPath.value ? (isGitRepo.value ? '已识别 Git 仓库' : '非 Git 仓库') : '等待选择项目目录')

const goBack = () => router.push('/')

const handleSelectDirectory = async () => {
  try {
    const path = await electronAPI.selectDirectory()
    if (path) {
      selectedPath.value = path
      await checkGitStatus()
    }
  } catch (error) {
    ElMessage.error('选择目录失败')
    console.error(error)
  }
}

const checkGitStatus = async () => {
  if (!selectedPath.value) return
  try {
    isGitRepo.value = await electronAPI.checkGitRepo(selectedPath.value)
    if (isGitRepo.value) {
      const result = await electronAPI.getBranches(selectedPath.value)
      currentBranch.value = result.currentBranch || ''
    }
  } catch (error) {
    console.error('Failed to check git status:', error)
    isGitRepo.value = false
    currentBranch.value = ''
  }
}

const proceedToConfig = () => {
  store.clearConfig()
  store.setAnalyzeConfig({
    projectPath: selectedPath.value,
    branch: currentBranch.value,
    gitEnabled: isGitRepo.value,
  })
  router.push('/analyze-config')
}
</script>

<style scoped>
.flow-page {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  gap: 24px;
}

.flow-heading {
  display: flex;
  align-items: flex-end;
  gap: 18px;
}

.flow-heading span {
  color: #2563eb;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.flow-heading h1 {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 38px;
  line-height: 1.12;
}

.flow-card {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.84);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
  display: grid;
  grid-template-columns: 390px minmax(0, 1fr);
  overflow: hidden;
}

.select-panel {
  padding: 44px;
  background:
    radial-gradient(circle at 10% 10%, rgba(37, 99, 235, 0.16), transparent 38%),
    linear-gradient(145deg, #eff6ff, #f8fafc);
  border-right: 1px solid #dbe3ed;
}

.select-icon {
  width: 78px;
  height: 78px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: #ffffff;
  font-size: 38px;
  background: linear-gradient(135deg, #2563eb, #20c5bd);
  box-shadow: 0 18px 34px rgba(37, 99, 235, 0.24);
}

.panel-eyebrow {
  display: inline-block;
  margin-top: 22px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.select-panel h2 {
  margin: 10px 0 12px;
  color: #0f172a;
  font-size: 26px;
}

.select-panel p {
  margin: 0 0 22px;
  color: #475569;
  font-size: 16px;
  line-height: 1.7;
}

.select-benefits {
  margin: 0 0 28px;
  padding: 0;
  display: grid;
  gap: 10px;
  list-style: none;
}

.select-benefits li {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #334155;
  font-size: 14px;
  font-weight: 700;
}

.select-benefits .el-icon {
  color: #059669;
}

.detail-panel {
  padding: 42px;
  display: grid;
  align-content: start;
  gap: 18px;
}

.detail-row {
  min-height: 66px;
  padding: 16px 18px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: grid;
  gap: 8px;
}

.detail-row span {
  color: #475569;
  font-size: 14px;
}

.detail-row strong {
  min-width: 0;
  color: #0f172a;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-status {
  width: fit-content;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.git-status .el-icon {
  font-size: 16px;
}

.git-status strong {
  font-size: 14px;
  font-weight: 700;
}

.git-status.pending {
  color: #64748b;
  background: #f1f5f9;
  border-color: #e2e8f0;
}

.git-status.pending strong {
  color: #475569;
}

.git-status.success {
  color: #059669;
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.git-status.success strong {
  color: #047857;
}

.git-status.warning {
  color: #d97706;
  background: #fffbeb;
  border-color: #fde68a;
}

.git-status.warning strong {
  color: #b45309;
}

.flow-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
}

:deep(.el-button) {
  cursor: pointer;
}

@media (max-width: 980px) {
  .flow-card {
    grid-template-columns: 1fr;
  }

  .select-panel {
    border-right: 0;
    border-bottom: 1px solid #dbe3ed;
  }
}

@media (max-width: 680px) {
  .flow-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .flow-heading h1 {
    font-size: 30px;
  }

  .select-panel,
  .detail-panel {
    padding: 22px;
  }

  .flow-actions {
    flex-wrap: wrap;
  }
}
</style>
