import { detectLanguages } from './language';
import { detectFrameworks } from './framework';
import { scanLaravelModules } from './laravel';
import { scanGinModules } from './gin';
import { scanSpringBootModules } from './springboot';
import { scanVueModules } from './vue';
import { scanGenericModules } from './generic';
import { scanFiles, scanKeyFiles } from './fileScanner';
import { buildProjectProfile } from './projectProfile';
import { analyzeProjectAst } from './ast';
import { getFrameworkAdapter } from './frameworkRegistry';
import { getAuthors } from '../git/author';
import { getCurrentBranch } from '../git/branch';
import { getCommitsByAuthor, getCommitHash } from '../git/log';
import { getChangedFiles } from '../git/status';
import {
  AnalyzeOptions,
  AnalyzeProgress,
  ProjectAnalysisResult,
  ModuleSummary,
  GitAnalysisResult,
  GitAuthorSummary,
  GitAuthorDetail,
  GitChangedFile,
  GitContributionStat,
  FileSummary,
} from '../types';

export {
  detectLanguages,
  detectFrameworks,
  scanLaravelModules,
  scanGinModules,
  scanSpringBootModules,
  scanVueModules,
  scanGenericModules,
  scanFiles,
  scanKeyFiles,
  buildProjectProfile,
  analyzeProjectAst,
};

async function performGitAnalysis(
  localPath: string,
  options: AnalyzeOptions
): Promise<GitAnalysisResult | undefined> {
  try {
    const authors = await getAuthors(localPath);

    let selectedAuthor: GitAuthorDetail | undefined;

    if (options.authorName || options.authorEmail) {
      const authorKey = options.authorEmail || options.authorName || '';
      const commits = await getCommitsByAuthor(localPath, authorKey, options.since, options.until);
      const changedFiles = await getChangedFiles(localPath, authorKey, options.since, options.until);

      const matchingAuthor = findMatchingAuthor(authors, options.authorName, options.authorEmail);
      const totalAdditions = changedFiles.reduce((sum, file) => sum + (file.additions || 0), 0);
      const totalDeletions = changedFiles.reduce((sum, file) => sum + (file.deletions || 0), 0);
      const sortedRiskFiles = changedFiles
        .filter(file => file.riskLevel && file.riskLevel !== 'low')
        .sort((left, right) => riskWeight(right.riskLevel) - riskWeight(left.riskLevel) || right.changeCount - left.changeCount);

      selectedAuthor = {
        name: matchingAuthor?.name || options.authorName || '',
        email: matchingAuthor?.email || options.authorEmail || '',
        commitCount: matchingAuthor?.commitCount || commits.length,
        analysisCommitCount: commits.length,
        firstCommitDate: commits.length > 0 ? commits[commits.length - 1].date : undefined,
        lastCommitDate: commits.length > 0 ? commits[0].date : undefined,
        totalAdditions,
        totalDeletions,
        languageStats: buildContributionStats(changedFiles, 'language'),
        moduleStats: buildContributionStats(changedFiles, 'moduleName'),
        riskFiles: sortedRiskFiles.slice(0, 20),
        changedFiles,
        recentCommits: commits.slice(0, 20).map(c => ({
          hash: c.hash,
          authorName: c.authorName,
          authorEmail: c.authorEmail,
          date: c.date,
          message: c.message,
          files: c.files,
          additions: c.additions,
          deletions: c.deletions,
        })),
      };
    }

    return { authors, selectedAuthor };
  } catch (error) {
    console.error('Git analysis failed:', error);
    return undefined;
  }
}

function findMatchingAuthor(
  authors: GitAuthorSummary[],
  authorName?: string,
  authorEmail?: string
): GitAuthorSummary | undefined {
  const email = normalizeAuthorValue(authorEmail);
  const name = normalizeAuthorValue(authorName);
  return authors.find(author => {
    const currentEmail = normalizeAuthorValue(author.email);
    const currentName = normalizeAuthorValue(author.name);
    return Boolean(email && currentEmail === email)
      || Boolean(name && currentName === name)
      || Boolean(email && currentName === email)
      || Boolean(name && currentEmail === name);
  });
}

function buildContributionStats(
  changedFiles: GitChangedFile[],
  key: 'language' | 'moduleName'
): GitContributionStat[] {
  const stats = new Map<string, GitContributionStat>();
  for (const file of changedFiles) {
    const name = file[key] || 'Unknown';
    if (!stats.has(name)) {
      stats.set(name, {
        name,
        fileCount: 0,
        changeCount: 0,
        additions: 0,
        deletions: 0,
      });
    }

    const stat = stats.get(name)!;
    stat.fileCount++;
    stat.changeCount += file.changeCount;
    stat.additions += file.additions || 0;
    stat.deletions += file.deletions || 0;
  }

  return Array.from(stats.values())
    .sort((left, right) => right.changeCount - left.changeCount || right.fileCount - left.fileCount);
}

