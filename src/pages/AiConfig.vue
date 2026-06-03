<template>
  <section class="settings-page">
    <aside class="settings-nav">
      <button
        v-for="item in navItems"
        :key="item.key"
        type="button"
        :class="{ active: activeSection === item.key }"
        @click="activeSection = item.key"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </button>
    </aside>

    <main class="settings-content">
      <div class="settings-heading">
        <div>
          <span class="eyebrow">Settings</span>
          <h1>{{ currentTitle }}</h1>
          <p>{{ currentDescription }}</p>
        </div>
        <el-tag :type="connected ? 'success' : 'info'" size="large" round>
          {{ connected ? 'Verified' : 'Not verified' }}
        </el-tag>
      </div>

      <template v-if="activeSection === 'ai'">
        <section class="settings-card">
          <h2>模型供应商</h2>
          <el-select v-model="providerType" class="wide-control">
            <el-option label="本地 CLI 工具优先" value="cli" />
            <el-option label="自定义 API（OpenAI / Anthropic）" value="custom" />
          </el-select>
          <p>当前分析流程会优先使用可用配置生成项目交接摘要。</p>
        </section>

        <section class="settings-card">
          <div class="card-title-row">
            <h2>API 配置</h2>
            <el-button :icon="Plus" @click="addProvider">添加配置</el-button>
          </div>

          <div v-if="customProviders.length === 0" class="empty-state">
            <el-icon><Connection /></el-icon>
            <span>暂无自定义 API 配置</span>
          </div>

          <div v-for="(provider, index) in customProviders" :key="index" class="provider-form">
            <el-form :model="provider" label-position="top">
              <div class="form-grid">
                <el-form-item label="配置名称">
                  <el-input v-model="provider.name" placeholder="例如：OpenAI / Qwen / DeepSeek" />
                </el-form-item>
                <el-form-item label="模型名称">
                  <el-input v-model="provider.model" placeholder="例如：gpt-4o, qwen-plus, deepseek-chat" @update:model-value="invalidateProviderTest(provider)" />
                </el-form-item>
                <el-form-item label="API 协议">
                  <el-select v-model="provider.protocol" @change="invalidateProviderTest(provider)">
                    <el-option label="OpenAI 兼容（Chat Completions）" value="openai" />
                    <el-option label="Anthropic（Messages）" value="anthropic" />
                  </el-select>
                </el-form-item>
              </div>
              <el-form-item label="Base URL">
                <el-input v-model="provider.baseUrl" :placeholder="getBaseUrlPlaceholder(provider)" @update:model-value="invalidateProviderTest(provider)" />
              </el-form-item>
              <el-form-item label="API Key" class="stacked-form-item">
                <el-input v-model="provider.apiKey" type="password" show-password placeholder="sk-..." @update:model-value="invalidateProviderTest(provider)" />
              </el-form-item>
              <div class="inline-actions provider-actions">
                <el-button
                  type="primary"
                  :icon="Connection"
                  :loading="provider._testing"
                  @click="testProvider(provider)"
                >
                  测试连接
                </el-button>
                <el-button type="danger" plain :icon="Delete" @click="removeProvider(index)">删除</el-button>
                <span v-if="provider._testResult" class="test-result" :class="{ ok: provider._testResult.success }">
                  {{ provider._testResult.success ? '模型请求验证成功' : provider._testResult.error || '连接失败' }}
                </span>
              </div>
            </el-form>
          </div>
        </section>

        <section class="settings-card">
          <h2>模型偏好</h2>
          <div class="preference-grid">
            <label>
              <span>默认温度</span>
              <el-slider v-model="temperature" :min="0" :max="1" :step="0.01" />
            </label>
            <el-input-number v-model="temperature" :min="0" :max="1" :step="0.01" />
            <label class="switch-row">
              <span>流式响应</span>
              <el-switch v-model="streamResponse" />
            </label>
            <label class="switch-row">
              <span>生成日志</span>
              <el-switch v-model="enableLogging" />
            </label>
          </div>
        </section>
      </template>

      <template v-else-if="activeSection === 'cli'">
        <section class="settings-card">
          <div class="card-title-row">
            <h2>CLI 工具检测</h2>
            <el-button type="primary" :icon="Refresh" :loading="detecting" @click="detectCli(true)">
              重新检测
            </el-button>
          </div>

          <div class="cli-list">
            <div v-for="provider in cliProviders" :key="provider.name" class="cli-row">
              <div>
                <strong>{{ provider.name }}</strong>
                <span>{{ provider.cliCommand }}</span>
                <small v-if="provider.version">{{ provider.version }}</small>
                <p>{{ provider.message || getCliStatusMessage(provider) }}</p>
              </div>
              <el-tag :type="getCliTagType(provider)">
                {{ getCliStatusLabel(provider) }}
              </el-tag>
            </div>
            <el-empty v-if="cliProviders.length === 0 && !detecting" description="暂无检测结果" />
          </div>
        </section>
      </template>

      <template v-else-if="activeSection === 'custom'">
        <section class="settings-card">
          <div class="card-title-row">
            <h2>自定义模型</h2>
            <el-button type="primary" :icon="Plus" @click="addProvider">添加模型</el-button>
          </div>

          <div v-if="customProviders.length === 0" class="empty-state">
            <el-icon><Connection /></el-icon>
            <span>暂无自定义模型</span>
          </div>

          <div v-for="(provider, index) in customProviders" :key="index" class="provider-form">
            <el-form :model="provider" label-position="top">
              <div class="form-grid">
                <el-form-item label="配置名称">
                  <el-input v-model="provider.name" placeholder="例如：Qwen Plus" />
                </el-form-item>
                <el-form-item label="模型名称">
                  <el-input v-model="provider.model" placeholder="例如：qwen-plus" @update:model-value="invalidateProviderTest(provider)" />
                </el-form-item>
                <el-form-item label="API 协议">
                  <el-select v-model="provider.protocol" @change="invalidateProviderTest(provider)">
                    <el-option label="OpenAI 兼容（Chat Completions）" value="openai" />
                    <el-option label="Anthropic（Messages）" value="anthropic" />
                  </el-select>
                </el-form-item>
              </div>
              <el-form-item label="Base URL">
                <el-input v-model="provider.baseUrl" :placeholder="getBaseUrlPlaceholder(provider)" @update:model-value="invalidateProviderTest(provider)" />
              </el-form-item>
              <el-form-item label="API Key" class="stacked-form-item">
                <el-input v-model="provider.apiKey" type="password" show-password placeholder="输入 API Key" @update:model-value="invalidateProviderTest(provider)" />
              </el-form-item>
              <div class="inline-actions provider-actions">
                <el-button
                  type="primary"
                  :icon="Connection"
                  :loading="provider._testing"
                  @click="testProvider(provider)"
                >
                  测试连接
                </el-button>
                <el-button type="danger" plain :icon="Delete" @click="removeProvider(index)">删除</el-button>
                <span v-if="provider._testResult" class="test-result" :class="{ ok: provider._testResult.success }">
                  {{ provider._testResult.success ? '模型请求验证成功' : provider._testResult.error || '连接失败' }}
                </span>
              </div>
            </el-form>
          </div>
        </section>
      </template>

      <template v-else-if="activeSection === 'general'">
        <section class="settings-card">
          <h2>通用设置</h2>
          <div class="general-list">
            <label class="switch-row">
              <span>生成后自动打开文档</span>
              <el-switch v-model="openAfterGenerate" />
            </label>
            <label class="switch-row">
              <span>保留分析过程日志</span>
              <el-switch v-model="keepLogs" />
            </label>
            <label class="switch-row">
              <span>跳过 vendor / node_modules</span>
              <el-switch v-model="skipDependencies" />
            </label>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="settings-card about-card">
          <div class="about-mark">
            <img src="/favicon.ico" alt="CodeHandover Logo" />
          </div>
          <h2>CodeHandover</h2>
          <p>面向代码交接场景的项目分析与文档生成工具。</p>
          <span>Version 1.0.0</span>
        </section>
      </template>

      <div class="settings-actions">
        <el-button type="primary" size="large" :icon="DocumentChecked" @click="saveConfig">
          保存设置
        </el-button>
        <el-button size="large" :icon="RefreshLeft" @click="resetView">
          恢复默认
        </el-button>
      </div>
    </main>
  </section>
