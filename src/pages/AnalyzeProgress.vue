<template>
  <section class="progress-page">
    <header class="progress-hero">
      <div class="hero-copy">
        <span>Project Analysis</span>
        <h1>{{ isComplete ? '项目分析完成' : errorMsg ? '分析遇到问题' : '正在分析项目' }}</h1>
        <p>{{ statusDescription }}</p>
      </div>
      <div class="hero-status" :class="{ complete: isComplete, error: Boolean(errorMsg) }">
        <div class="scan-ring" :style="{ '--progress': `${progressPercent}%` }">
          <el-icon v-if="isComplete"><CircleCheckFilled /></el-icon>
          <el-icon v-else-if="errorMsg"><CircleCloseFilled /></el-icon>
          <el-icon v-else><Loading /></el-icon>
        </div>
        <strong>{{ progressPercent }}%</strong>
        <span>{{ currentStepTitle }}</span>
      </div>
    </header>

    <section class="summary-grid">
      <div class="summary-card">
        <small>当前阶段</small>
        <strong>{{ currentStepTitle }}</strong>
        <span>{{ steps[currentStep]?.description || '等待分析进度更新' }}</span>
      </div>
      <div class="summary-card">
        <small>已记录日志</small>
        <strong>{{ logs.length }}</strong>
        <span>实时同步分析过程</span>
      </div>
      <div class="summary-card">
        <small>扫描文件</small>
        <strong>{{ resultData?.files?.length || 0 }}</strong>
        <span>完成后进入结果页查看详情</span>
      </div>
    </section>

    <section class="workspace-grid">
      <div class="panel-card steps-panel">
        <div class="panel-head">
          <div>
            <span>Workflow</span>
            <h2>分析流程</h2>
          </div>
          <el-tag :type="isComplete ? 'success' : errorMsg ? 'danger' : 'primary'" round>
            {{ isComplete ? '已完成' : errorMsg ? '失败' : '进行中' }}
          </el-tag>
        </div>

        <div class="custom-steps">
          <div
            v-for="(step, index) in steps"
            :key="index"
            class="custom-step"
            :class="{
              active: index === currentStep && !isComplete && !errorMsg,
              done: index < currentStep || isComplete,
              error: Boolean(errorMsg) && index === currentStep,
            }"
          >
            <div class="step-marker">
              <el-icon v-if="index < currentStep || isComplete"><Check /></el-icon>
              <el-icon v-else-if="errorMsg && index === currentStep"><Close /></el-icon>
              <span v-else>{{ index + 1 }}</span>
            </div>
            <div class="step-copy">
              <strong>{{ step.title }}</strong>
              <p>{{ step.description || getStepHint(index) }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-card log-panel">
        <div class="panel-head">
          <div>
            <span>Runtime Log</span>
            <h2>分析日志</h2>
          </div>
        </div>
        <ProgressLog :logs="logs" />
      </div>
    </section>

    <section v-if="isComplete" class="result-card success-card">
      <el-result icon="success" title="分析完成">
        <template #sub-title>
          <p>项目分析已完成，共处理 {{ resultData?.files?.length || 0 }} 个文件，交接文档已生成。</p>
        </template>
        <template #extra>
          <el-button type="primary" size="large" :icon="View" @click="viewResults">
            查看结果
          </el-button>
        </template>
      </el-result>
    </section>

    <section v-if="errorMsg" class="result-card error-card">
      <el-result icon="error" title="分析失败">
        <template #sub-title>
          <p>{{ errorMsg }}</p>
        </template>
        <template #extra>
          <el-button :icon="ArrowLeft" @click="goBack">返回配置</el-button>
        </template>
      </el-result>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Loading, CircleCheckFilled, CircleCloseFilled, Check, Close, View, ArrowLeft } from '@element-plus/icons-vue'
import type { AnalyzeProgress } from '@electron/types'
import ProgressLog from '../components/ProgressLog.vue'
import electronAPI from '../api/electron'
import store from '../store'

const router = useRouter()

const steps = ref([
  { title: '正在读取项目目录', description: '' },
  { title: '正在识别项目语言', description: '' },
  { title: '正在识别项目框架', description: '' },
  { title: '正在读取 Git 提交记录', description: '' },
  { title: '正在统计用户提交文件', description: '' },
  { title: '正在扫描关键代码文件', description: '' },
  { title: '正在生成结构化分析结果', description: '' },
  { title: '正在生成交接文档', description: '' },
  { title: '分析完成', description: '' },
])

const currentStep = ref(0)
const logs = ref<Array<{ time: string; message: string }>>([])
const isComplete = ref(false)
const errorMsg = ref('')
const resultData = ref<any>(null)
let removeProgressListener: (() => void) | undefined
let lastProgressMessage = ''

const progressPercent = computed(() => {
  if (errorMsg.value) return Math.round((currentStep.value / (steps.value.length - 1)) * 100)
  if (isComplete.value) return 100
  return Math.max(4, Math.round((currentStep.value / (steps.value.length - 1)) * 100))
})

