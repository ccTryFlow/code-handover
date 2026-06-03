import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('./pages/Home.vue'),
    },
    {
      path: '/projects',
      name: 'Projects',
      component: () => import('./pages/Projects.vue'),
    },
    {
      path: '/local-project',
      name: 'LocalProject',
      component: () => import('./pages/LocalProject.vue'),
    },
    {
      path: '/remote-repo',
      name: 'RemoteRepo',
      component: () => import('./pages/RemoteRepo.vue'),
    },
    {
      path: '/analyze-config',
      name: 'AnalyzeConfig',
      component: () => import('./pages/AnalyzeConfig.vue'),
    },
    {
      path: '/analyze-progress',
      name: 'AnalyzeProgress',
      component: () => import('./pages/AnalyzeProgress.vue'),
    },
    {
      path: '/result',
      name: 'Result',
      component: () => import('./pages/Result.vue'),
    },
    {
      path: '/settings',
      name: 'AiConfig',
      alias: '/ai-config',
      component: () => import('./pages/AiConfig.vue'),
    },
  ],
})

export default router
