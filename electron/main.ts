import { app, BrowserWindow, ipcMain, dialog, shell, Menu, type MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';

// Git module imports
import { cloneRepo, getDefaultCloneDirectory, getRemoteBranches } from './git/clone';
import { getAllBranches, getCurrentBranch } from './git/branch';
import { getAuthors } from './git/author';

// Analyzer import
import { analyzeProject } from './analyzer/index';

// Export import
import { generateDocument } from './export/document';
import { getRecentProjects, removeProject, saveProject } from './storage/projectStore';

// AI Provider import
import { detectAvailableCliProviders, testAIProvider } from './ai/provider';
import { generateAiSummary } from './ai/summary';

// Provider storage
import * as os from 'os';
const PROVIDERS_CONFIG_PATH = path.join(os.homedir(), '.codehandover', 'ai-providers.json');

async function loadProviders(): Promise<any[]> {
  try {
    const data = await fs.readFile(PROVIDERS_CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (_e) { return []; }
}

async function saveProviders(providers: any[]): Promise<void> {
  await fs.mkdir(path.dirname(PROVIDERS_CONFIG_PATH), { recursive: true });
  await fs.writeFile(PROVIDERS_CONFIG_PATH, JSON.stringify(providers, null, 2), 'utf-8');
}

let mainWindow: BrowserWindow | null = null;

function registerContextMenu(browserWindow: BrowserWindow): void {
  browserWindow.webContents.on('context-menu', (_event, params) => {
    const menuItems: MenuItemConstructorOptions[] = [];

    if (params.isEditable) {
      menuItems.push(
        { label: '撤销', role: 'undo', enabled: params.editFlags.canUndo },
        { label: '重做', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: '剪切', role: 'cut', enabled: params.editFlags.canCut },
        { label: '复制', role: 'copy', enabled: params.editFlags.canCopy },
        { label: '粘贴', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: '全选', role: 'selectAll', enabled: params.editFlags.canSelectAll }
      );
    } else if (params.selectionText.trim()) {
      menuItems.push(
        { label: '复制', role: 'copy', enabled: params.editFlags.canCopy },
        { type: 'separator' },
        { label: '全选', role: 'selectAll', enabled: params.editFlags.canSelectAll }
      );
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup({ window: browserWindow });
    }
  });
}

function createWindow(): void {
  const iconPath = path.join(__dirname, app.isPackaged ? '../dist/favicon.ico' : '../public/favicon.ico');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  registerContextMenu(mainWindow);

  // 开发模式由 Vite 注入服务地址；生产模式必须加载构建后的静态入口。
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handler: select-directory
ipcMain.handle('select-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '选择项目目录'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  } catch (error) {
    console.error('Failed to select directory:', error);
    return null;
  }
});

// IPC Handler: check-git-repo
ipcMain.handle('check-git-repo', async (_event, localPath: string) => {
  try {
    const gitPath = path.join(localPath, '.git');
    return existsSync(gitPath);
  } catch (error) {
    console.error('Failed to check git repo:', error);
    return false;
  }
});

// IPC Handler: get-branches
ipcMain.handle('get-branches', async (_event, localPath: string) => {
  try {
    const branches = await getAllBranches(localPath);
    const currentBranch = await getCurrentBranch(localPath);
    return { branches, currentBranch };
  } catch (error) {
    console.error('Failed to get branches:', error);
    return { branches: [], currentBranch: '' };
  }
});

// IPC Handler: get-authors
ipcMain.handle('get-authors', async (_event, localPath: string) => {
  try {
    const authors = await getAuthors(localPath);
    return authors;
  } catch (error) {
    console.error('Failed to get authors:', error);
    return [];
  }
});

// IPC Handler: analyze-project
ipcMain.handle('analyze-project', async (event, payload: { localPath: string; options: any }) => {
  try {
    const { localPath, options } = payload;
    const result = await analyzeProject(localPath, options, progress => {
      event.sender.send('analyze-progress', progress);
    });
    return result;
  } catch (error) {
    console.error('Failed to analyze project:', error);
    throw error;
  }
});

// IPC Handler: generate-document
ipcMain.handle('generate-document', async (_event, payload: { result: any; outputPath: string }) => {
  try {
    const { result, outputPath } = payload;
    if (!result || typeof result !== 'object') {
      throw new Error('缺少有效的项目分析结果');
    }
    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('缺少有效的文档输出路径');
    }

    const filePath = await generateDocument(result, outputPath);
    await fs.access(filePath);
    await saveProject({
      name: result.projectName || path.basename(result.localPath || path.dirname(filePath)),
      path: result.localPath || path.dirname(filePath),
      lastAnalyzed: new Date().toISOString(),
      language: result.languages?.[0]?.language,
      framework: result.frameworks?.[0]?.name,
      documentPath: filePath,
      fileCount: result.files?.length,
      moduleCount: result.modules?.length,
    });
    return filePath;
  } catch (error) {
    console.error('Failed to generate document:', error);
    throw error;
  }
});

// IPC Handler: get-recent-projects
ipcMain.handle('get-recent-projects', async () => {
  try {
    return await getRecentProjects();
  } catch (error) {
    console.error('Failed to get recent projects:', error);
    return [];
  }
});

// IPC Handler: remove-recent-project
ipcMain.handle('remove-recent-project', async (_event, projectPath: string) => {
  try {
    await removeProject(projectPath);
    return true;
  } catch (error) {
    console.error('Failed to remove recent project:', error);
    return false;
  }
});

// IPC Handler: open-file
ipcMain.handle('open-file', async (_event, filePath: string) => {
  try {
    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) {
      console.error('Failed to open file:', errorMessage);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to open file:', error);
    return false;
  }
});

// IPC Handler: clone-repo
ipcMain.handle('clone-repo', async (_event, payload: { url: string; localPath: string; branch?: string; token?: string }) => {
  try {
    const { url, localPath, branch, token } = payload;
    await cloneRepo(url, localPath, branch, token);
    return { success: true, path: localPath };
  } catch (error) {
    console.error('Failed to clone repo:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// IPC Handler: get-default-clone-directory
ipcMain.handle('get-default-clone-directory', async (_event, payload: { parentPath: string; repoUrl: string }) => {
  try {
    const { parentPath, repoUrl } = payload;
    return getDefaultCloneDirectory(parentPath, repoUrl);
  } catch (error) {
    console.error('Failed to resolve default clone directory:', error);
    return payload.parentPath;
  }
});

// IPC Handler: get-remote-branches
ipcMain.handle('get-remote-branches', async (_event, payload: { url: string; token?: string }) => {
  try {
    const { url, token } = payload;
    const branches = await getRemoteBranches(url, token);
    return { branches, currentBranch: branches[0] || '' };
  } catch (error) {
    console.error('Failed to get remote branches:', error);
    return { branches: [], currentBranch: '', error: error instanceof Error ? error.message : String(error) };
  }
});

// IPC Handler: detect-cli-providers
ipcMain.handle('detect-cli-providers', async () => {
  try {
    return await detectAvailableCliProviders();
  } catch (error) {
    console.error('Failed to detect CLI providers:', error);
    return [];
  }
});

// IPC Handler: load-ai-providers
ipcMain.handle('load-ai-providers', async () => {
  try {
    return await loadProviders();
  } catch (error) {
    console.error('Failed to load AI providers:', error);
    return [];
  }
});

// IPC Handler: save-ai-providers
ipcMain.handle('save-ai-providers', async (_event, providers: any[]) => {
  try {
    await saveProviders(providers);
    return true;
  } catch (error) {
    console.error('Failed to save AI providers:', error);
    return false;
  }
});

// IPC Handler: test-ai-provider
ipcMain.handle('test-ai-provider', async (_event, provider: any) => {
  try {
    return await testAIProvider(provider);
  } catch (error) {
    return { success: false, error: (error as Error).message, content: '', provider: provider.name };
  }
});

// IPC Handler: ai-summarize
ipcMain.handle('ai-summarize', async (_event, { result, provider }) => {
  try {
    return await generateAiSummary(result, provider);
  } catch (error) {
    return { success: false, error: (error as Error).message, content: '', provider: provider?.name || '' };
  }
});

// App lifecycle handlers
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