const currentStepTitle = computed(() => steps.value[currentStep.value]?.title || '准备分析')
const documentFormatLabel = computed(() => (store.analyzeConfig.outputFormat || 'markdown').toUpperCase())

const statusDescription = computed(() => {
  if (errorMsg.value) return '请查看错误信息，返回配置页调整后可以重新发起分析。'
  if (isComplete.value) return `结构化分析和 ${documentFormatLabel.value} 交接文档均已完成，可以进入结果页查看详情。`
  return '正在读取项目结构、Git 贡献和关键代码信息，请保持窗口打开。'
})

const getStepHint = (index: number): string => {
  if (index < currentStep.value || isComplete.value) return '已完成'
  if (index === currentStep.value) return '正在执行该阶段'
  return '等待执行'
}

const addLog = (message: string) => {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  logs.value.push({ time, message })
}

function mapStageToStep(stage: string): number {
  const stageMap: Record<string, number> = {
    'detectLanguages': 1,
    'detectFrameworks': 2,
    'scanModules': 3,
    'scanFiles': 5,
    'scanKeyFiles': 5,
    'projectProfile': 6,
    'astAnalysis': 6,
    'gitAuthors': 3,
    'gitCommits': 4,
    'gitAnalysis': 6,
    'complete': 8,
  }
  return stageMap[stage] ?? currentStep.value
}

const handleAnalyzeProgress = (progress: AnalyzeProgress) => {
  const stepIndex = mapStageToStep(progress.stage)
  currentStep.value = Math.max(currentStep.value, stepIndex)

  if (steps.value[stepIndex]) {
    steps.value[stepIndex].description = progress.message
  }

  if (progress.message && progress.message !== lastProgressMessage) {
    addLog(progress.message)
    lastProgressMessage = progress.message
  }
}

const runAnalysis = async () => {
  const config = store.analyzeConfig
  if (!config.projectPath) {
    errorMsg.value = '缺少项目路径配置'
    return
  }

  try {
    // Build time range
    let since: string | undefined
    const now = new Date()
    if (config.timeRange === '3months') {
      since = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split('T')[0]
    } else if (config.timeRange === '6months') {
      since = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).toISOString().split('T')[0]
    } else if (config.timeRange === '1year') {
      since = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0]
    } else if (config.timeRange === 'custom' && config.customStartDate) {
      since = config.customStartDate
    }

    currentStep.value = 0
    addLog('开始分析项目...')

    const result = await electronAPI.analyzeProject(config.projectPath, {
      localPath: config.projectPath,
      sourceType: 'local',
      branch: config.branch,
      enableGitAnalysis: config.gitEnabled ?? false,
      enableAiSummary: config.aiSummary ?? false,
      outputType: config.outputFormat || 'markdown',
      authorName: config.authorName,
      authorEmail: config.authorEmail,
      since,
      until: config.timeRange === 'custom' ? config.customEndDate : undefined,
    })

    if (config.aiSummary && config.aiProvider) {
      const providerLabel = `${config.aiProvider.name || 'AI 模型'}${config.aiProvider.type === 'cli' ? ' (CLI)' : ''}`
      addLog(`正在调用 ${providerLabel} 生成 AI 交接摘要...`)
      const aiResult = await electronAPI.aiSummarize(result, config.aiProvider)
      if (aiResult.success && aiResult.content?.trim()) {
        result.aiSummary = aiResult.content
        result.aiSummaryProvider = aiResult.provider || config.aiProvider.name
        addLog(`AI 交接摘要已生成：${result.aiSummaryProvider}，${aiResult.content.trim().length} 字`)
      } else {
        addLog(`${providerLabel} 未生成可写入摘要，已跳过：${aiResult.error || '未知错误'}`)
      }
    } else if (config.aiSummary) {
      addLog('未选择可用 AI 模型，已跳过 AI 交接摘要')
    }

    resultData.value = result

    // Update step descriptions based on results
    if (result.languages?.length > 0) {
      steps.value[1].description = `识别到 ${result.languages.map((l: any) => l.language).join(', ')}`
    }
    if (result.frameworks?.length > 0) {
      steps.value[2].description = `识别到 ${result.frameworks.map((f: any) => f.name).join(', ')}`
    }
    if (result.git?.authors?.length > 0) {
      steps.value[3].description = `已读取 ${result.git.authors.length} 位提交者`
    }
    if (result.git?.selectedAuthor?.changedFiles?.length > 0) {
      steps.value[4].description = `已统计 ${result.git.selectedAuthor.changedFiles.length} 个文件`
    }
    steps.value[5].description = `已扫描 ${result.files?.length || 0} 个文件`
    steps.value[6].description = '结构化数据已生成'

    // Generate the document
    currentStep.value = 7
    const outputFormat = config.outputFormat || 'markdown'
    const outputExtension = getOutputExtension(outputFormat)
    steps.value[7].description = `正在写入 ${outputFormat.toUpperCase()} 交接文档`
    addLog('正在生成交接文档...')
    const outputPath = `${config.projectPath}/handover_${result.projectName}${outputExtension}`
    result.documentFormat = outputFormat
    const docPath = await electronAPI.generateDocument(result, outputPath)
    steps.value[7].description = `文档已生成: ${docPath}`
    addLog(`文档已生成: ${docPath}`)

    result.documentPath = docPath
    currentStep.value = 8
    steps.value[8].description = '全部完成'

    store.setAnalysisResult({
      ...result,
      documentPath: docPath,
    })

    isComplete.value = true
    addLog('分析完成！')
  } catch (err) {
    errorMsg.value = (err as Error).message || '分析过程中发生错误'
    addLog(`错误: ${errorMsg.value}`)
  }
}

