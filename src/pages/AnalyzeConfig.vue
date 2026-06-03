<template>
  <section class="config-page">
    <div class="config-heading">
      <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
      <div>
        <span>Analyze Config</span>
        <h1>分析配置</h1>
      </div>
    </div>

    <div class="config-layout">
      <aside class="summary-sidebar">
        <section class="project-summary">
          <div class="summary-icon">
            <el-icon><FolderOpened /></el-icon>
          </div>
          <span class="summary-eyebrow">Selected Project</span>
          <h2>{{ projectName }}</h2>
          <p>{{ config.projectPath }}</p>
          <div class="summary-meta">
            <span>分支</span>
            <strong>{{ config.branch || '-' }}</strong>
          </div>
          <div class="summary-meta">
            <span>Git 分析</span>
            <el-tag :type="config.gitEnabled ? 'success' : 'info'">
              {{ config.gitEnabled ? '启用' : '禁用' }}
            </el-tag>
          </div>
        </section>

        <section class="execution-card">
          <div class="execution-head">
            <el-icon><Document /></el-icon>
            <div>
              <span>Execution Plan</span>
              <strong>即将执行</strong>
            </div>
          </div>
          <ul class="task-list">
            <li v-for="item in taskSummary" :key="item.label" :class="{ muted: !item.enabled }">
              <el-icon><Check /></el-icon>
              <span>{{ item.label }}</span>
            </li>
          </ul>
          <el-alert
            v-if="config.aiSummary && readyProviderCount === 0"
            title="尚未配置可用 AI 模型，AI 摘要将无法执行。"
            type="warning"
            :closable="false"
            show-icon
          />
          <div class="config-actions">
            <el-button class="primary-action" type="primary" size="large" :icon="VideoPlay" @click="startAnalyze">
              开始分析
            </el-button>
            <el-button class="secondary-action" size="large" :icon="ArrowLeft" @click="goBack">
              返回上一步
            </el-button>
          </div>
        </section>
      </aside>

      <main class="config-panel">
        <section class="settings-card">
          <div class="section-title">
            <el-icon><User /></el-icon>
            <h2>贡献人范围</h2>
            <p>按 Git 作者和时间范围聚焦交接责任边界。</p>
          </div>
          <el-form label-position="top">
            <el-form-item label="启用 Git 作者分析">
              <el-switch v-model="config.gitEnabled" active-text="启用" inactive-text="禁用" @change="handleGitToggle" />
            </el-form-item>

            <template v-if="config.gitEnabled">
              <el-form-item label="选择交接人">
                <AuthorSelect
                  :localPath="config.projectPath || ''"
                  @update:author-name="handleAuthorNameUpdate"
                  @update:author-email="handleAuthorEmailUpdate"
                />
              </el-form-item>

              <el-form-item label="时间范围">
                <el-select v-model="config.timeRange" class="compact-control">
                  <el-option label="全部时间" value="all" />
                  <el-option label="最近 3 个月" value="3months" />
                  <el-option label="最近 6 个月" value="6months" />
                  <el-option label="最近 1 年" value="1year" />
                  <el-option label="自定义" value="custom" />
                </el-select>
              </el-form-item>

              <el-form-item v-if="config.timeRange === 'custom'" label="自定义时间">
                <el-date-picker
                  v-model="customDateRange"
                  class="custom-date-range"
                  type="daterange"
                  range-separator="至"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  value-format="YYYY-MM-DD"
                  @change="handleDateRangeChange"
                />
              </el-form-item>
            </template>
          </el-form>
        </section>

        <section class="settings-card">
          <div class="section-title">
            <el-icon><Connection /></el-icon>
            <h2>AI 摘要</h2>
            <p>使用已配置模型补充交接重点和风险提示。</p>
          </div>
          <el-form label-position="top">
            <el-form-item label="启用 AI 总结">
              <el-switch v-model="config.aiSummary" active-text="启用" inactive-text="禁用" />
            </el-form-item>

            <el-form-item v-if="config.aiSummary" label="AI 模型">
              <div class="provider-row">
                <el-select v-model="selectedProviderIndex" placeholder="选择 AI 模型">
                  <el-option
                    v-for="(provider, index) in availableProviders"
                    :key="index"
                    :label="provider.label"
                    :value="index"
                    :disabled="provider.disabled"
                  />
                </el-select>
                <el-button type="primary" plain @click="goAiConfig">管理设置</el-button>
              </div>
              <el-alert
                v-if="selectedProviderHint"
                class="provider-hint"
                :title="selectedProviderHint"
                :type="selectedProviderReady ? 'success' : 'warning'"
                :closable="false"
                show-icon
              />
            </el-form-item>
          </el-form>
        </section>

        <section class="settings-card">
          <div class="section-title">
            <el-icon><Document /></el-icon>
            <h2>输出设置</h2>
            <p>当前推荐导出 Markdown，便于二次编辑和团队归档。</p>
          </div>
          <div class="output-format-grid" role="radiogroup" aria-label="输出格式">
            <button
              v-for="format in outputFormats"
              :key="format.value"
              class="output-format-option"
              :class="{ active: config.outputFormat === format.value }"
              type="button"
              role="radio"
              :aria-checked="config.outputFormat === format.value"
              @click="config.outputFormat = format.value"
            >
              <span>{{ format.extension }}</span>
              <strong>{{ format.label }}</strong>
              <small>{{ format.description }}</small>
            </button>
          </div>
        </section>

      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, Connection, Document, FolderOpened, User, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import AuthorSelect from '../components/AuthorSelect.vue'