</template>

<script setup lang="ts">
import { computed, markRaw, onMounted, ref } from 'vue'
import {
  Box,
  Connection,
  Delete,
  DocumentChecked,
  InfoFilled,
  Plus,
  Refresh,
  RefreshLeft,
  Setting,
  Tools,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import electronAPI from '../api/electron'

type SectionKey = 'ai' | 'cli' | 'custom' | 'general' | 'about'
type ProviderProtocol = 'openai' | 'anthropic'

const navItems = [
  { key: 'ai' as SectionKey, label: 'AI 模型配置', icon: markRaw(Connection) },
  { key: 'cli' as SectionKey, label: 'CLI 工具', icon: markRaw(Tools) },
  { key: 'custom' as SectionKey, label: '自定义模型', icon: markRaw(Box) },
  { key: 'general' as SectionKey, label: '通用设置', icon: markRaw(Setting) },
  { key: 'about' as SectionKey, label: '关于', icon: markRaw(InfoFilled) },
]

const activeSection = ref<SectionKey>('ai')
const providerType = ref('custom')
const detecting = ref(false)
const cliProviders = ref<Array<any>>([])
const customProviders = ref<Array<any>>([])
const connected = computed(() => (
  cliProviders.value.some(provider => provider.ready)
  || customProviders.value.some(provider => (
    provider._testResult?.success
    && provider._testSignature === getProviderSignature(provider)
  ))
))
const temperature = ref(0.7)
const streamResponse = ref(true)
const enableLogging = ref(true)
const openAfterGenerate = ref(true)
const keepLogs = ref(true)
const skipDependencies = ref(true)

function getProviderSignature(provider: any): string {
  return JSON.stringify({
    protocol: inferProviderProtocol(provider),
    baseUrl: provider.baseUrl?.trim() || '',
    apiKey: provider.apiKey?.trim() || '',
    model: provider.model?.trim() || '',
  })
}

function inferProviderProtocol(provider: any): ProviderProtocol {
  if (provider.protocol === 'openai' || provider.protocol === 'anthropic') {
    return provider.protocol
  }

  return /\/anthropic(?:\/|$)/i.test(provider.baseUrl || '') ? 'anthropic' : 'openai'
}

function getBaseUrlPlaceholder(provider: any): string {
  return inferProviderProtocol(provider) === 'anthropic'
    ? '例如：https://api.anthropic.com 或 https://open.bigmodel.cn/api/anthropic'
    : '例如：https://api.openai.com/v1'
}

const invalidateProviderTest = (provider: any) => {
  provider._testResult = null
  provider._testSignature = ''
}

function getCliStatusLabel(provider: any): string {
  if (provider.ready) return '已就绪'
  if (provider.status === 'missing') return '未安装'
  if (provider.status === 'auth-required') return '需认证'
  return '检测失败'
}

function getCliTagType(provider: any): 'success' | 'warning' | 'danger' | 'info' {
  if (provider.ready) return 'success'
  if (provider.status === 'auth-required') return 'warning'
  if (provider.status === 'error') return 'danger'
  return 'info'
}

function getCliStatusMessage(provider: any): string {
  if (provider.ready) return 'CLI 已通过非交互生成检测，可用于生成 AI 交接摘要'
  if (provider.status === 'missing') return `未检测到 ${provider.cliCommand} 命令，请先安装`
  if (provider.status === 'auth-required') return `请先在终端运行 ${provider.cliCommand} 完成登录或认证`
  return 'CLI 命令存在，但非交互生成检测失败'
}

const sectionDescriptions: Record<SectionKey, string> = {
  ai: '配置默认模型来源，用于生成项目交接摘要和风险提示。',
  cli: '检测本机可用的 AI CLI 工具，优先复用已登录的本地能力。',
  custom: '管理 OpenAI 兼容接口，适配团队自有网关或第三方模型。',
  general: '调整文档生成、日志保留和依赖目录过滤等通用行为。',
  about: '查看 CodeHandover 的产品定位和版本信息。',
}

const currentTitle = computed(() => {
  return navItems.find(item => item.key === activeSection.value)?.label || '设置'
})

const currentDescription = computed(() => sectionDescriptions[activeSection.value])

const detectCli = async (force = false) => {
  detecting.value = true
  try {
    cliProviders.value = await electronAPI.detectCliProviders(force)
  } catch (error) {
    ElMessage.error('CLI 工具检测失败')
  } finally {
    detecting.value = false
  }
}

const addProvider = () => {
  customProviders.value.push({
    type: 'custom',
    name: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    protocol: 'openai',
    enabled: true,
    _testing: false,
    _testResult: null,
    _testSignature: '',
  })
}

const removeProvider = (index: number) => {
  customProviders.value.splice(index, 1)
}

const testProvider = async (provider: any) => {
  const testSignature = getProviderSignature(provider)
  if (!provider.baseUrl || !provider.apiKey || !provider.model) {
    provider._testResult = { success: false, error: '请先填写 Base URL、API Key 和模型名称' }
    provider._testSignature = testSignature
    ElMessage.warning(provider._testResult.error)
    return
  }

  provider._testing = true
  provider._testResult = null
  provider._testSignature = testSignature
  try {
    const plainProvider = {
      type: 'custom',
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      protocol: inferProviderProtocol(provider),
      enabled: provider.enabled,
    }
    const testResult = await electronAPI.testAiProvider(plainProvider)
    if (getProviderSignature(provider) !== testSignature) return
    provider._testResult = testResult
    if (provider._testResult.success) {
      ElMessage.success('模型请求验证成功')
    } else {
      ElMessage.error(provider._testResult.error || '连接失败')
    }
  } catch (error) {
    if (getProviderSignature(provider) !== testSignature) return
    provider._testResult = { success: false, error: (error as Error).message || '连接失败' }
    ElMessage.error(provider._testResult.error)
  } finally {
    provider._testing = false
  }
}

const saveConfig = async () => {
  const allProviders = [
    ...cliProviders.value.filter((provider: any) => provider.ready).map((provider: any) => ({
      type: 'cli',
      name: provider.name,
      cliCommand: provider.cliCommand,
      enabled: true,
    })),
    ...customProviders.value.map((provider: any) => ({
      type: 'custom',
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      protocol: inferProviderProtocol(provider),
      enabled: true,
    })),
  ]

  const success = await electronAPI.saveAiProviders(allProviders)
  if (success) {
    ElMessage.success('设置已保存')
  } else {
    ElMessage.error('保存失败')
  }
}

const resetView = () => {
  temperature.value = 0.7
  streamResponse.value = true
  enableLogging.value = true
  openAfterGenerate.value = true
  keepLogs.value = true
  skipDependencies.value = true
}

onMounted(async () => {
  detectCli()
  try {
    const saved = await electronAPI.loadAiProviders()
    customProviders.value = saved
      .filter((provider: any) => provider.type === 'custom')
      .map((provider: any) => ({
        ...provider,
        protocol: inferProviderProtocol(provider),
        _testing: false,
        _testResult: null,
        _testSignature: '',
      }))
  } catch {
    customProviders.value = []
  }
})
</script>

<style scoped>
.settings-page {
  max-width: 1550px;
  min-height: 100%;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 370px minmax(0, 1fr);
  gap: 32px;
}

.settings-nav {
  position: sticky;
  top: 24px;
  z-index: 2;
  min-height: 720px;
  border-radius: 20px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.82);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.07);
  display: grid;
  align-content: start;
  gap: 12px;
}