function normalizeAuthorValue(value?: string): string {
  return (value || '').trim().replace(/^<|>$/g, '').toLowerCase();
}

function riskWeight(level?: 'low' | 'medium' | 'high'): number {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  return 1;
}

export async function analyzeProject(
  localPath: string,
  options: AnalyzeOptions,
  progressCallback?: (progress: AnalyzeProgress) => void
): Promise<ProjectAnalysisResult> {
  const totalStages = options.enableGitAnalysis ? 11 : 8;
  let currentStage = 0;

  const report = (stage: string, message: string) => {
    currentStage++;
    progressCallback?.({
      stage,
      stageIndex: currentStage,
      totalStages,
      message,
      percentage: Math.round((currentStage / totalStages) * 100),
    });
  };

  // Stage 1: Detect languages
  report('detectLanguages', '正在识别项目语言...');
  const languages = await detectLanguages(localPath);

  // Stage 2: Detect frameworks
  report('detectFrameworks', '正在识别项目框架...');
  const frameworks = await detectFrameworks(localPath);

  // Stage 3: Scan modules
  report('scanModules', '正在扫描项目模块...');
  let modules: ModuleSummary[] = [];
  if (frameworks.length > 0) {
    const adapter = getFrameworkAdapter(frameworks[0].name);
    if (adapter) modules = await adapter.scanModules(localPath);
  }
  if (modules.length === 0) {
    modules = await scanGenericModules(localPath);
  }

  // Stage 4: Scan files
  report('scanFiles', '正在扫描项目文件...');
  const files = await scanFiles(localPath);

  // Stage 5: Key files
  report('scanKeyFiles', '正在识别关键文件...');
  const primaryFramework = frameworks.length > 0 ? frameworks[0].name : 'generic';
  const keyFiles = await scanKeyFiles(localPath, primaryFramework);

  // Merge key files not already in files list
  const existingPaths = new Set(files.map(f => f.path.replace(/\\/g, '/').toLowerCase()));
  for (const kf of keyFiles) {
    const normalizedKeyFile = kf.replace(/\\/g, '/');
    if (!existingPaths.has(normalizedKeyFile.toLowerCase())) {
      const path = await import('path');
      const fs = await import('fs/promises');
      try {
        const fullPath = path.join(localPath, kf);
        const stat = await fs.stat(fullPath);
        files.push({
          path: kf,
          name: path.basename(kf),
          extension: path.extname(kf),
          language: 'Unknown',
          size: stat.size,
        });
        existingPaths.add(normalizedKeyFile.toLowerCase());
      } catch (_e) { /* skip */ }
    }
  }

  // Stage 6: Build a framework-independent project profile
  report('projectProfile', '正在整理 README、依赖、配置和启动命令...');
  const profile = await buildProjectProfile(localPath, files);

  // Stage 7: Parse supported languages through Tree-sitter
  report('astAnalysis', '正在通过 Tree-sitter 解析已支持语言的代码结构...');
  const ast = await analyzeProjectAst(localPath, files);

  // Git analysis stages (optional)
  let git: GitAnalysisResult | undefined;
  let branch: string | undefined;
  let commitHash: string | undefined;

  if (options.enableGitAnalysis) {
    report('gitAuthors', '正在读取 Git 提交用户...');
    report('gitCommits', '正在统计用户提交文件...');
    report('gitAnalysis', '正在生成 Git 分析结果...');
    git = await performGitAnalysis(localPath, options);

    try {
      branch = await getCurrentBranch(localPath);
      commitHash = await getCommitHash(localPath);
    } catch (_e) { /* ignore */ }
  }

  // Final stage
  report('complete', '分析完成！');

  const projectName = localPath.split(/[\/\\]/).filter(Boolean).pop() || 'Unknown';

  return {
    projectName,
    localPath,
    repoUrl: options.repoUrl,
    branch: options.branch || branch,
    commitHash,
    languages,
    frameworks,
    profile,
    ast,
    git,
    modules,
    files,
    generatedAt: new Date().toISOString(),
  };
}

export async function quickAnalyze(localPath: string): Promise<{
  languages: Array<{ language: string; fileCount: number; percentage: number; extensions: string[] }>;
  frameworks: Array<{ name: string; confidence: number; evidence: string[] }>;
}> {
  const [languages, frameworks] = await Promise.all([
    detectLanguages(localPath),
    detectFrameworks(localPath),
  ]);
  return { languages, frameworks };
}
