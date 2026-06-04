<template>
  <section class="flow-page">
    <div class="flow-heading">
      <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
      <div>
        <span>Remote Repository</span>
        <h1>从远程仓库拉取</h1>
      </div>
    </div>

    <div class="repo-layout">
      <aside class="repo-aside">
        <div class="repo-icon">
          <el-icon><Download /></el-icon>
        </div>
        <span>Clone Workflow</span>
        <h2>远程仓库导入</h2>
        <p>输入 Git 仓库地址、选择本地保存位置后，CodeHandover 会自动拉取代码并进入分析配置。</p>
        <ul>
          <li><el-icon><Check /></el-icon> 支持 Gitee、GitHub、GitLab 和自建 Git</li>
          <li><el-icon><Check /></el-icon> 支持私有仓库 Token</li>
          <li><el-icon><Check /></el-icon> 自动识别默认保存目录</li>
          <li><el-icon><Check /></el-icon> 可选择远程分支</li>
        </ul>
      </aside>

      <div class="repo-card">
        <el-form :model="form" label-position="top" class="repo-form">
        <el-form-item label="仓库地址" required>
          <el-input
            v-model="form.repoUrl"
            placeholder="https://gitee.com/company/project.git"
            clearable
            @input="handleUrlInput"
          >
            <template #prefix>
              <el-icon><Link /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="访问令牌">
          <el-input v-model="form.token" type="password" show-password placeholder="私有仓库可填写 Token" clearable>
            <template #prefix>
              <el-icon><Key /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="本地保存父目录" required>
          <div class="directory-row">
            <el-input v-model="form.parentPath" readonly placeholder="选择用于保存仓库的父目录">
              <template #prefix>
                <el-icon><Folder /></el-icon>
              </template>
            </el-input>
            <el-button
              class="form-action-button directory-button"
              :loading="selectingDirectory"
              @click="handleSelectDirectory"
            >
              {{ selectingDirectory ? '选择中' : '选择目录' }}
            </el-button>
          </div>
          <p v-if="form.localPath" class="clone-target">将克隆到：{{ form.localPath }}</p>
        </el-form-item>

        <el-form-item label="分支">
          <div class="branch-row">
            <el-select
              v-model="form.branch"
              placeholder="选择分支"
              :disabled="!form.repoUrl || loadingBranches"
              :loading="loadingBranches"
            >
              <el-option v-for="branch in branches" :key="branch" :label="branch" :value="branch" />
            </el-select>
            <el-button
              class="form-action-button"
              :icon="Refresh"
              :disabled="!form.repoUrl"
              :loading="loadingBranches"
              @click="handleFetchBranches"
            >
              获取分支
            </el-button>
          </div>
          <el-alert
            v-if="branchFetchError"
            class="branch-error"
            :title="branchFetchError"
            type="warning"
            :closable="false"
            show-icon
          />
        </el-form-item>
      </el-form>

      <el-alert
        v-if="cloneProgress"
        :title="cloneProgress"
        type="info"
        :closable="false"
        show-icon
        class="progress-alert"
      >
        <el-progress :percentage="clonePercentage" :stroke-width="8" />
      </el-alert>

        <div class="flow-actions">
          <el-button :disabled="cloning" @click="goBack">取消</el-button>
          <el-button
            type="primary"
            :loading="cloning"
            :disabled="!form.repoUrl || !form.parentPath || cloning"
            @click="handleCloneAndAnalyze"
          >
            {{ cloning ? '拉取中...' : '拉取并分析' }}
          </el-button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, Download, Folder, Key, Link, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import electronAPI from '../api/electron'
import store from '../store'

const router = useRouter()

const form = ref({
  repoUrl: '',
  token: '',
  parentPath: '',
  localPath: '',
  branch: '',
})

const branches = ref<string[]>([])
const selectingDirectory = ref(false)
const loadingBranches = ref(false)
const cloning = ref(false)
const cloneProgress = ref('')
const clonePercentage = ref(0)
const branchFetchError = ref('')

const goBack = () => router.push('/')

const handleSelectDirectory = async () => {
  if (selectingDirectory.value) return

  selectingDirectory.value = true
  try {
    const path = await electronAPI.selectDirectory()
    if (path) {
      form.value.parentPath = path
      await refreshCloneTarget()
    }
  } catch (error) {
    ElMessage.error('选择目录失败')
    console.error(error)
  } finally {
    selectingDirectory.value = false
  }
}

const handleUrlInput = () => {
  branches.value = []
  form.value.branch = ''
  branchFetchError.value = ''
  refreshCloneTarget()
}

const refreshCloneTarget = async () => {
  if (!form.value.parentPath || !form.value.repoUrl) {
    form.value.localPath = ''
    return
  }

  form.value.localPath = await electronAPI.getDefaultCloneDirectory(
    form.value.parentPath,
    form.value.repoUrl
  )
}

const handleFetchBranches = async () => {
  const repoUrl = form.value.repoUrl.trim()
  if (!repoUrl) {
    ElMessage.warning('请先输入仓库地址')
    return
  }

  branchFetchError.value = ''
  loadingBranches.value = true
  try {
    const result = await electronAPI.getRemoteBranches(
      repoUrl,
      form.value.token || undefined
    )
    if (result.error) {
      throw new Error(result.error)
    }
    branches.value = result.branches
    if (branches.value.length > 0) {
      form.value.branch = result.currentBranch || branches.value[0]
      ElMessage.success(`已获取 ${branches.value.length} 个分支`)
    } else {
      branchFetchError.value = '未获取到远程分支，请确认仓库地址、访问权限或仓库是否为空。'
      ElMessage.warning(branchFetchError.value)
    }
  } catch (error) {
    branchFetchError.value = (error as Error).message || '获取分支失败，请检查仓库地址、网络连接和 Token'
    ElMessage.error('获取分支失败')
    console.error(error)
  } finally {
    loadingBranches.value = false
  }
}