const viewResults = () => {
  router.push('/result')
}

const goBack = () => {
  router.back()
}

const getOutputExtension = (format: 'markdown' | 'html' | 'pdf'): string => {
  if (format === 'html') return '.html'
  if (format === 'pdf') return '.pdf'
  return '.md'
}

onMounted(() => {
  removeProgressListener = electronAPI.onAnalyzeProgress(handleAnalyzeProgress)
  runAnalysis()
})

onUnmounted(() => {
  removeProgressListener?.()
})
</script>

<style scoped>
.progress-page {
  max-width: 1240px;
  margin: 0 auto;
  display: grid;
  gap: 24px;
}

.progress-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 24px;
  padding: 30px;
  border: 1px solid rgba(203, 213, 225, 0.84);
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 10%, rgba(37, 99, 235, 0.16), transparent 32%),
    radial-gradient(circle at 80% 0%, rgba(8, 145, 178, 0.14), transparent 30%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.9));
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.1);
}

.hero-copy span,
.panel-head span {
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.hero-copy h1 {
  margin: 10px 0 12px;
  color: #0f172a;
  font-size: 40px;
  line-height: 1.1;
}

.hero-copy p {
  max-width: 720px;
  margin: 0;
  color: #475569;
  font-size: 15px;
  line-height: 1.8;
}

.hero-status {
  padding: 20px;
  border: 1px solid #dbeafe;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.86);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
}

.scan-ring {
  width: 76px;
  height: 76px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #2563eb;
  font-size: 34px;
  background: conic-gradient(from 90deg, #2563eb var(--progress, 70%), #e2e8f0 0);
  position: relative;
}

.scan-ring::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: inherit;
  background: #ffffff;
}

.scan-ring .el-icon {
  position: relative;
  z-index: 1;
  animation: spin 1.15s linear infinite;
}

.hero-status.complete .scan-ring,
.hero-status.complete .scan-ring .el-icon {
  color: #059669;
  background: #dcfce7;
  animation: none;
}

.hero-status.error .scan-ring,
.hero-status.error .scan-ring .el-icon {
  color: #dc2626;
  background: #fee2e2;
  animation: none;
}

.hero-status.complete .scan-ring .el-icon,
.hero-status.error .scan-ring .el-icon {
  animation: none;
}

.hero-status strong {
  color: #0f172a;
  font-size: 30px;
  line-height: 1;
}

.hero-status span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr 0.7fr;
  gap: 16px;
}

.summary-card,
.panel-card,
.result-card {
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.07);
}

.summary-card {
  padding: 20px;
  display: grid;
  gap: 8px;
}

.summary-card small {
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
}

.summary-card strong {
  color: #0f172a;
  font-size: 24px;
  line-height: 1.2;
}

.summary-card span {
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.95fr) minmax(0, 1.05fr);
  gap: 16px;
  align-items: start;
}

.panel-card {
  padding: 24px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.panel-head h2 {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 22px;
}

.custom-steps {
  display: grid;
  gap: 12px;
}

.custom-step {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.custom-step.active {
  border-color: #93c5fd;
  background: #eff6ff;
  box-shadow: 0 14px 34px rgba(37, 99, 235, 0.12);
}

.custom-step.done {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.custom-step.error {
  border-color: #fecaca;
  background: #fef2f2;
}

.step-marker {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #64748b;
  background: #e2e8f0;
  font-size: 14px;
  font-weight: 800;
}

.custom-step.active .step-marker {
  color: #ffffff;
  background: #2563eb;
}

.custom-step.done .step-marker {
  color: #ffffff;
  background: #059669;
}

.custom-step.error .step-marker {
  color: #ffffff;
  background: #dc2626;
}

.step-copy strong {
  display: block;
  color: #0f172a;
  font-size: 15px;
  line-height: 1.4;
}

.step-copy p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
}

.log-panel :deep(.progress-log-container) {
  border-radius: 16px;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);
}

.log-panel :deep(.log-content) {
  max-height: 520px;
}

.result-card {
  padding: 8px;
}

.success-card {
  border-color: #bbf7d0;
}

.error-card {
  border-color: #fecaca;
}

:deep(.el-button) {
  cursor: pointer;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .scan-ring .el-icon {
    animation: none;
  }
}

@media (max-width: 1080px) {
  .progress-hero,
  .workspace-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .progress-hero,
  .panel-card,
  .summary-card {
    padding: 18px;
    border-radius: 18px;
  }

  .hero-copy h1 {
    font-size: 30px;
  }
}
</style>