import electronAPI from '../api/electron'
import store from '../store'

const router = useRouter()

const config = reactive({
  projectPath: '',
  branch: '',
  gitEnabled: true,
  authorName: '',
  authorEmail: '',
  timeRange: 'all' as 'all' | '3months' | '6months' | '1year' | 'custom',
  customStartDate: '',
  customEndDate: '',
  aiSummary: false,
  aiProvider: null as any,
  outputFormat: 'markdown' as OutputFormat,
})

type OutputFormat = 'markdown' | 'html' | 'pdf'

const customDateRange = ref<string[]>([])
const allProviders = ref<any[]>([])
const selectedProviderIndex = ref(0)
const outputFormats: Array<{ value: OutputFormat; label: string; extension: string; description: string }> = [
  { value: 'markdown', label: 'Markdown', extension: '.md', description: '方便继续编辑' },
  { value: 'html', label: 'HTML', extension: '.html', description: '适合浏览器阅读' },
  { value: 'pdf', label: 'PDF', extension: '.pdf', description: '适合归档分享' },
]

const projectName = computed(() => {
  const path = config.projectPath.replace(/\\/g, '/')
  return path.split('/').filter(Boolean).pop() || '未选择项目'
})

const availableProviders = computed(() => {
  return allProviders.value.map((provider, index) => ({
    ...provider,
    label: provider.type === 'cli'
      ? `${provider.name} (CLI${provider.ready ? '' : ` - ${getCliStatusLabel(provider)}`})`
      : `${provider.name || `自定义模型 ${index + 1}`} - ${provider.model || '未填写模型'} [${provider.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI'}]`,
    disabled: provider.type === 'cli' && !provider.ready,
  }))
})

const selectedProvider = computed(() => allProviders.value[selectedProviderIndex.value] || null)

const selectedProviderReady = computed(() => {
  if (!selectedProvider.value) return false
  return selectedProvider.value.type !== 'cli' || selectedProvider.value.ready
})

const selectedProviderHint = computed(() => {
  const provider = selectedProvider.value
  if (!provider || provider.type !== 'cli') return ''
  return provider.message || (provider.ready ? 'CLI 已通过检测，可用于生成 AI 摘要' : 'CLI 当前不可用于生成 AI 摘要')
})

const readyProviderCount = computed(() => {
  return allProviders.value.filter(provider => provider.type !== 'cli' || provider.ready).length
})

function getCliStatusLabel(provider: any): string {
  if (provider.ready) return '可用'
  if (provider.status === 'missing') return '未安装'
  if (provider.status === 'auth-required') return '需认证'
  return '不可用'
}

function selectFirstReadyProvider(): void {
  const index = allProviders.value.findIndex(provider => provider.type !== 'cli' || provider.ready)
  selectedProviderIndex.value = index >= 0 ? index : 0
}