.settings-nav button {
  width: 100%;
  height: 68px;
  border: 0;
  border-radius: 14px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  gap: 18px;
  color: #1f2937;
  background: transparent;
  font-size: 19px;
  font-weight: 650;
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
  text-align: left;
}

.settings-nav button .el-icon {
  font-size: 28px;
}

.settings-nav button.active,
.settings-nav button:hover {
  color: #075ee8;
  background: linear-gradient(135deg, rgba(219, 234, 254, 0.96), rgba(241, 247, 255, 0.92));
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.1);
}

.settings-content {
  position: relative;
  z-index: 1;
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 16px;
}

.settings-heading {
  min-height: 64px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.eyebrow {
  color: #2563eb;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-heading h1 {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 30px;
  line-height: 1.2;
}

.settings-heading p {
  margin: 10px 0 0;
  color: #475569;
  line-height: 1.65;
}

.settings-card {
  border-radius: 20px;
  padding: 26px 32px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.84);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.06);
}

.settings-card h2 {
  margin: 0 0 16px;
  color: #0f172a;
  font-size: 22px;
}

.settings-card p {
  margin: 12px 0 0;
  color: #64748b;
  font-size: 15px;
}

.wide-control {
  width: min(650px, 100%);
}

.wide-control :deep(.el-select__wrapper),
.settings-card :deep(.el-input__wrapper) {
  min-height: 48px;
  border-radius: 12px;
}

