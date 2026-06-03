<template>
  <section class="home-page">
    <div class="hero-panel">
      <div class="hero-copy">
        <span class="eyebrow">Git 交接工作台</span>
        <h1>CodeHandover</h1>
        <p>把 Git 贡献、代码结构、核心接口和交接风险整理成一份可落地的离职交接文档。</p>
        <div class="hero-actions">
          <el-button type="primary" size="large" :icon="FolderOpened" @click="goLocal">
            选择本地项目
          </el-button>
          <el-button size="large" :icon="Download" @click="goRemote">
            拉取远程仓库
          </el-button>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="code-window">
          <div class="window-dots">
            <i></i>
            <i></i>
            <i></i>
          </div>
          <div class="code-line wide"></div>
          <div class="code-line"></div>
          <div class="code-line short"></div>
          <div class="handover-chip">
            <el-icon><DocumentChecked /></el-icon>
            Handover.md
          </div>
        </div>
      </div>
    </div>

    <div class="quick-grid">
      <button class="quick-card" type="button" @click="goRemote">
        <span class="quick-art cloud">
          <el-icon><Download /></el-icon>
        </span>
        <span class="quick-content">
          <strong>从远程仓库拉取</strong>
          <em>Clone from Remote</em>
          <small>输入仓库地址，拉取代码后进入分析配置。</small>
        </span>
        <el-icon class="quick-arrow"><ArrowRight /></el-icon>
      </button>

      <button class="quick-card" type="button" @click="goLocal">
        <span class="quick-art folder">
          <el-icon><FolderOpened /></el-icon>
        </span>
        <span class="quick-content">
          <strong>选择本地项目</strong>
          <em>Select Local Project</em>
          <small>选择已有项目目录，识别 Git 作者并生成交接文档。</small>
        </span>
        <el-icon class="quick-arrow"><ArrowRight /></el-icon>
      </button>
    </div>

    <section class="recent-panel">
      <div class="section-head">
        <div>
          <span class="section-icon">
            <el-icon><Clock /></el-icon>
          </span>
          <h2>最近项目</h2>
        </div>
        <el-button text type="primary" @click="goProjects">
          查看全部
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>

      <div class="recent-table">
        <div class="table-head">
          <span>项目名称</span>
          <span>项目路径</span>
          <span>最后分析时间</span>
          <span>操作</span>
        </div>
        <div v-if="recentProjects.length === 0" class="empty-projects">
          <el-empty description="暂无已分析项目，选择本地项目后会显示在这里。" />
        </div>

        <div v-for="project in recentProjects.slice(0, 4)" :key="project.path" class="table-row">
          <div class="project-name">
            <span class="language-icon" :class="project.iconClass">{{ project.short }}</span>
            <strong>{{ project.name }}</strong>
            <em>{{ project.language }}</em>
          </div>
          <span class="path-text">{{ project.path }}</span>
          <span class="muted">{{ project.modified }}</span>
          <div class="row-actions">
            <el-tooltip content="重新分析" placement="top">
              <el-button type="primary" :icon="VideoPlay" circle @click="reanalyzeProject(project)" />
            </el-tooltip>
            <el-tooltip content="打开交接文档" placement="top">
              <el-button :icon="Document" circle :disabled="!project.documentPath" @click="openDocument(project.documentPath)" />
            </el-tooltip>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  Clock,
  Document,
  DocumentChecked,
  Download,
  FolderOpened,
  VideoPlay,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import electronAPI from '../api/electron'
import store from '../store'

const router = useRouter()

interface ProjectView {
  name: string
  path: string
  language: string
  modified: string
  short: string
  iconClass: string
  documentPath?: string
}