const taskSummary = computed(() => [
  { label: '扫描项目结构与关键文件', enabled: true },
  { label: '识别语言、框架和运行命令', enabled: true },
  { label: '分析 Git 提交与贡献范围', enabled: config.gitEnabled },
  { label: '聚焦指定贡献人代码范围', enabled: Boolean(config.authorName) },
  { label: '生成 AI 交接摘要', enabled: config.aiSummary },
  { label: `导出 ${config.outputFormat.toUpperCase()} 交接文档`, enabled: true },
])

onMounted(async () => {
  const savedConfig = store.analyzeConfig
  if (savedConfig?.projectPath) {
    Object.assign(config, savedConfig)
  } else {
    router.push('/')
    return
  }

  try {
    const cliProviders = await electronAPI.detectCliProviders()
    const savedProviders = await electronAPI.loadAiProviders()
    const providers: any[] = []

    for (const provider of cliProviders) {
      providers.push({
        type: 'cli',
        name: provider.name,
        cliCommand: provider.cliCommand,
        enabled: true,
        available: provider.available,
        ready: provider.ready,
        status: provider.status,
        message: provider.message,
        version: provider.version,
      })
    }

    for (const provider of savedProviders) {
      if (provider.type === 'custom') providers.push(provider)
    }

    allProviders.value = providers
    selectFirstReadyProvider()
  } catch {
    allProviders.value = []
  }
})

const handleGitToggle = (enabled: boolean) => {
  if (!enabled) {
    config.authorName = ''
    config.authorEmail = ''
    config.timeRange = 'all'
  }
}

const handleAuthorNameUpdate = (name: string) => {
  config.authorName = name
}

const handleAuthorEmailUpdate = (email: string) => {
  config.authorEmail = email
}

const handleDateRangeChange = (dates: string[]) => {
  if (dates && dates.length === 2) {
    config.customStartDate = dates[0]
    config.customEndDate = dates[1]
  }
}

const normalizeProvider = (provider: any) => {
  if (!provider) return null
  return {
    type: provider.type,
    name: provider.name,
    cliCommand: provider.cliCommand,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: provider.model,
    protocol: provider.protocol,
    enabled: provider.enabled,
  }
}

const goAiConfig = () => {
  store.setAnalyzeConfig({ ...config })
  router.push('/settings')
}

const goBack = () => router.back()

const startAnalyze = () => {
  if (config.aiSummary) {
    if (readyProviderCount.value === 0) {
      config.aiProvider = null
      ElMessage.warning('没有可用于生成 AI 摘要的模型；请先完成 CLI 登录或配置自定义 API')
      return
    } else if (!selectedProviderReady.value) {
      ElMessage.warning(selectedProviderHint.value || '当前选择的 AI 模型不可用，请先完成配置或认证')
      return
    } else {
      config.aiProvider = normalizeProvider(allProviders.value[selectedProviderIndex.value])
    }
  } else {
    config.aiProvider = null
  }

  store.setAnalyzeConfig({
    ...config,
    aiProvider: normalizeProvider(config.aiProvider),
  })
  router.push('/analyze-progress')
}
</script>

<style scoped>
.config-page {
  max-width: 1240px;
  margin: 0 auto;
  display: grid;
  gap: 24px;
}

.config-heading {
  display: flex;
  align-items: flex-end;
  gap: 18px;
}

.config-heading span,
.summary-eyebrow {
  color: #2563eb;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.config-heading h1 {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 38px;
  line-height: 1.12;
}

.config-layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.summary-sidebar {
  position: sticky;
  top: 24px;
  display: grid;
  gap: 16px;
}

.project-summary,
.execution-card,
.settings-card {
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.07);
}

.project-summary {
  padding: 28px;
}