.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}

.card-title-row h2 {
  margin: 0;
}

.empty-state {
  min-height: 120px;
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  display: grid;
  place-items: center;
  gap: 8px;
  color: #64748b;
}

.empty-state .el-icon {
  color: #2563eb;
  font-size: 28px;
}

.provider-form {
  padding: 18px 0;
  border-top: 1px solid #e2e8f0;
}

.provider-form:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.provider-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.provider-form :deep(.el-form-item__label) {
  margin-bottom: 6px;
}

.provider-form .form-grid + :deep(.el-form-item),
.stacked-form-item {
  margin-top: 10px;
}

.inline-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.provider-actions {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #dbe3ed;
}

.provider-actions :deep(.el-button) {
  min-width: 108px;
  border-radius: 10px;
  font-weight: 700;
}

.test-result {
  min-width: 0;
  flex: 1 1 220px;
  color: #dc2626;
  font-size: 14px;
  line-height: 1.5;
}

.test-result.ok {
  color: #059669;
}

.preference-grid {
  display: grid;
  grid-template-columns: minmax(280px, 560px) 120px;
  gap: 18px 28px;
  align-items: center;
}

.preference-grid label,
.switch-row {
  color: #475569;
  font-size: 16px;
}

.preference-grid label span {
  display: block;
  margin-bottom: 10px;
}

