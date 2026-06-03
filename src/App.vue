<template>
  <el-config-provider :locale="zhCn">
    <div v-if="!isDesktopRuntime" class="desktop-required">
      <div class="desktop-required-card">
        <img src="/favicon.ico" alt="CodeHandover Logo" />
        <p class="eyebrow">DESKTOP ONLY</p>
        <h1>CodeHandover 是桌面应用专用</h1>
        <p>
          代码分析需要读取本地项目目录、执行 Git 命令并调用 Electron 主进程能力。
          普通网页环境无法访问这些能力，因此不会开放在线网页使用。
        </p>
        <div class="desktop-required-actions">
          <a href="https://github.com/ccTryFlow/code-handover" target="_blank" rel="noreferrer">查看 GitHub 仓库</a>
        </div>
      </div>
    </div>

    <div v-else class="app-shell">
      <div class="workspace">
        <aside class="sidebar">
        <nav class="nav-list">
          <router-link class="nav-item" :class="{ active: activeNav === 'home' }" to="/">
            <el-icon><HomeFilled /></el-icon>
            <span>首页</span>
          </router-link>
          <router-link class="nav-item" :class="{ active: activeNav === 'projects' }" to="/projects">
            <el-icon><FolderOpened /></el-icon>
            <span>项目</span>
          </router-link>
          <router-link class="nav-item" :class="{ active: activeNav === 'settings' }" to="/settings">
            <el-icon><Setting /></el-icon>
            <span>设置</span>
          </router-link>
        </nav>

        <div class="sidebar-footer">
          <div class="product-card">
            <div class="product-icon">
              <img src="/favicon.ico" alt="CodeHandover Logo" />
            </div>
            <div>
              <strong>CodeHandover</strong>
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
        </aside>

        <main ref="pageSurface" class="page-surface">
          <router-view />
        </main>
      </div>

      <footer class="statusbar">
        <span class="status-left"><i></i> 就绪</span>
        <span class="status-right">
          <el-icon><Coin /></el-icon>
          已分析项目 {{ analyzedProjectCount }} 个
        </span>
      </footer>
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Coin,
  FolderOpened,
  HomeFilled,
  Setting,
} from '@element-plus/icons-vue'
import { ElConfigProvider } from 'element-plus/es/components/config-provider/index.mjs'
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'
import electronAPI, { isElectronRuntime } from './api/electron'

const route = useRoute()
const analyzedProjectCount = ref(0)
const pageSurface = ref<HTMLElement | null>(null)
const isDesktopRuntime = isElectronRuntime()

const refreshAnalyzedProjectCount = async () => {
  if (!isDesktopRuntime) return
  analyzedProjectCount.value = (await electronAPI.getRecentProjects()).length
}

onMounted(() => {
  if (isDesktopRuntime) {
    refreshAnalyzedProjectCount()
    window.addEventListener('projects-updated', refreshAnalyzedProjectCount)
  }
})

onUnmounted(() => {
  if (isDesktopRuntime) {
    window.removeEventListener('projects-updated', refreshAnalyzedProjectCount)
  }
})

watch(() => route.fullPath, async () => {
  await nextTick()
  pageSurface.value?.scrollTo({ top: 0, left: 0 })
})

const activeNav = computed(() => {
  if (route.path.startsWith('/projects')) return 'projects'
  if (route.path.startsWith('/settings') || route.path.startsWith('/ai-config')) return 'settings'
  return 'home'
})
</script>

<style>
:root {
  color: #111827;
  background: #eef3f8;
  font-family:
    Inter,
    "Microsoft YaHei",
    "PingFang SC",
    "Segoe UI",
    Arial,
    sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
}

button,
input,
select,
textarea {
  font: inherit;
}

.app-shell {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 80% 10%, rgba(23, 192, 196, 0.12), transparent 30%),
    linear-gradient(135deg, #f8fbff 0%, #eef3f8 100%);
  border: 1px solid rgba(148, 163, 184, 0.42);
  display: grid;
  grid-template-rows: 1fr 54px;
}

.product-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 10px 20px rgba(8, 123, 200, 0.18);
}

.product-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: 300px 1fr;
}

.sidebar {
  min-height: 0;
  padding: 24px 16px 28px;
  background: rgba(255, 255, 255, 0.62);
  border-right: 1px solid rgba(203, 213, 225, 0.76);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  backdrop-filter: blur(18px);
}

.nav-list {
  display: grid;
  gap: 14px;
}

.nav-item {
  min-height: 60px;
  padding: 0 18px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 16px;
  color: #263346;
  text-decoration: none;
  font-size: 20px;
  font-weight: 560;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.nav-item .el-icon {
  font-size: 26px;
}

.nav-item:hover,
.nav-item.active {
  color: #075ee8;
  background: linear-gradient(135deg, rgba(219, 234, 254, 0.92), rgba(241, 247, 255, 0.9));
  box-shadow: inset 0 0 0 1px rgba(191, 219, 254, 0.64);
}

.sidebar-footer {
  display: grid;
  gap: 16px;
}

.product-card {
  min-height: 94px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(203, 213, 225, 0.76);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.product-card strong {
  display: block;
  color: #111827;
  font-size: 17px;
  line-height: 1.35;
}

.product-card span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 14px;
}

.status-left i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 7px;
  background: #18c39a;
}

.page-surface {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 32px;
}

.statusbar {
  height: 54px;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #64748b;
  background: rgba(255, 255, 255, 0.72);
  border-top: 1px solid rgba(203, 213, 225, 0.78);
  font-size: 16px;
}

.status-left,
.status-right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.status-right .el-icon {
  color: #334155;
}

.el-button {
  border-radius: 8px;
}

.el-card {
  border-radius: 12px;
}

.desktop-required {
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: center;
  padding: 28px;
  background:
    radial-gradient(circle at 70% 10%, rgba(37, 99, 235, 0.14), transparent 32%),
    linear-gradient(135deg, #f8fbff 0%, #eef3f8 100%);
}

.desktop-required-card {
  width: min(560px, 100%);
  padding: 42px;
  border: 1px solid rgba(191, 219, 254, 0.86);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.12);
  text-align: center;
}

.desktop-required-card img {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  box-shadow: 0 16px 34px rgba(37, 99, 235, 0.18);
}

.desktop-required-card .eyebrow {
  margin: 22px 0 8px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.desktop-required-card h1 {
  margin: 0;
  color: #111827;
  font-size: 30px;
  line-height: 1.25;
}

.desktop-required-card p {
  margin: 18px 0 0;
  color: #475569;
  font-size: 16px;
  line-height: 1.8;
}

.desktop-required-actions {
  margin-top: 28px;
}

.desktop-required-actions a {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  border-radius: 999px;
  color: #ffffff;
  background: #2563eb;
  text-decoration: none;
  font-weight: 700;
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.24);
}

@media (max-width: 980px) {
  .workspace {
    grid-template-columns: 92px 1fr;
  }

  .sidebar {
    padding: 18px 12px;
  }

  .nav-item {
    justify-content: center;
    padding: 0;
  }

  .nav-item span,
  .product-card div:not(.product-icon) {
    display: none;
  }

  .product-card {
    justify-content: center;
    min-height: 72px;
    padding: 12px;
  }

  .page-surface {
    padding: 24px;
  }
}

@media (max-width: 720px) {
  .page-surface {
    padding: 18px;
  }
}
</style>