.summary-icon {
  width: 68px;
  height: 68px;
  margin-bottom: 18px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: #ffffff;
  font-size: 34px;
  background: linear-gradient(135deg, #2563eb, #20c5bd);
  box-shadow: 0 18px 34px rgba(37, 99, 235, 0.22);
}

.project-summary h2 {
  margin: 8px 0 8px;
  color: #0f172a;
  font-size: 25px;
  line-height: 1.25;
}

.project-summary p {
  margin: 0 0 20px;
  color: #475569;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
}

.summary-meta {
  min-height: 54px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-meta span {
  color: #64748b;
}

.summary-meta strong {
  color: #0f172a;
}

.execution-card {
  padding: 22px;
}

.execution-head {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.execution-head > .el-icon {
  width: 40px;
  height: 40px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  color: #2563eb;
  background: #dbeafe;
  font-size: 20px;
}

.execution-head span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.execution-head strong {
  color: #0f172a;
  font-size: 18px;
}

.task-list {
  margin: 0 0 14px;
  padding: 0;
  display: grid;
  gap: 10px;
  list-style: none;
}

.task-list li {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #334155;
  font-size: 14px;
  font-weight: 700;
}

.task-list .el-icon {
  color: #059669;
}

.task-list li.muted {
  color: #94a3b8;
}

.task-list li.muted .el-icon {
  color: #cbd5e1;
}

.config-panel {
  display: grid;
  gap: 20px;
}

.settings-card {
  padding: 28px 30px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.settings-card:hover {
  border-color: #bfdbfe;
  box-shadow: 0 20px 46px rgba(37, 99, 235, 0.1);
}

.section-title {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 4px;
  align-items: center;
  margin-bottom: 20px;
}

.section-title .el-icon {
  grid-row: span 2;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: #2563eb;
  background: #eff6ff;
  font-size: 20px;
}

.section-title h2 {
  margin: 0;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.2;
}

.section-title p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.compact-control {
  width: 240px;
}

.custom-date-range {
  width: 420px;
  max-width: 100%;
}

.provider-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 12px;
}

.provider-hint {
  margin-top: 12px;
}

.settings-card :deep(.el-form-item__label) {
  color: #334155;
  font-weight: 700;
  line-height: 1.35;
  margin-bottom: 9px;
  padding: 0;
}

.settings-card :deep(.el-form) {
  display: grid;
  gap: 18px;
}

.settings-card :deep(.el-form-item) {
  margin-bottom: 0;
}

.settings-card :deep(.el-input__wrapper),
.settings-card :deep(.el-select__wrapper) {
  min-height: 46px;
  border-radius: 12px;
}

.settings-card :deep(.custom-date-range.el-range-editor.el-input__wrapper) {
  min-height: 46px;
  padding: 0 14px;
  border-radius: 12px;
}

.settings-card :deep(.custom-date-range .el-range-input) {
  font-size: 14px;
}

.settings-card :deep(.custom-date-range .el-range-separator) {
  flex: 0 0 auto;
  padding: 0 12px;
  color: #64748b;
}

.output-format-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.output-format-option {
  min-height: 86px;
  padding: 13px 15px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 10px;
  text-align: left;
  color: #334155;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.output-format-option:hover {
  border-color: #93c5fd;
  background: #f8fbff;
  transform: translateY(-1px);
}

.output-format-option.active {
  border-color: #2563eb;
  color: #1d4ed8;
  background: #eff6ff;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.14);
}

.output-format-option strong {
  font-size: 15px;
}

.output-format-option span {
  grid-column: 2;
  grid-row: 1;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 800;
}

.output-format-option small {
  grid-column: 1 / -1;
  color: #64748b;
  font-size: 12px;
}

.config-actions {
  display: grid;
  gap: 9px;
  width: 100%;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.config-actions :deep(.el-button) {
  width: 100%;
  height: 42px;
  margin-left: 0;
  border-radius: 10px;
  font-weight: 700;
}

.config-actions :deep(.secondary-action) {
  color: #475569;
  border-color: #cbd5e1;
  background: #ffffff;
}

.config-actions :deep(.secondary-action:hover) {
  color: #2563eb;
  border-color: #93c5fd;
  background: #eff6ff;
}

.config-actions :deep(.primary-action) {
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2);
}

:deep(.el-button),
:deep(.el-switch) {
  cursor: pointer;
}

@media (max-width: 1020px) {
  .config-layout {
    grid-template-columns: 1fr;
  }

  .summary-sidebar {
    position: static;
  }
}

@media (max-width: 680px) {
  .config-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .config-heading h1 {
    font-size: 30px;
  }

  .settings-card,
  .project-summary,
  .execution-card {
    padding: 18px;
    border-radius: 18px;
  }

  .provider-row {
    grid-template-columns: 1fr;
  }

  .compact-control {
    width: 100%;
  }

  .custom-date-range {
    width: 100%;
  }

  .output-format-grid {
    grid-template-columns: 1fr;
  }

}
</style>
