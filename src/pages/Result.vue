<template>
  <section class="result-page">
    <div class="result-heading">
      <el-button :icon="ArrowLeft" @click="goBack">返回首页</el-button>
      <div>
        <span>Analysis Result</span>
        <h1>分析结果</h1>
      </div>
    </div>

    <template v-if="result">
      <section class="result-hero">
        <div class="hero-main">
          <span class="hero-eyebrow">交接报告准备就绪</span>
          <h2>{{ result.projectName }}</h2>
          <p>{{ projectPath || '未识别项目路径' }}</p>
          <div class="hero-meta">
            <el-tag v-if="result.branch" effect="dark" round>{{ result.branch }}</el-tag>
            <el-tag effect="plain" round>{{ primaryLanguage }}</el-tag>
            <el-tag :type="result.documentPath ? 'success' : 'info'" round>
              {{ result.documentPath ? '文档已生成' : '待生成文档' }}
            </el-tag>
          </div>
        </div>

        <div class="hero-actions-card">
          <span>下一步</span>
          <strong>{{ result.documentPath ? '打开已生成的交接文档' : `生成 ${documentFormatLabel} 交接文档` }}</strong>
          <el-button
            type="primary"
            size="large"
            :loading="generating"
            :icon="Document"
            @click="handleGenerateDocument"
          >
            {{ result.documentPath ? '重新生成文档' : '生成交接文档' }}
          </el-button>
          <el-button
            v-if="result.documentPath"
            type="success"
            size="large"
            :icon="FolderOpened"
            @click="handleOpenDocument"
          >
            打开文档
          </el-button>
        </div>
      </section>

      <section class="metric-grid">
        <div class="metric-card">
          <span class="metric-icon blue"><el-icon><Connection /></el-icon></span>
          <small>主要语言</small>
          <strong>{{ primaryLanguage }}</strong>
          <em>{{ displayLanguages.length }} 种语言识别</em>
        </div>
        <div class="metric-card">
          <span class="metric-icon cyan"><el-icon><Document /></el-icon></span>
          <small>扫描文件</small>
          <strong>{{ fileCount }}</strong>
          <em>纳入结构分析</em>
        </div>
        <div class="metric-card">
          <span class="metric-icon purple"><el-icon><Files /></el-icon></span>
          <small>项目模块</small>
          <strong>{{ moduleCount }}</strong>
          <em>核心模块归类</em>
        </div>
        <div class="metric-card">
          <span class="metric-icon green"><el-icon><User /></el-icon></span>
          <small>Git 作者</small>
          <strong>{{ authorCount }}</strong>
          <em>贡献人统计</em>
        </div>
        <div class="metric-card">
          <span class="metric-icon orange"><el-icon><DataAnalysis /></el-icon></span>
          <small>AST 符号</small>
          <strong>{{ astSymbolCount }}</strong>
          <em>Tree-sitter 结构化识别</em>
        </div>
      </section>

      <section class="content-grid">
        <div class="panel-card span-2">
          <div class="panel-head">
            <div>
              <span>Tech Stack</span>
              <h2>技术栈识别</h2>
            </div>
          </div>

          <div v-if="result.frameworks?.length" class="framework-list">
            <div v-for="framework in result.frameworks" :key="framework.name" class="framework-item">
              <div class="framework-copy">
                <strong>{{ framework.name }}</strong>
                <span>识别置信度 {{ formatConfidence(framework.confidence) }}%</span>
              </div>
              <el-progress
                :percentage="formatConfidence(framework.confidence)"
                :stroke-width="10"
                :show-text="false"
                class="framework-progress"
              />
            </div>
          </div>
          <el-empty v-else description="暂未识别到明确框架" />
        </div>

        <div class="panel-card">
          <div class="panel-head compact">
            <div>
              <span>Languages</span>
              <h2>语言占比</h2>
            </div>
          </div>
          <div v-if="displayLanguages.length" class="language-list">
            <div v-for="lang in displayLanguages.slice(0, 6)" :key="getLanguageName(lang)" class="language-row">
              <span>{{ getLanguageName(lang) }}</span>
              <strong>{{ formatPercentage(lang) }}%</strong>
            </div>
          </div>
          <el-empty v-else description="暂无语言统计" />
        </div>
      </section>

      <section v-if="result.ast" class="panel-card">
        <div class="panel-head">
          <div>
            <span>Tree-sitter AST</span>
            <h2>语言结构分析</h2>
          </div>
        </div>
        <div class="ast-summary">
          <el-tag type="primary">解析文件 {{ result.ast.parsedFileCount }}</el-tag>
          <el-tag type="success">符号 {{ result.ast.symbolCount }}</el-tag>
          <el-tag type="warning">导入 {{ result.ast.importCount }}</el-tag>
          <el-tag type="info">调用 {{ result.ast.callCount }}</el-tag>
          <el-tag type="danger">关系 {{ astRelationshipCount }}</el-tag>
        </div>
        <el-table v-if="result.ast.files.length" :data="result.ast.files.slice(0, 20)" border class="data-table ast-table">
          <el-table-column prop="path" label="源码文件" min-width="220" />
          <el-table-column prop="language" label="语言" width="100" />
          <el-table-column label="符号" min-width="260">
            <template #default="{ row }">
              <el-tag v-for="symbol in row.symbols.slice(0, 6)" :key="`${symbol.kind}:${symbol.name}:${symbol.line}`" size="small" class="file-tag">
                {{ symbol.kind }} {{ symbol.name }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="导入 / 调用" min-width="260">
            <template #default="{ row }">
              {{ formatAstRelations(row) }}
            </template>
          </el-table-column>
        </el-table>
        <p v-if="result.ast.failures.length" class="sensitive-note">
          有 {{ result.ast.failures.length }} 个文件未能完成 AST 解析，请检查源码语法或 grammar 资源。
        </p>
        <div v-if="astRelationshipCount" class="relationship-grid">
          <div class="relationship-item">
            <small>跨文件调用</small>
            <strong>{{ result.ast.relationships?.callGraph?.length || 0 }}</strong>
          </div>
          <div class="relationship-item">
            <small>依赖引用</small>
            <strong>{{ result.ast.relationships?.dependencyReferences?.length || 0 }}</strong>
          </div>
          <div class="relationship-item">
            <small>继承</small>
            <strong>{{ result.ast.relationships?.inheritance?.length || 0 }}</strong>
          </div>
          <div class="relationship-item">
            <small>接口实现</small>
            <strong>{{ result.ast.relationships?.interfaceImplementations?.length || 0 }}</strong>
          </div>
        </div>
      </section>

      <section v-if="projectProfile" class="panel-card">
        <div class="panel-head">
          <div>
            <span>Project Profile</span>
            <h2>通用项目画像</h2>
          </div>
        </div>
        <div class="profile-grid">
          <div class="profile-item">
            <small>README</small>
            <div class="profile-tags">
              <el-tag v-for="file in projectProfile.readmeFiles" :key="file" size="small">{{ file }}</el-tag>
              <span v-if="!projectProfile.readmeFiles.length">未识别</span>
            </div>
          </div>
          <div class="profile-item">
            <small>依赖清单</small>
            <div class="profile-tags">
              <el-tag v-for="manifest in projectProfile.dependencyManifests" :key="manifest.path" size="small" type="success">
                {{ manifest.path }}
              </el-tag>
              <span v-if="!projectProfile.dependencyManifests.length">未识别</span>
            </div>
          </div>
          <div class="profile-item">
            <small>启动命令</small>
            <div class="profile-command-list">
              <code v-for="item in projectProfile.startCommands" :key="item.command">{{ item.command }}</code>
              <span v-if="!projectProfile.startCommands.length">请结合 README 人工确认</span>
            </div>
          </div>
          <div class="profile-item">
            <small>配置文件</small>
            <div class="profile-tags">
              <el-tag v-for="file in projectProfile.configFiles.slice(0, 8)" :key="file" size="small" type="info">{{ file }}</el-tag>
              <span v-if="!projectProfile.configFiles.length">未识别</span>
            </div>
          </div>
        </div>
        <p v-if="projectProfile.sensitiveFiles.length" class="sensitive-note">
          已发现 {{ projectProfile.sensitiveFiles.length }} 个敏感文件路径。系统仅提示路径，不读取文件内容。
        </p>
      </section>

      <section v-if="result.git?.authors?.length" class="panel-card">
        <div class="panel-head">
          <div>
            <span>Contributors</span>
            <h2>Git 作者贡献</h2>
          </div>
        </div>
        <el-table :data="result.git.authors" border class="data-table">
          <el-table-column prop="name" label="姓名" min-width="160" />
          <el-table-column prop="email" label="邮箱" min-width="240" />
          <el-table-column prop="commitCount" label="提交次数" width="120" align="center" />
        </el-table>
      </section>

      <section v-if="result.modules?.length" class="panel-card">
        <div class="panel-head">
          <div>
            <span>Modules</span>
            <h2>项目模块</h2>
          </div>
        </div>
        <el-table :data="result.modules" border class="data-table">
          <el-table-column prop="name" label="模块名称" min-width="160" />
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column label="描述" min-width="220">
            <template #default="{ row }">{{ row.summary || row.description || '-' }}</template>
          </el-table-column>
          <el-table-column label="文件数" width="100" align="center">
            <template #default="{ row }">{{ getModuleFileCount(row) }}</template>
          </el-table-column>
          <el-table-column label="关键文件" min-width="240">
            <template #default="{ row }">
              <el-tag
                v-for="file in getModuleFiles(row)"
                :key="file"
                size="small"
                class="file-tag"
              >
                {{ file }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <div class="bottom-actions">
        <el-button :icon="HomeFilled" @click="goBack">返回首页</el-button>
        <el-button type="primary" :icon="Document" :loading="generating" @click="handleGenerateDocument">
          生成交接文档
        </el-button>
        <el-button v-if="result.documentPath" type="success" :icon="FolderOpened" @click="handleOpenDocument">
          打开文档
        </el-button>
      </div>
    </template>

    <el-empty v-else description="暂无分析结果" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { HomeFilled, Document, FolderOpened, ArrowLeft, Connection, Files, User, DataAnalysis } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import electronAPI from '../api/electron'
import store from '../store'

const router = useRouter()
const result = ref(store.analysisResult)
const generating = ref(false)

const displayLanguages = computed(() => {
  return getLanguageSummaries(result.value)
})

const projectPath = computed(() => getProjectPath(result.value))
const documentFormatLabel = computed(() => String((result.value as any)?.documentFormat || 'markdown').toUpperCase())

const primaryLanguage = computed(() => {
  const firstLanguage = displayLanguages.value[0]
  if (!firstLanguage) return 'Unknown'
  return getLanguageName(firstLanguage)
})

const fileCount = computed(() => result.value?.files?.length || 0)
const moduleCount = computed(() => result.value?.modules?.length || 0)
const authorCount = computed(() => result.value?.git?.authors?.length || 0)
const astSymbolCount = computed(() => result.value?.ast?.symbolCount || 0)
const projectProfile = computed(() => result.value?.profile)
const astRelationshipCount = computed(() => {
  const relationships = result.value?.ast?.relationships
  if (!relationships) return 0
  return (relationships.callGraph?.length || 0)
    + (relationships.dependencyReferences?.length || 0)
    + (relationships.inheritance?.length || 0)
    + (relationships.interfaceImplementations?.length || 0)
})

const getProjectPath = (value: any): string => {
  return value?.localPath || value?.projectPath || ''
}

const getLanguageName = (language: any): string => {
  return typeof language === 'string' ? language : language?.language || 'Unknown'
}

const formatPercentage = (language: any): string => {
  if (typeof language === 'string') {
    return '-'
  }
  const percentage = Number(language?.percentage || 0)
  return Number.isFinite(percentage) ? percentage.toFixed(1) : '0.0'
}

const getLanguageSummaries = (value: any): any[] => {
  const languages = value?.languages || []
  if (languages.length > 0) {
    return languages
  }

  const files = value?.files || []
  const counts = new Map<string, number>()

  for (const file of files) {
    const language = file?.language
    if (!language || language === 'Unknown') {
      continue
    }
    counts.set(language, (counts.get(language) || 0) + 1)
  }

  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0)
  return Array.from(counts.entries())
    .map(([language, fileCount]) => ({
      language,
      fileCount,
      percentage: total > 0 ? (fileCount / total) * 100 : 0,
      extensions: [],
    }))
    .sort((a, b) => b.fileCount - a.fileCount)
}

const formatConfidence = (confidence: number): number => {
  const value = confidence > 1 ? confidence : confidence * 100
  return Math.max(0, Math.min(100, Math.round(value)))
}

const getModuleFileCount = (module: any): number => {
  return module?.files?.length || module?.fileCount || 0
}

const getModuleFiles = (module: any): string[] => {
  return (module?.files || module?.keyFiles || []).slice(0, 5)
}

const formatAstRelations = (file: any): string => {
  const relations = [...(file?.imports || []), ...(file?.calls || [])]
  return relations.slice(0, 8).join('、') || '-'
}

const buildDocumentPath = (value: any): string => {
  const projectPath = getProjectPath(value).replace(/[\\/]+$/, '')
  if (!projectPath) {
    throw new Error('缺少项目路径，无法生成交接文档')
  }

  const projectName = String(value?.projectName || 'project').replace(/[<>:"/\\|?*]/g, '_')
  const extension = getDocumentExtension(value?.documentFormat)
  return `${projectPath}/handover_${projectName}${extension}`
}

const getDocumentExtension = (format?: string): string => {
  if (format === 'html') return '.html'
  if (format === 'pdf') return '.pdf'
  return '.md'
}

const normalizeDocumentResult = (value: any): any => {
  const localPath = getProjectPath(value)

  return {
    ...value,
    localPath,
    generatedAt: value?.generatedAt || new Date().toISOString(),
    languages: getLanguageSummaries(value).map((language: any) => (
      typeof language === 'string'
        ? { language, fileCount: 0, percentage: 0, extensions: [] }
        : language
    )),
    git: value?.git || (value?.gitAuthors ? { authors: value.gitAuthors } : undefined),
    modules: (value?.modules || []).map((module: any) => ({
      ...module,
      type: module?.type || 'other',
      summary: module?.summary || module?.description || '',
      files: module?.files || module?.keyFiles || (module?.path ? [module.path] : []),
    })),
    files: value?.files || [],
    profile: value?.profile || {
      readmeFiles: [],
      documentationFiles: [],
      dependencyManifests: [],
      configFiles: [],
      sensitiveFiles: [],
      startCommands: [],
      topLevelDirectories: [],
    },
  }
}

const goBack = () => {
  store.clearAnalysisResult()
  router.push('/')
}

const handleGenerateDocument = async () => {
  if (!result.value) return

  generating.value = true
  try {
    const plainResult = normalizeDocumentResult(JSON.parse(JSON.stringify(result.value)))
    const targetPath = plainResult.documentPath || buildDocumentPath(plainResult)
    const outputPath = await electronAPI.generateDocument(
      plainResult,
      targetPath
    )
    result.value.documentPath = outputPath
    ElMessage.success('文档生成成功')
  } catch (error) {
    ElMessage.error('文档生成失败')
    console.error(error)
  } finally {
    generating.value = false
  }
}

const handleOpenDocument = async () => {
  if (!result.value?.documentPath) return

  try {
    const opened = await electronAPI.openFile(result.value.documentPath)
    if (!opened) {
      throw new Error('系统未能打开交接文档')
    }
  } catch (error) {
    ElMessage.error('打开文档失败')
    console.error(error)
  }
}

onMounted(() => {
  if (!result.value) {
    ElMessage.warning('未找到分析结果，正在返回首页...')
    setTimeout(() => {
      router.push('/')
    }, 1500)
  }
})
</script>

<style scoped>
.result-page {
  max-width: 1240px;
  margin: 0 auto;
  display: grid;
  gap: 24px;
}

.result-heading {
  display: flex;
  align-items: flex-end;
  gap: 18px;
}

.result-heading span {
  color: #2563eb;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.result-heading h1 {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 38px;
  line-height: 1.1;
}

.result-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  padding: 28px;
  border: 1px solid rgba(203, 213, 225, 0.84);
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.16), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.88));
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.1);
}