const handleCloneAndAnalyze = async () => {
  if (!form.value.repoUrl || !form.value.parentPath || !form.value.localPath) {
    ElMessage.warning('请填写完整的仓库信息')
    return
  }

  cloning.value = true
  cloneProgress.value = '正在连接远程仓库...'
  clonePercentage.value = 15

  try {
    cloneProgress.value = '正在拉取仓库代码...'
    clonePercentage.value = 45
    const result = await electronAPI.cloneRepo(
      form.value.repoUrl,
      form.value.localPath,
      form.value.branch || undefined,
      form.value.token || undefined
    )
    if (!result.success) {
      throw new Error(result.error || '未知错误')
    }

    clonePercentage.value = 100
    ElMessage.success('仓库拉取成功')

    store.clearConfig()
    store.setAnalyzeConfig({
      projectPath: form.value.localPath,
      branch: form.value.branch || 'main',
      gitEnabled: true,
    })

    setTimeout(() => router.push('/analyze-config'), 400)
  } catch (error) {
    ElMessage.error('拉取失败：' + (error as Error).message)
    console.error(error)
  } finally {
    cloning.value = false
    cloneProgress.value = ''
    clonePercentage.value = 0
  }
}
</script>

<style scoped>
.flow-page {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  gap: 24px;
}

.flow-heading {
  display: flex;
  align-items: flex-end;
  gap: 18px;
}

.flow-heading span,
.repo-aside > span {
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

.repo-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.repo-aside,
.repo-card {
  border: 1px solid rgba(203, 213, 225, 0.84);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.repo-aside {
  padding: 30px;
  position: sticky;
  top: 24px;
  overflow: hidden;
}

.repo-aside::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 42%);
  pointer-events: none;
}

.repo-aside > * {
  position: relative;
}

.repo-icon {
  width: 72px;
  height: 72px;
  margin-bottom: 20px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  color: #ffffff;
  font-size: 34px;
  background: linear-gradient(135deg, #2563eb, #20c5bd);
  box-shadow: 0 18px 34px rgba(37, 99, 235, 0.24);
}

.repo-aside h2 {
  margin: 10px 0 12px;
  color: #0f172a;
  font-size: 26px;
}

.repo-aside p {
  margin: 0 0 22px;
  color: #475569;
  line-height: 1.75;
}

.repo-aside ul {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
  list-style: none;
}

.repo-aside li {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #334155;
  font-size: 14px;
  font-weight: 700;
}

.repo-aside li .el-icon {
  color: #059669;
}

.repo-card {
  padding: 34px;
}

.repo-form {
  display: grid;
  gap: 6px;
}

.repo-form :deep(.el-form-item__label) {
  color: #334155;
  font-weight: 700;
}

.repo-form :deep(.el-input__wrapper),
.repo-form :deep(.el-select__wrapper) {
  min-height: 48px;
  border-radius: 12px;
}

.directory-row,
.branch-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px;
  gap: 12px;
  align-items: center;
}

.directory-row :deep(.el-input),
.branch-row :deep(.el-select) {
  width: 100%;
}

.form-action-button {
  width: 132px;
  height: 48px;
  border-radius: 12px;
  font-weight: 700;
  color: #2563eb;
  border-color: #bfdbfe;
  background: linear-gradient(180deg, #ffffff, #eff6ff);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}

.form-action-button:hover:not(.is-disabled) {
  color: #1d4ed8;
  border-color: #60a5fa;
  background: linear-gradient(180deg, #f8fbff, #dbeafe);
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.14);
}

.form-action-button:active:not(.is-disabled) {
  transform: translateY(1px) scale(0.99);
  box-shadow: inset 0 2px 6px rgba(37, 99, 235, 0.16);
}

.directory-button {
  color: #ffffff;
  border-color: transparent;
  background: linear-gradient(135deg, #2563eb, #20c5bd);
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.18);
}

.directory-button:hover:not(.is-disabled) {
  color: #ffffff;
  border-color: transparent;
  background: linear-gradient(135deg, #1d4ed8, #0ea5e9);
}

.progress-alert {
  margin-top: 18px;
  border-radius: 14px;
}

.branch-error {
  width: 100%;
  margin-top: 10px;
  border-radius: 12px;
}

.clone-target {
  width: 100%;
  margin: 8px 0 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

.flow-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 24px;
}

:deep(.el-button) {
  cursor: pointer;
}

@media (max-width: 980px) {
  .repo-layout {
    grid-template-columns: 1fr;
  }

  .repo-aside {
    position: static;
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

  .repo-card,
  .repo-aside {
    padding: 20px;
    border-radius: 18px;
  }

  .branch-row {
    grid-template-columns: 1fr;
  }

  .directory-row {
    grid-template-columns: 1fr;
  }

  .form-action-button {
    width: 100%;
  }

  .flow-actions {
    flex-wrap: wrap;
  }
}
</style>
