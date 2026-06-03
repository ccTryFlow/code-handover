import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AnalyzeProgress } from './types';

type CliProviderStatus = 'ready' | 'missing' | 'auth-required' | 'error';

interface CliProviderDetection {
  type: string;
  name: string;
  cliCommand: string;
  available: boolean;
  ready: boolean;
  status: CliProviderStatus;
  message: string;
  version?: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  checkGitRepo: (localPath: string) => ipcRenderer.invoke('check-git-repo', localPath),
  getBranches: (localPath: string) => ipcRenderer.invoke('get-branches', localPath),
  getRemoteBranches: (url: string, token?: string) => ipcRenderer.invoke('get-remote-branches', { url, token }),
  getAuthors: (localPath: string) => ipcRenderer.invoke('get-authors', localPath),
  analyzeProject: (localPath: string, options: any) => ipcRenderer.invoke('analyze-project', { localPath, options }),
  onAnalyzeProgress: (callback: (progress: AnalyzeProgress) => void) => {
    const listener = (_event: IpcRendererEvent, progress: AnalyzeProgress) => callback(progress);
    ipcRenderer.on('analyze-progress', listener);
    return () => ipcRenderer.removeListener('analyze-progress', listener);
  },
  generateDocument: (result: any, outputPath: string) => ipcRenderer.invoke('generate-document', { result, outputPath }),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  removeRecentProject: (projectPath: string) => ipcRenderer.invoke('remove-recent-project', projectPath),
  getDefaultCloneDirectory: (parentPath: string, repoUrl: string) =>
    ipcRenderer.invoke('get-default-clone-directory', { parentPath, repoUrl }),
  cloneRepo: (url: string, localPath: string, branch?: string, token?: string) =>
    ipcRenderer.invoke('clone-repo', { url, localPath, branch, token }),
  // AI Provider APIs
  detectCliProviders: () => ipcRenderer.invoke('detect-cli-providers'),
  loadAiProviders: () => ipcRenderer.invoke('load-ai-providers'),
  saveAiProviders: (providers: any[]) => ipcRenderer.invoke('save-ai-providers', providers),
  testAiProvider: (provider: any) => ipcRenderer.invoke('test-ai-provider', provider),
  aiSummarize: (result: any, provider: any) => ipcRenderer.invoke('ai-summarize', { result, provider }),
});

declare global {
  interface Window {
    electronAPI: {
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
      detectCliProviders: (force?: boolean) => Promise<CliProviderDetection[]>;
      loadAiProviders: () => Promise<any[]>;
      saveAiProviders: (providers: any[]) => Promise<boolean>;
      testAiProvider: (provider: any) => Promise<{ success: boolean; content: string; error?: string }>;
      aiSummarize: (result: any, provider: any) => Promise<{ success: boolean; content: string; error?: string; provider?: string; model?: string }>;
    };
  }
}