.hero-main {
  min-width: 0;
  display: grid;
  align-content: center;
}

.hero-eyebrow {
  color: #0891b2;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero-main h2 {
  margin: 12px 0 10px;
  color: #0f172a;
  font-size: 34px;
  line-height: 1.15;
}

.hero-main p {
  max-width: 720px;
  margin: 0;
  color: #475569;
  font-size: 15px;
  line-height: 1.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.hero-actions-card {
  padding: 22px;
  border: 1px solid #dbeafe;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  display: grid;
  gap: 12px;
  align-content: start;
}

.hero-actions-card span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.hero-actions-card strong {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.45;
}

.hero-actions-card :deep(.el-button) {
  width: 100%;
  height: 40px;
  margin-left: 0;
  border-radius: 9px;
  font-weight: 700;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.metric-card,
.panel-card {
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.07);
}

.metric-card {
  padding: 20px;
  display: grid;
  gap: 8px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.metric-card:hover {
  border-color: #bfdbfe;
  box-shadow: 0 20px 48px rgba(37, 99, 235, 0.12);
}

.metric-icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #ffffff;
  font-size: 20px;
}

.metric-icon.blue { background: linear-gradient(135deg, #2563eb, #60a5fa); }
.metric-icon.cyan { background: linear-gradient(135deg, #0891b2, #22d3ee); }
.metric-icon.purple { background: linear-gradient(135deg, #7c3aed, #a78bfa); }
.metric-icon.green { background: linear-gradient(135deg, #059669, #34d399); }
.metric-icon.orange { background: linear-gradient(135deg, #ea580c, #fb923c); }

.metric-card small {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.metric-card strong {
  color: #0f172a;
  font-size: 30px;
  line-height: 1.1;
}

.metric-card em {
  color: #64748b;
  font-size: 13px;
  font-style: normal;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
  gap: 16px;
}

.panel-card {
  padding: 24px;
  min-width: 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.panel-head.compact {
  margin-bottom: 14px;
}

.panel-head span {
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.panel-head h2 {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 22px;
}

.framework-list {
  display: grid;
  gap: 16px;
}

.framework-item {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  display: grid;
  grid-template-columns: minmax(160px, 0.35fr) minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.framework-copy {
  display: grid;
  gap: 4px;
}

.framework-copy strong {
  color: #0f172a;
  font-size: 16px;
}

.framework-copy span {
  color: #64748b;
  font-size: 13px;
}

.framework-progress {
  min-width: 0;
}

.language-list {
  display: grid;
  gap: 10px;
}

.language-row {
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.language-row span {
  color: #334155;
  font-weight: 700;
}

.language-row strong {
  color: #2563eb;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.ast-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.ast-table {
  margin-top: 4px;
}

.relationship-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.relationship-item {
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  display: grid;
  gap: 4px;
}

.relationship-item small {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.relationship-item strong {
  color: #0f172a;
  font-size: 24px;
}

.profile-item {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
}

.profile-item small {
  display: block;
  margin-bottom: 10px;
  color: #475569;
  font-size: 13px;
  font-weight: 800;
}

.profile-tags,
.profile-command-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #64748b;
  font-size: 13px;
}

.profile-command-list code {
  padding: 4px 8px;
  border-radius: 6px;
  background: #e0e7ff;
  color: #3730a3;
}

.sensitive-note {
  margin: 14px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 13px;
}

.data-table {
  width: 100%;
}

.file-tag {
  margin-right: 6px;
  margin-bottom: 6px;
}

.bottom-actions {
  position: sticky;
  bottom: 18px;
  z-index: 5;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

:deep(.el-button) {
  cursor: pointer;
}

@media (max-width: 1100px) {
  .result-hero,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .profile-grid {
    grid-template-columns: 1fr;
  }

  .relationship-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .result-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .result-heading h1,
  .hero-main h2 {
    font-size: 30px;
  }

  .result-hero,
  .panel-card {
    padding: 18px;
    border-radius: 18px;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .relationship-grid {
    grid-template-columns: 1fr;
  }

  .framework-item {
    grid-template-columns: 1fr;
  }

  .bottom-actions {
    width: 100%;
    border-radius: 18px;
  }
}
</style>