const recentProjects = ref<ProjectView[]>([])

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (num: number) => num.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const getLanguageMeta = (language?: string, framework?: string) => {
  const label = framework || language || 'Unknown'
  const lower = label.toLowerCase()
  if (lower.includes('php') || lower.includes('laravel')) return { short: 'PHP', iconClass: 'php', label }
  if (lower.includes('java')) return { short: 'JV', iconClass: 'java', label }
  if (lower.includes('react')) return { short: 'RX', iconClass: 'react', label }
  if (lower.includes('javascript')) return { short: 'JS', iconClass: 'js', label }
  if (lower.includes('typescript')) return { short: 'TS', iconClass: 'ts', label }
  if (lower.includes('go')) return { short: 'GO', iconClass: 'go', label }
  return { short: label.slice(0, 2).toUpperCase(), iconClass: 'other', label }
}

const loadProjects = async () => {
  const projects = await electronAPI.getRecentProjects()
  recentProjects.value = projects.map(project => {
    const meta = getLanguageMeta(project.language, project.framework)
    return {
      name: project.name,
      path: project.path,
      language: meta.label,
      modified: formatDateTime(project.lastAnalyzed),
      short: meta.short,
      iconClass: meta.iconClass,
      documentPath: project.documentPath,
    }
  })
}

const goLocal = () => router.push('/local-project')
const goRemote = () => router.push('/remote-repo')
const goProjects = () => router.push('/projects')
const reanalyzeProject = (project: ProjectView) => {
  store.clearConfig()
  store.setAnalyzeConfig({
    projectPath: project.path,
  })
  router.push('/analyze-config')
}
const openDocument = async (documentPath?: string) => {
  if (!documentPath) return

  const opened = await electronAPI.openFile(documentPath)
  if (!opened) {
    ElMessage.error('打开文档失败')
  }
}

onMounted(loadProjects)
</script>

<style scoped>
.home-page {
  max-width: 1550px;
  margin: 0 auto;
  display: grid;
  gap: 20px;
}

.hero-panel {
  min-height: 270px;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 460px;
  align-items: center;
  padding: 48px;
  color: #ffffff;
  background:
    linear-gradient(90deg, rgba(4, 34, 91, 0.96), rgba(9, 102, 166, 0.9), rgba(28, 201, 193, 0.86)),
    repeating-linear-gradient(90deg, transparent 0 38px, rgba(255, 255, 255, 0.05) 38px 39px);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.16);
}

.hero-panel::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.2) 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.18;
}

.hero-copy,
.hero-visual {
  position: relative;
  z-index: 1;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  color: #ccfbf1;
  background: rgba(255, 255, 255, 0.12);
  font-size: 14px;
  font-weight: 700;
}

.hero-copy h1 {
  margin: 18px 0 12px;
  font-size: 56px;
  line-height: 1.05;
  letter-spacing: 0;
}

.hero-copy p {
  max-width: 620px;
  margin: 0;
  color: rgba(239, 246, 255, 0.9);
  font-size: 20px;
  line-height: 1.65;
}

.hero-actions {
  display: flex;
  gap: 14px;
  margin-top: 28px;
}

.hero-actions :deep(.el-button) {
  height: 46px;
  padding: 0 22px;
}

.hero-visual {
  display: flex;
  justify-content: flex-end;
}

.code-window {
  width: 360px;
  height: 210px;
  border-radius: 16px;
  padding: 22px;
  background: rgba(255, 255, 255, 0.13);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.window-dots {
  display: flex;
  gap: 8px;
  margin-bottom: 26px;
}

.window-dots i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.62);
}

.code-line {
  height: 13px;
  width: 72%;
  border-radius: 999px;
  margin: 14px 0;
  background: rgba(255, 255, 255, 0.35);
}

.code-line.wide {
  width: 88%;
}

.code-line.short {
  width: 48%;
}

.handover-chip {
  width: fit-content;
  height: 38px;
  margin-top: 24px;
  padding: 0 14px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #083344;
  background: #ccfbf1;
  font-weight: 760;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.quick-card {
  min-height: 230px;
  padding: 32px;
  border: 1px solid rgba(203, 213, 225, 0.84);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 28px;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.07);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.quick-card:hover {
  transform: translateY(-2px);
  border-color: rgba(37, 99, 235, 0.32);
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.1);
}