.switch-row {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.general-list {
  display: grid;
  gap: 14px;
  max-width: 620px;
}

.cli-list {
  display: grid;
  gap: 12px;
}

.cli-row {
  min-height: 64px;
  padding: 0 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.cli-row strong {
  display: block;
  color: #0f172a;
  font-size: 16px;
}

.cli-row span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.cli-row small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12px;
}

.cli-row p {
  max-width: 860px;
  margin: 6px 0 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.45;
}

.about-card {
  min-height: 360px;
  display: grid;
  place-items: center;
  text-align: center;
}

.about-mark {
  width: 74px;
  height: 74px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.14);
}

.about-mark img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.about-card p,
.about-card span {
  color: #64748b;
}

.settings-actions {
  display: flex;
  gap: 14px;
  padding-top: 6px;
}

:deep(.el-button),
:deep(.el-radio-button),
:deep(.el-switch) {
  cursor: pointer;
}

@media (max-width: 1180px) {
  .settings-page {
    grid-template-columns: 1fr;
    gap: 22px;
  }

  .settings-nav {
    position: relative;
    top: auto;
    z-index: 0;
    min-height: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-self: start;
  }

  .settings-content {
    z-index: 1;
  }

  .form-grid,
  .preference-grid {
    grid-template-columns: 1fr;
  }

  .provider-actions {
    align-items: stretch;
  }

  .provider-actions :deep(.el-button) {
    flex: 1 1 140px;
  }
}

@media (max-width: 720px) {
  .settings-nav {
    grid-template-columns: 1fr;
    padding: 12px;
  }

  .settings-nav button {
    height: 56px;
  }
}
</style>
