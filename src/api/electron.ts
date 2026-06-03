import type { AnalyzeProgress } from '@electron/types'

interface ElectronAPI {
  selectDirectory: () => Promise<string | null>;
  checkGitRepo: (localPath: string) => Promise<boolean>;
  getBranches: (localPath: string) => Promise<{ branches: string[]; currentBranch: string }>;
  getRemoteBranches: (url: string, token?: string) => Promise<{ branches: string[]; currentBranch: string; error?: string }>;
  getAuthors: (localPath: string) => Promise<Array<{ name: string; email: string; commitCount: number }>>;
  analyzeProject: (localPath: string, options: any) => Promise<any>;
  onAnalyzeProgress: (callback: (progress: AnalyzeProgress) => void) => () => void;
  generateDocument: (result: any, outputPath: string) => Promise<string>;
  openFile: (filePath: string) => Promise<boolean>;
  getRecentProjects: () => Promise<Array<{
    name: string;
    path: string;
    lastAnalyzed: string;
    language?: string;
    framework?: string;
    documentPath?: string;
    fileCount?: number;
    moduleCount?: number;
  }>>;
  removeRecentProject: (projectPath: string) => Promise<boolean>;
  getDefaultCloneDirectory: (parentPath: string, repoUrl: string) => Promise<string>;
  cloneRepo: (url: string, localPath: string, branch?: string, token?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  detectCliProviders: () => Promise<Array<{ type: string; name: string; cliCommand: string; available: boolean }>>;
  loadAiProviders: () => Promise<any[]>;
  saveAiProviders: (providers: any[]) => Promise<boolean>;
  testAiProvider: (provider: any) => Promise<{ success: boolean; content: string; error?: string }>;
  aiSummarize: (result: any, provider: any) => Promise<{ success: boolean; content: string; error?: string; provider?: string; model?: string }>;
}

const missingElectronBridge = (): never => {
  throw new Error('未检测到 Electron 桌面桥接，请通过桌面应用运行 CodeHandover')
}

const fallback: ElectronAPI = {
  selectDirectory: async () => null,
  checkGitRepo: async () => false,
  getBranches: async () => ({ branches: [], currentBranch: '' }),
  getRemoteBranches: async () => ({ branches: [], currentBranch: '' }),
  getAuthors: async () => [],
  analyzeProject: async () => missingElectronBridge(),
  onAnalyzeProgress: () => () => undefined,
  generateDocument: async () => missingElectronBridge(),
  openFile: async () => false,
  getRecentProjects: async () => [],
  removeRecentProject: async () => false,
  getDefaultCloneDirectory: async (parentPath: string) => parentPath,
  cloneRepo: async () => ({ success: false }),
  detectCliProviders: async () => [],
  loadAiProviders: async () => [],
  saveAiProviders: async () => false,
  testAiProvider: async () => ({ success: false, content: '', error: 'Not in Electron' }),
  aiSummarize: async () => ({ success: false, content: '', error: 'Not in Electron' }),
};

function toIpcPayload<T>(value: T): T {
  if (value === undefined || value === null) {
    return value
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch (error) {
    throw new Error(`IPC 参数包含不可序列化的数据：${error instanceof Error ? error.message : String(error)}`)
  }
}

const bridge: ElectronAPI = (window as any).electronAPI || fallback;

export function isElectronRuntime(): boolean {
  return Boolean((window as any).electronAPI);
}

function notifyProjectsUpdated(): void {
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('projects-updated'))
  }
}

export const electronAPI: ElectronAPI = {
  selectDirectory: () => bridge.selectDirectory(),
  checkGitRepo: (localPath: string) => bridge.checkGitRepo(localPath),
  getBranches: (localPath: string) => bridge.getBranches(localPath),
  getRemoteBranches: (url: string, token?: string) => bridge.getRemoteBranches(url, token),
  getAuthors: (localPath: string) => bridge.getAuthors(localPath),
  analyzeProject: (localPath: string, options: any) => bridge.analyzeProject(localPath, toIpcPayload(options)),
  onAnalyzeProgress: (callback: (progress: AnalyzeProgress) => void) => bridge.onAnalyzeProgress(callback),
  generateDocument: async (result: any, outputPath: string) => {
    const documentPath = await bridge.generateDocument(toIpcPayload(result), outputPath)
    if (!documentPath) {
      throw new Error('文档生成失败：主进程未返回有效的输出路径')
    }
    notifyProjectsUpdated()
    return documentPath
  },
  openFile: (filePath: string) => bridge.openFile(filePath),
  getRecentProjects: () => bridge.getRecentProjects(),
  removeRecentProject: async (projectPath: string) => {
    const removed = await bridge.removeRecentProject(projectPath)
    if (removed) {
      notifyProjectsUpdated()
    }
    return removed
  },
  getDefaultCloneDirectory: (parentPath: string, repoUrl: string) => bridge.getDefaultCloneDirectory(parentPath, repoUrl),
  cloneRepo: (url: string, localPath: string, branch?: string, token?: string) =>
    bridge.cloneRepo(url, localPath, branch, token),
  detectCliProviders: () => bridge.detectCliProviders(),
  loadAiProviders: () => bridge.loadAiProviders(),
  saveAiProviders: (providers: any[]) => bridge.saveAiProviders(toIpcPayload(providers)),
  testAiProvider: (provider: any) => bridge.testAiProvider(toIpcPayload(provider)),
  aiSummarize: (result: any, provider: any) =>
    bridge.aiSummarize(toIpcPayload(result), toIpcPayload(provider)),
};

export default electronAPI;