.quick-art {
  width: 170px;
  height: 130px;
  border-radius: 24px;
  display: grid;
  place-items: center;
  font-size: 58px;
  color: #ffffff;
  box-shadow: 0 18px 30px rgba(37, 99, 235, 0.18);
}

.quick-art.cloud {
  background: linear-gradient(135deg, #38bdf8, #f97316);
}

.quick-art.folder {
  background: linear-gradient(135deg, #3b82f6, #93c5fd);
}

.quick-content {
  display: grid;
  gap: 8px;
}

.quick-content strong {
  color: #0f172a;
  font-size: 27px;
  line-height: 1.2;
}

.quick-content em {
  color: #64748b;
  font-size: 17px;
  font-style: normal;
}

.quick-content small {
  max-width: 350px;
  color: #475569;
  font-size: 17px;
  line-height: 1.55;
}

.quick-arrow {
  color: #075ee8;
  font-size: 24px;
}

.recent-panel {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(203, 213, 225, 0.82);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.07);
  overflow: hidden;
}

.recent-table {
  min-width: 0;
}

.section-head {
  height: 60px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
}

.section-head > div {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-head h2 {
  margin: 0;
  font-size: 20px;
}

.section-icon {
  color: #075ee8;
  font-size: 22px;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.35fr) minmax(160px, 1fr) minmax(136px, 0.72fr) minmax(92px, auto);
  align-items: center;
  column-gap: 12px;
}

.table-head {
  height: 46px;
  padding: 0 18px 0 30px;
  color: #475569;
  font-size: 14px;
  font-weight: 700;
}

.table-row {
  min-height: 58px;
  padding: 0 18px 0 30px;
  border-top: 1px solid #edf2f7;
}

.project-name {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-name strong,
.project-name em,
.path-text,
.muted {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-name strong {
  color: #0f172a;
  font-size: 16px;
}

.project-name em {
  flex: 0 1 auto;
  padding: 4px 8px;
  border-radius: 6px;
  color: #075985;
  background: #e0f2fe;
  font-size: 12px;
  font-style: normal;
}

.language-icon {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
}

.language-icon.php {
  background: #4f46e5;
}

.language-icon.js {
  background: #0ea5e9;
}

.language-icon.java {
  background: #22c55e;
}

.language-icon.react {
  background: #06b6d4;
}

.language-icon.ts {
  background: #2563eb;
}

.language-icon.go {
  background: #0891b2;
}

.language-icon.other {
  background: #64748b;
}

.path-text,
.muted {
  color: #64748b;
  font-size: 15px;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  min-width: 92px;
  white-space: nowrap;
}

.row-actions :deep(.el-button.is-circle) {
  flex: 0 0 auto;
}

.empty-projects {
  padding: 34px;
  border-top: 1px solid #edf2f7;
}

@media (max-width: 1200px) {
  .hero-panel {
    grid-template-columns: 1fr;
  }

  .hero-visual {
    display: none;
  }

  .quick-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .table-head,
  .table-row {
    grid-template-columns: minmax(180px, 1fr) minmax(132px, 0.62fr) minmax(92px, auto);
  }

  .table-head span:nth-child(2),
  .path-text {
    display: none;
  }
}

@media (max-width: 760px) {
  .section-head {
    height: auto;
    padding: 16px 18px;
    align-items: flex-start;
    gap: 12px;
  }

  .table-head {
    display: none;
  }

  .table-row {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 8px;
    padding: 14px 18px;
    align-items: center;
  }

  .project-name {
    grid-column: 1;
  }

  .muted {
    grid-column: 1;
    display: block;
    font-size: 13px;
  }

  .row-actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
  }
}
</style>
