import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileSummary, GitChangedFile, GitContributionStat, ModuleSummary, ProjectAnalysisResult } from '../types';
import { getLinesLastChangedByAuthor } from '../git/blame';

interface SourceMethodSummary {
  visibility: string;
  name: string;
  params: string;
  doc?: string;
  intent: string;
  logicNotes: string[];
}

interface SourceLogicSummary {
  filePath: string;
  changeCount: number;
  category: string;
  businessArea: string;
  namespace?: string;
  className?: string;
  extendsName?: string;
  commandSignature?: string;
  table?: string;
  fillable: string[];
  relations: string[];
  methods: SourceMethodSummary[];
  routes: string[];
  notes: string[];
}

interface PersonalScope {
  changedFiles: GitChangedFile[];
  changedPathSet: Set<string>;
  files: FileSummary[];
  modules: ModuleSummary[];
}

export async function generateMarkdown(result: ProjectAnalysisResult, outputPath: string): Promise<string> {
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  const markdown = await buildMarkdownContent(result);

  await fs.writeFile(outputPath, markdown, 'utf-8');
  return outputPath;
}

export async function buildMarkdownContent(result: ProjectAnalysisResult): Promise<string> {
  return result.git?.selectedAuthor
    ? await buildPersonalMarkdownContent(result)
    : await buildProjectMarkdownContent(result);
}

async function buildPersonalMarkdownContent(result: ProjectAnalysisResult): Promise<string> {
  const author = result.git!.selectedAuthor!;
  const scope = getPersonalScope(result);
  const totalChangeCount = scope.changedFiles.reduce((sum, file) => sum + file.changeCount, 0);
  const areaRows = groupChangedFilesByBusinessArea(scope.changedFiles);
  const riskFiles = author.riskFiles?.length
    ? author.riskFiles.filter(file => isHandoverSourceFile(file.filePath))
    : scope.changedFiles.filter(file => file.riskLevel && file.riskLevel !== 'low').slice(0, 20);
  const keyFiles = scope.changedFiles.filter(file => file.exists !== false).slice(0, 35);
  const keyFilePathSet = new Set(keyFiles.map(file => normalizePath(file.filePath)));
  const sourceSummaries = (await Promise.all(
    scope.changedFiles
      .filter(file => file.exists !== false)
      .map(file => inspectSourceFile(result.localPath, file.filePath, file.changeCount, author.email || author.name))
  )).filter(Boolean) as SourceLogicSummary[];
  const logicSummaries = sourceSummaries.filter(summary => keyFilePathSet.has(normalizePath(summary.filePath)));

  const sections: string[] = [];
  sections.push(`# ${author.name} 个人代码交接文档\n`);

  sections.push('## 1. 交接范围说明');
  sections.push(`- 项目名称：${result.projectName}`);
  sections.push(`- 项目路径：${result.localPath}`);
  sections.push(`- 交接人员：${author.name} <${author.email}>`);
  sections.push(`- 分析分支：${result.branch || '-'}`);
  sections.push(`- 当前提交：${result.commitHash || '-'}`);
  sections.push(`- 生成时间：${result.generatedAt}`);
  sections.push('- 范围规则：本文档只统计并展开该 Git 作者提交记录中涉及的文件，未由该作者修改过的模块、接口、命令、配置不会作为交接主体输出。');
  sections.push('');

  sections.push('## 2. 个人贡献摘要');
  sections.push(`- 仓库总提交次数：${author.commitCount}`);
  sections.push(`- 本次分析范围提交次数：${author.analysisCommitCount ?? author.recentCommits.length}`);
  sections.push(`- 贡献时间范围：${formatDateRange(author.firstCommitDate, author.lastCommitDate)}`);
  sections.push(`- 涉及文件数：${scope.changedFiles.length}`);
  sections.push(`- 当前仍存在文件数：${scope.changedFiles.filter(file => file.exists !== false).length}`);
  sections.push(`- 文件修改累计频次：${totalChangeCount}`);
  sections.push(`- 累计增删行：+${author.totalAdditions || 0} / -${author.totalDeletions || 0}`);
  sections.push(`- 个人涉及语言：${formatContributionStats(author.languageStats, formatPersonalLanguages(scope.files, scope.changedFiles))}`);
  sections.push(`- 个人涉及模块：${formatContributionStats(author.moduleStats, '-')}`);
  sections.push(`- 个人涉及框架：${result.frameworks.length > 0 ? result.frameworks.map(item => `${item.name} (${formatConfidencePercent(item.confidence)}%)`).join('、') : '-'}`);
  sections.push('');

  appendAiSummarySection(sections, result);
  sections.push('## Tree-sitter AST 语言分析');
  sections.push(describeAstAnalysis(result, scope.changedPathSet));

  sections.push('## 3. 主要负责业务域');
  if (areaRows.length === 0) {
    sections.push('未识别到该人员的有效变更文件。\n');
  } else {
    for (const area of areaRows.slice(0, 12)) {
      const topFiles = area.files.slice(0, 5).map(file => `\`${file.filePath}\``).join('、');
      sections.push(`- **${area.name}**：${area.files.length} 个文件，累计 ${area.changeCount} 次修改。重点文件：${topFiles}`);
    }
    sections.push('');
  }

  sections.push('## 4. 提交时间线和风险文件');
  sections.push('### 4.1 最近提交');
  if (author.recentCommits.length === 0) {
    sections.push('未识别到该人员在当前时间范围内的提交记录。\n');
  } else {
    for (const commit of author.recentCommits.slice(0, 12)) {
      sections.push(`- \`${commit.hash}\` ${commit.date}：${commit.message}（${commit.files.length} 个文件，+${commit.additions || 0}/-${commit.deletions || 0}）`);
    }
    sections.push('');
  }

  sections.push('### 4.2 需要优先交接的风险文件');
  if (riskFiles.length === 0) {
    sections.push('未识别到明显高风险责任文件，仍建议按高频文件逐个确认业务规则。\n');
  } else {
    for (const file of riskFiles.slice(0, 12)) {
      sections.push(`- \`${file.filePath}\`：${formatRiskLevel(file.riskLevel)}，${formatChangedFileState(file)}，${formatRiskReasons(file)}`);
    }
    sections.push('');
  }

  sections.push('## 5. 关键代码逻辑');
  if (logicSummaries.length === 0) {
    sections.push('未能读取该人员负责文件的源码内容，请确认文件仍存在于当前工作区。\n');
  } else {
    for (const summary of logicSummaries) {
      sections.push(formatSourceLogicSummary(summary));
    }
  }

  sections.push('## 6. 个人涉及接口、命令、数据和配置');
  sections.push('### 6.1 接口入口');
  sections.push(listApiEndpoints(scope.modules, sourceSummaries));
  sections.push('### 6.2 命令 / 定时任务');
  sections.push(listCommands(scope.modules, sourceSummaries));
  sections.push('### 6.3 数据表 / 模型');
  sections.push(listTables(scope.modules, sourceSummaries));
  sections.push('### 6.4 配置文件');
  sections.push(listConfigFiles(scope.modules, scope.changedFiles));

  sections.push('## 7. 高频修改文件清单');
  scope.changedFiles.slice(0, 60).forEach((file, index) => {
    sections.push(`${index + 1}. \`${file.filePath}\`：${file.changeCount} 次修改，${formatChangedFileState(file)}，+${file.additions || 0}/-${file.deletions || 0}，${formatFileCommitWindow(file)}，${describeFileResponsibility(file.filePath)}`);
  });
  sections.push('');

  sections.push('## 8. 交接重点和风险');
  sections.push(buildPersonalHandoverFocus(author.name, logicSummaries, scope.changedFiles));

  sections.push('## 9. 后续补充建议');
  sections.push(buildPersonalSuggestions(logicSummaries));

  return sections.join('\n');
}

async function buildProjectMarkdownContent(result: ProjectAnalysisResult): Promise<string> {
  const sections: string[] = [];
  sections.push('# 项目交接文档\n');

  sections.push('## 1. 基本信息');
  sections.push(`- 项目名称：${result.projectName}`);
  sections.push(`- 项目路径：${result.localPath}`);
  sections.push(`- 仓库地址：${result.repoUrl || '本地项目'}`);
  sections.push(`- 分析分支：${result.branch || '-'}`);
  sections.push(`- 当前提交：${result.commitHash || '-'}`);
  sections.push(`- 生成时间：${result.generatedAt}\n`);

  sections.push('## 2. 技术栈识别');
  const languages = getLanguageSummaries(result);
  sections.push(`- 主要语言：${languages.length > 0 ? languages.map(item => `${item.language} (${formatPercentage(item.percentage)}%)`).join('、') : '-'}`);
  sections.push(`- 主要框架：${result.frameworks.length > 0 ? result.frameworks.map(item => `${item.name} (${formatConfidencePercent(item.confidence)}%)`).join('、') : '-'}`);
  sections.push(`- 启动方式：${inferStartCommand(result)}\n`);

  appendAiSummarySection(sections, result);

  sections.push('## 3. Tree-sitter AST 语言分析');
  sections.push(describeAstAnalysis(result));

  sections.push('## 4. 通用项目画像');
  sections.push(describeProjectProfile(result, 4));

  sections.push('## 5. 项目目录结构说明');
  sections.push(describeDirectoryStructure(result.files, getProjectProfile(result).topLevelDirectories));

  sections.push('## 6. 主要模块');
  sections.push(describeModules(result.modules));

  sections.push('## 7. 接口、命令和配置');
  sections.push('### 7.1 接口入口');
  sections.push(listApiEndpoints(result.modules, []));
  sections.push('### 7.2 命令 / 定时任务');
  sections.push(listCommands(result.modules, []));
  sections.push('### 7.3 数据表 / 模型');
  sections.push(listTables(result.modules, []));
  sections.push('### 7.4 配置文件');
  sections.push(listConfigFiles(result.modules, []));

  sections.push('## 8. 交接重点');
  sections.push(identifyProjectHandoverFocus(result));

  sections.push('## 9. 风险点和注意事项');
  sections.push(identifyProjectRisks(result));

  return sections.join('\n');
}

function appendAiSummarySection(sections: string[], result: ProjectAnalysisResult): void {
  if (!result.aiSummary?.trim()) return;
  sections.push('## AI 交接摘要');
  if (result.aiSummaryProvider) {
    sections.push(`- 生成来源：${result.aiSummaryProvider}`);
  }
  sections.push('');
  sections.push(result.aiSummary.trim());
  sections.push('');
}

function getPersonalScope(result: ProjectAnalysisResult): PersonalScope {
  const changedFiles = (result.git?.selectedAuthor?.changedFiles || [])
    .filter(file => isHandoverSourceFile(file.filePath))
    .sort((a, b) => {
      if (a.exists !== b.exists) return a.exists === false ? 1 : -1;
      return b.changeCount - a.changeCount;
    });
  const changedPathSet = new Set(
    changedFiles
      .filter(file => file.exists !== false)
      .map(file => normalizePath(file.filePath))
  );
  const files = result.files.filter(file => changedPathSet.has(normalizePath(file.path)));
  const modules = result.modules
    .map(module => ({
      ...module,
      files: (module.files || []).filter(file => changedPathSet.has(normalizePath(file))),
      // 模块元数据是全仓聚合结果。个人文档必须从个人文件重新提取，不能直接透传。
      routes: [],
      commands: [],
      tables: [],
    }))
    .filter(module => module.files.length > 0);

  return { changedFiles, changedPathSet, files, modules };
}

function formatChangedFileState(file: GitChangedFile): string {
  const status = file.status || 'modified';
  const existsText = file.exists === false ? '当前工作区已不存在' : '当前工作区仍存在';

  if (status === 'renamed' && file.previousPath) {
    return `重命名文件，来源路径 \`${file.previousPath}\`，${existsText}`;
  }
  if (status === 'deleted') {
    return `已删除文件，${existsText}`;
  }
  if (status === 'added') {
    return `新增文件，${existsText}`;
  }
  if (status === 'copied' && file.previousPath) {
    return `复制文件，来源路径 \`${file.previousPath}\`，${existsText}`;
  }
  return `${existsText}`;
}

function isHandoverSourceFile(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (!normalized) return false;
  const ignoredParts = ['vendor/', 'node_modules/', 'storage/logs/', '.git/', 'dist/', 'build/'];
  if (ignoredParts.some(part => normalized.includes(part))) return false;
  return !normalized.endsWith('.lock');
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function formatConfidencePercent(confidence: number): number {
  const value = confidence > 1 ? confidence : confidence * 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatPercentage(percentage: number): string {
  return Number.isFinite(percentage) ? percentage.toFixed(1) : '0.0';
}

function formatDateRange(firstDate?: string, lastDate?: string): string {
  if (firstDate && lastDate) return `${firstDate} 至 ${lastDate}`;
  return firstDate || lastDate || '-';
}

function formatContributionStats(stats: GitContributionStat[] | undefined, fallback: string): string {
  if (!stats || stats.length === 0) return fallback;
  return stats
    .slice(0, 8)
    .map(stat => `${stat.name} (${stat.fileCount} 个文件，${stat.changeCount} 次，+${stat.additions}/-${stat.deletions})`)
    .join('、');
}

function formatRiskLevel(level?: GitChangedFile['riskLevel']): string {
  if (level === 'high') return '高风险';
  if (level === 'medium') return '中风险';
  return '低风险';
}

function formatRiskReasons(file: GitChangedFile): string {
  if (file.riskReasons && file.riskReasons.length > 0) {
    return file.riskReasons.join('；');
  }
  return describeFileResponsibility(file.filePath);
}

function formatFileCommitWindow(file: GitChangedFile): string {
  const range = formatDateRange(file.firstCommitDate, file.lastCommitDate);
  const lastCommit = file.lastCommitHash ? `，最近提交 \`${file.lastCommitHash}\`` : '';
  return `提交窗口 ${range}${lastCommit}`;
}

function getLanguageSummaries(result: ProjectAnalysisResult): Array<{ language: string; fileCount: number; percentage: number; extensions: string[] }> {
  if (result.languages.length > 0) return result.languages;

  const counts = new Map<string, number>();
  for (const file of result.files) {
    if (!file.language || file.language === 'Unknown') continue;
    counts.set(file.language, (counts.get(file.language) || 0) + 1);
  }

  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  return Array.from(counts.entries())
    .map(([language, fileCount]) => ({
      language,
      fileCount,
      percentage: total > 0 ? (fileCount / total) * 100 : 0,
      extensions: [],
    }))
    .sort((a, b) => b.fileCount - a.fileCount);
}

function formatPersonalLanguages(files: FileSummary[], changedFiles: GitChangedFile[]): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (file.language && file.language !== 'Unknown') {
      counts.set(file.language, (counts.get(file.language) || 0) + 1);
    }
  }
  for (const file of changedFiles) {
    if (file.language && file.language !== 'Unknown') {
      counts.set(file.language, Math.max(counts.get(file.language) || 0, 1));
    }
  }
  if (counts.size === 0) return '-';
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => `${language} (${count} 个文件)`)
    .join('、');
}

function groupChangedFilesByBusinessArea(files: GitChangedFile[]): Array<{
  name: string;
  files: GitChangedFile[];
  changeCount: number;
}> {
  const groups = new Map<string, GitChangedFile[]>();
  for (const file of files) {
    const area = inferBusinessArea(file.filePath);
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area)!.push(file);
  }

  return Array.from(groups.entries())
    .map(([name, groupedFiles]) => ({
      name,
      files: groupedFiles.sort((a, b) => b.changeCount - a.changeCount),
      changeCount: groupedFiles.reduce((sum, file) => sum + file.changeCount, 0),
    }))
    .sort((a, b) => b.changeCount - a.changeCount);
}

async function inspectSourceFile(
  localPath: string,
  filePath: string,
  changeCount: number,
  routeAuthor?: string
): Promise<SourceLogicSummary | null> {
  const fullPath = path.join(localPath, filePath);
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) return null;
    if (stat.size > 300 * 1024) {
      return {
        filePath,
        changeCount,
        category: classifyFile(filePath),
        businessArea: inferBusinessArea(filePath),
        fillable: [],
        relations: [],
        methods: [],
        routes: [],
        notes: ['文件较大，建议人工重点阅读入口参数、批处理流程和异常处理。'],
      };
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const routeContent = routeAuthor && extractRoutes(content).length > 0
      ? (await getLinesLastChangedByAuthor(localPath, filePath, routeAuthor)).join('\n')
      : content;
    return filePath.endsWith('.php')
      ? inspectPhpSource(filePath, changeCount, content, routeContent)
      : inspectGenericSource(filePath, changeCount, content, routeContent);
  } catch (_error) {
    return null;
  }
}

function inspectPhpSource(filePath: string, changeCount: number, content: string, routeContent: string = content): SourceLogicSummary {
  const namespace = content.match(/namespace\s+([^;]+);/)?.[1]?.trim();
  const classMatch = content.match(/\b(?:class|trait|interface)\s+(\w+)(?:\s+extends\s+([\w\\]+))?(?:\s+implements\s+([^{]+))?/);
  const commandSignature = content.match(/protected\s+\$signature\s*=\s*['"`]([^'"`]+)['"`]/)?.[1];
  const table = content.match(/protected\s+\$table\s*=\s*['"`]([^'"`]+)['"`]/)?.[1];

  return {
    filePath,
    changeCount,
    category: classifyFile(filePath),
    businessArea: inferBusinessArea(filePath),
    namespace,
    className: classMatch?.[1],
    extendsName: classMatch?.[2],
    commandSignature,
    table,
    fillable: extractPhpStringArray(content, 'fillable').slice(0, 12),
    relations: extractModelRelations(content),
    methods: extractPhpMethods(content, filePath).slice(0, 16),
    routes: extractRoutes(routeContent).slice(0, 20),
    notes: inferFileNotes(filePath, content),
  };
}

function inspectGenericSource(filePath: string, changeCount: number, content: string, routeContent: string = content): SourceLogicSummary {
  const classMatch = content.match(/\b(?:class|struct|interface|type)\s+([A-Za-z_][\w]*)/);

  return {
    filePath,
    changeCount,
    category: classifyFile(filePath),
    businessArea: inferBusinessArea(filePath),
    className: classMatch?.[1],
    fillable: [],
    relations: [],
    methods: extractSourceMethods(content, filePath).slice(0, 20),
    routes: extractRoutes(routeContent).slice(0, 20),
    notes: inferFileNotes(filePath, content),
  };
}

function extractPhpMethods(content: string, filePath: string): SourceMethodSummary[] {
  const methods: SourceMethodSummary[] = [];
  const methodRegex = /(?:(\/\*\*[\s\S]*?\*\/)\s*)?(public|protected|private)\s+(?:static\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = methodRegex.exec(content)) !== null) {
    const [, docBlock, visibility, name, params] = match;
    if (name.startsWith('__') && name !== '__construct') continue;
    methods.push({
      visibility,
      name,
      params: simplifyParams(params),
      doc: cleanDocBlock(docBlock),
      intent: inferMethodIntent(name, filePath),
      logicNotes: buildMethodLogicNotes(content, match.index, name, filePath, params),
    });
  }

  return methods;
}

function extractSourceMethods(content: string, filePath: string): SourceMethodSummary[] {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.php') {
    return extractPhpMethods(content, filePath);
  }
  if (extension === '.go') {
    return extractGoMethods(content, filePath);
  }
  if (extension === '.java' || extension === '.kt') {
    return extractJavaLikeMethods(content, filePath);
  }
  if (['.ts', '.tsx', '.js', '.jsx', '.vue'].includes(extension)) {
    return extractJavaScriptLikeMethods(content, filePath);
  }
  return [];
}

function extractGoMethods(content: string, filePath: string): SourceMethodSummary[] {
  const methods: SourceMethodSummary[] = [];
  const methodRegex = /(?:(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)?func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = methodRegex.exec(content)) !== null) {
    const [, docBlock, name, params] = match;
    if (!shouldIncludeMethod(name, filePath)) continue;
    methods.push({
      visibility: isExportedIdentifier(name) ? 'exported' : 'package',
      name,
      params: simplifyParams(params),
      doc: cleanDocBlock(docBlock),
      intent: inferMethodIntent(name, filePath),
      logicNotes: buildMethodLogicNotes(content, match.index, name, filePath, params),
    });
  }

  return dedupeMethods(methods);
}

function extractJavaLikeMethods(content: string, filePath: string): SourceMethodSummary[] {
  const methods: SourceMethodSummary[] = [];
  const methodRegex = /(?:(\/\*\*[\s\S]*?\*\/)\s*)?(?:(public|protected|private)\s+)?(?:static\s+)?(?:final\s+)?(?:[\w<>\[\],.?]+\s+)+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/g;
  let match: RegExpExecArray | null;

  while ((match = methodRegex.exec(content)) !== null) {
    const [, docBlock, visibility = 'package', name, params] = match;
    if (!shouldIncludeMethod(name, filePath)) continue;
    methods.push({
      visibility,
      name,
      params: simplifyParams(params),
      doc: cleanDocBlock(docBlock),
      intent: inferMethodIntent(name, filePath),
      logicNotes: buildMethodLogicNotes(content, match.index, name, filePath, params),
    });
  }

  return dedupeMethods(methods);
}

function extractJavaScriptLikeMethods(content: string, filePath: string): SourceMethodSummary[] {
  const methods: SourceMethodSummary[] = [];
  const patterns = [
    /(?:(\/\*\*[\s\S]*?\*\/)\s*)?(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g,
    /(?:(\/\*\*[\s\S]*?\*\/)\s*)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
    /(?:(\/\*\*[\s\S]*?\*\/)\s*)?(?:public|private|protected)?\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g,
  ];

  for (const methodRegex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(content)) !== null) {
      const [, docBlock, name, params] = match;
      if (!shouldIncludeMethod(name, filePath)) continue;
      methods.push({
        visibility: content.slice(Math.max(0, match.index - 20), match.index + match[0].length).includes('export')
          ? 'exported'
          : 'local',
        name,
        params: simplifyParams(params),
        doc: cleanDocBlock(docBlock),
        intent: inferMethodIntent(name, filePath),
        logicNotes: buildMethodLogicNotes(content, match.index, name, filePath, params),
      });
    }
  }

  return dedupeMethods(methods);
}

function dedupeMethods(methods: SourceMethodSummary[]): SourceMethodSummary[] {
  const seen = new Set<string>();
  return methods.filter(method => {
    const key = `${method.name}:${method.params}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldIncludeMethod(name: string, filePath: string): boolean {
  if (!name || name.startsWith('__')) return false;
  const ignored = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return']);
  if (ignored.has(name)) return false;
  if (path.extname(filePath).toLowerCase() === '.go' && name === 'init') return false;
  return true;
}

function isExportedIdentifier(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function extractRoutes(content: string): string[] {
  const routes: string[] = [];
  const routePatterns = [
    /Route::(get|post|put|patch|delete|options|any)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /\.(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|Any)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /path:\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const routeRegex of routePatterns) {
    let match: RegExpExecArray | null;
    while ((match = routeRegex.exec(content)) !== null) {
      if (match[1].startsWith('/')) {
        routes.push(`GET ${match[1]}`);
      } else {
        routes.push(`${normalizeHttpMethod(match[1])} ${match[2]}`);
      }
    }
  }
  return Array.from(new Set(routes));
}

function normalizeHttpMethod(method: string): string {
  const map: Record<string, string> = {
    GetMapping: 'GET',
    PostMapping: 'POST',
    PutMapping: 'PUT',
    DeleteMapping: 'DELETE',
    PatchMapping: 'PATCH',
    RequestMapping: 'ANY',
    Any: 'ANY',
  };
  return (map[method] || method).toUpperCase();
}

function extractModelRelations(content: string): string[] {
  const relations: string[] = [];
  const relationRegex = /public\s+function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]{0,700}?\$this->(hasOne|hasMany|belongsTo|belongsToMany|morphMany|morphOne)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = relationRegex.exec(content)) !== null) {
    relations.push(`${match[1]}(): ${match[2]}`);
  }
  return Array.from(new Set(relations)).slice(0, 12);
}

function extractPhpStringArray(content: string, property: string): string[] {
  const regex = new RegExp(`protected\\s+\\$${property}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm');
  const arrayBody = content.match(regex)?.[1];
  if (!arrayBody) return [];

  const values: string[] = [];
  const itemRegex = /['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(arrayBody)) !== null) {
    values.push(match[1]);
  }
  return values;
}

function cleanDocBlock(docBlock?: string): string | undefined {
  if (!docBlock) return undefined;
  const lines = docBlock
    .split('\n')
    .map(line => line
      .replace(/^\s*\/{2,}\s?/, '')
      .replace(/^\s*\/?\*+\s?/, '')
      .replace(/\*\/\s*$/, '')
      .trim())
    .filter(line => line && !line.startsWith('@'));
  return lines[0];
}

function simplifyParams(params: string): string {
  const text = params.replace(/\s+/g, ' ').trim();
  return text.length > 100 ? `${text.slice(0, 100)}...` : text;
}

function buildMethodLogicNotes(
  content: string,
  methodStartIndex: number,
  methodName: string,
  filePath: string,
  params: string,
): string[] {
  const body = extractMethodBody(content, methodStartIndex);
  if (!body) {
    return ['执行入口：未能定位完整方法体，当前只能确认方法签名；交接时需要人工补齐入参、关键分支、数据读写和副作用。'];
  }

  const notes: string[] = [];
  const intent = inferMethodIntent(methodName, filePath);
  const parameterNames = extractParameterNames(params);

  notes.push(`执行入口：该方法承担“${intent}”，${describeParameterFlow(parameterNames)}；交接时先说明调用入口、调用方期望的成功结果和失败返回。`);

  const branchNote = describeBranching(body);
  if (branchNote) notes.push(branchNote);

  const validationNote = describeValidation(body);
  if (validationNote) notes.push(validationNote);

  const transactionNote = describeTransaction(body);
  if (transactionNote) notes.push(transactionNote);

  const dataAccessNote = describeDataAccess(body);
  if (dataAccessNote) notes.push(dataAccessNote);

  const dependencyNote = describeExternalDependencies(body);
  if (dependencyNote) notes.push(dependencyNote);

  const asyncNote = describeAsyncWork(body);
  if (asyncNote) notes.push(asyncNote);

  const exceptionNote = describeExceptionHandling(body);
  if (exceptionNote) notes.push(exceptionNote);

  const fileNote = describeFileHandling(body);
  if (fileNote) notes.push(fileNote);

  if (notes.length === 1) {
    notes.push('交接核对：当前未识别到明显分支或外部副作用，仍需结合调用方确认输入来源、返回值含义和是否依赖类成员或全局状态。');
  } else {
    notes.push('交接核对：至少补一组正常输入、一组失败输入和相关数据状态，说明如何在测试环境复现主要路径与回滚/补偿路径。');
  }

  return notes.slice(0, 8);
}

function extractParameterNames(params: string): string[] {
  if (!params.trim()) return [];

  const ignored = new Set([
    'array',
    'bool',
    'boolean',
    'callable',
    'context',
    'float',
    'int',
    'integer',
    'mixed',
    'object',
    'request',
    'response',
    'string',
  ]);

  return params
    .split(',')
    .map(param => {
      let text = param
        .split('=')[0]
        .replace(/[{}[\]]/g, ' ')
        .replace(/^\s*\.\.\./, '')
        .trim();
      if (text.includes(':')) {
        text = text.split(':')[0].trim();
      }
      const tokens = text.split(/\s+/).filter(Boolean);
      const rawName = tokens[tokens.length - 1] || '';
      return rawName
        .replace(/^[&*$@]+/, '')
        .replace(/[?:].*$/, '')
        .replace(/[^\w$]/g, '');
    })
    .filter(name => name.length > 0 && !ignored.has(name.toLowerCase()))
    .slice(0, 6);
}

function describeParameterFlow(parameterNames: string[]): string {
  if (parameterNames.length === 0) {
    return '未识别到显式入参，需要重点确认请求上下文、类成员或全局配置如何进入方法';
  }
  return `入参包括 ${parameterNames.map(name => `\`${name}\``).join('、')}，需要说明字段来源、默认值和调用方保证`;
}

function describeBranching(body: string): string | undefined {
  const branchCount = countMatches(body, /\b(if|switch|match)\b/g);
  if (branchCount === 0) return undefined;

  const conditions = collectMatches(body, /\bif\s*\(([^)]{1,160})\)/g, 3);
  const earlyExitCount = countMatches(body, /\b(return|throw|continue|break)\b/g);
  const examples = formatLogicExamples(conditions);
  return `关键分支：检测到 ${branchCount} 处条件或匹配判断${examples}，并有 ${earlyExitCount} 个返回/抛错/跳转点；需要逐条说明成功、失败、跳过和兜底路径。`;
}

function describeValidation(body: string): string | undefined {
  const validationExamples = [
    ...collectMatches(body, /(validate\s*\([^;\n]{0,140})/gi, 2),
    ...collectMatches(body, /(rules\s*\([^;\n]{0,140})/gi, 2),
    ...collectMatches(body, /(ShouldBind\w*\s*\([^;\n]{0,140})/gi, 2),
    ...collectMatches(body, /(BindJSON\s*\([^;\n]{0,140})/gi, 2),
    ...collectMatches(body, /(empty\s*\([^)]{1,120}\))/gi, 2),
    ...collectMatches(body, /(isset\s*\([^)]{1,120}\))/gi, 2),
  ];

  if (validationExamples.length === 0 && !/@valid|@validated|required/i.test(body)) {
    return undefined;
  }

  return `参数校验：处理前会读取或校验请求数据${formatLogicExamples(validationExamples)}；需要写清必填字段、合法范围、错误提示，以及校验失败后是否阻断后续写库或外部调用。`;
}

function describeTransaction(body: string): string | undefined {
  if (!/transaction|begintransaction|db::transaction|commit\s*\(|rollback\s*\(/i.test(body)) {
    return undefined;
  }

  const transactionOps = collectMatches(body, /(DB::transaction|beginTransaction|transaction|commit\s*\(\)|rollback\s*\(\)|Commit\s*\(\)|Rollback\s*\(\))/gi, 4);
  return `事务边界：检测到事务控制${formatLogicExamples(transactionOps)}；交接时说明哪些步骤必须一起成功、哪些异常会回滚，并特别核对 rollback 后是否立即 return/throw，避免回滚后继续走成功出口。`;
}

function describeDataAccess(body: string): string | undefined {
  const readOps = [
    ...collectMatches(body, /((?:->|::|\.)?(?:select|find|first|get|pluck|where|query)\s*\([^;\n]{0,120})/gi, 4),
    ...collectMatches(body, /\b(repository|mapper|dao)\b[^;\n]{0,120}/gi, 3),
  ];
  const writeOps = collectMatches(
    body,
    /((?:->|::|\.)(?:insert|update|delete|save|create|upsert|firstOrCreate|forceDelete)\s*\([^;\n]{0,120})/gi,
    4,
  );

  if (readOps.length === 0 && writeOps.length === 0 && !/\bgorm\b|\bdb\./i.test(body)) {
    return undefined;
  }

  const parts: string[] = [];
  if (readOps.length > 0) parts.push(`读取路径${formatLogicExamples(readOps)}`);
  if (writeOps.length > 0) parts.push(`写入路径${formatLogicExamples(writeOps)}`);
  if (parts.length === 0) parts.push('检测到 ORM/DB 调用');
  return `数据读写：${parts.join('；')}；需要交接目标表/模型、查询条件、字段映射、幂等要求和并发一致性影响。`;
}

function describeExternalDependencies(body: string): string | undefined {
  const dependencyParts: string[] = [];
  const cacheOps = collectMatches(body, /((?:Redis|Cache|cache|redis)(?:::|->|\.|\s)[^;\n]{0,120})/gi, 3);
  const httpOps = collectMatches(body, /((?:Http|axios|fetch|curl|Guzzle|RestTemplate|WebClient|grpc|client)(?:::|->|\.|\s|\()[^;\n]{0,120})/gi, 3);
  const authOps = collectMatches(body, /((?:auth|permission|policy|gate|middleware|token|jwt|role)(?:::|->|\.|\s|\()[^;\n]{0,120})/gi, 2);

  if (cacheOps.length > 0) {
    dependencyParts.push(`缓存${formatLogicExamples(cacheOps)}`);
  }
  if (httpOps.length > 0) {
    dependencyParts.push(`外部调用${formatLogicExamples(httpOps)}`);
  }
  if (authOps.length > 0) {
    dependencyParts.push(`权限/身份判断${formatLogicExamples(authOps)}`);
  }

  if (dependencyParts.length === 0) return undefined;

  const handoverItems: string[] = [];
  if (cacheOps.length > 0) handoverItems.push('缓存 Key、过期时间和刷新时机');
  if (httpOps.length > 0) handoverItems.push('接口地址、鉴权方式、超时配置和失败降级');
  if (authOps.length > 0) handoverItems.push('角色/权限点和越权保护');
  handoverItems.push('失败后的重试/补偿策略');
  const handoverText = handoverItems.length > 1
    ? `${handoverItems.slice(0, -1).join('、')}，以及${handoverItems[handoverItems.length - 1]}`
    : handoverItems[0];
  return `外部依赖：${dependencyParts.join('；')}；需要交接${handoverText}。`;
}

function describeAsyncWork(body: string): string | undefined {
  if (!/queue|dispatch\s*\(|job|chan\s|go\s+func|goroutine|waitgroup|async\s+|await\s+/i.test(body)) {
    return undefined;
  }

  const asyncOps = [
    ...collectMatches(body, /(dispatch\s*\([^;\n]{0,120})/gi, 2),
    ...collectMatches(body, /(go\s+func\s*\([^;\n]{0,120})/gi, 2),
    ...collectMatches(body, /(await\s+[^;\n]{0,120})/gi, 2),
    ...collectMatches(body, /\b(queue|job|waitgroup|chan)\b[^;\n]{0,120}/gi, 2),
  ];
  return `异步/并发：检测到异步任务或并发控制${formatLogicExamples(asyncOps)}；需要说明触发入口、并发上限、消息/任务载荷、失败补偿和重复执行时的幂等处理。`;
}

function describeExceptionHandling(body: string): string | undefined {
  if (!/try\s*\{|catch\s*\(|finally\s*\{|defer\s+|panic\s*\(|recover\s*\(|throw\s+/i.test(body)) {
    return undefined;
  }

  const exceptionOps = collectMatches(body, /(try\s*\{|catch\s*\([^)]{0,120}\)|finally\s*\{|defer\s+[^;\n]{0,120}|throw\s+[^;\n]{0,120}|panic\s*\([^)]{0,120}\)|recover\s*\(\))/gi, 4);
  return `异常与清理：检测到异常捕获、抛错或资源释放${formatLogicExamples(exceptionOps)}；需要交接失败场景、日志字段、清理动作、是否重试，以及异常是否会继续向上抛。`;
}

function describeFileHandling(body: string): string | undefined {
  if (!/excel|csv|upload|download|multipart|file/i.test(body)) {
    return undefined;
  }

  const fileOps = collectMatches(body, /((?:excel|csv|upload|download|multipart|file)[^;\n]{0,120})/gi, 4);
  return `文件处理：检测到导入、导出、上传或下载相关逻辑${formatLogicExamples(fileOps)}；需要交接模板字段、文件大小限制、临时文件清理、异常行处理和用户可见提示。`;
}

function countMatches(text: string, regex: RegExp): number {
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  return Array.from(text.matchAll(globalRegex)).length;
}

function collectMatches(text: string, regex: RegExp, limit = 3): string[] {
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  const matches = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = globalRegex.exec(text)) !== null && matches.size < limit) {
    const value = sanitizeLogicSnippet(match[1] || match[0]);
    if (value) matches.add(value);
  }

  return Array.from(matches);
}

function sanitizeLogicSnippet(value: string): string {
  const text = value
    .replace(/\s+/g, ' ')
    .replace(/`/g, '\'')
    .trim();
  if (!text) return '';
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function formatLogicExamples(examples: string[]): string {
  if (examples.length === 0) return '';
  return `（例如 ${examples.map(example => `\`${example}\``).join('、')}）`;
}

function inferMethodLogicNotes(content: string, methodStartIndex: number): string[] {
  const body = extractMethodBody(content, methodStartIndex);
  if (!body) {
    return ['未能定位完整方法体，建议人工补充入参、分支和副作用。'];
  }

  const notes: string[] = [];
  const lowered = body.toLowerCase();

  if (/\b(if|switch|match)\b/.test(body)) {
    notes.push('包含条件分支，交接时需说明关键判断条件和不同返回路径。');
  }
  if (/\b(for|foreach|while|range)\b/.test(body)) {
    notes.push('包含循环处理，需确认批量数据规模、分页或超时风险。');
  }
  if (/try\s*\{|catch\s*\(|finally\s*\{|defer\s+|panic\(|recover\(|throw\s+/.test(body)) {
    notes.push('包含异常或资源释放逻辑，需交接失败场景、重试和清理策略。');
  }
  if (/transaction|begintransaction|db::transaction|commit\(|rollback\(/i.test(body)) {
    notes.push('涉及事务边界，需说明哪些步骤必须同时成功以及回滚条件。');
  }
  if (/insert|update|delete|save\(|create\(|firstorcreate|gorm|db\.|repository|mapper|select\s+/i.test(body)) {
    notes.push('涉及数据读写，需交接核心表、查询条件和数据一致性要求。');
  }
  if (/redis|cache|memcache/i.test(body)) {
    notes.push('涉及缓存，需补充缓存 Key、过期时间和刷新时机。');
  }
  if (/http|curl|axios|fetch\(|guzzle|resttemplate|webclient|grpc|client\./i.test(body)) {
    notes.push('涉及外部调用，需交接接口地址、鉴权、超时和降级策略。');
  }
  if (/queue|dispatch\(|job|chan\s|go\s+func|goroutine|waitgroup|async\s+|await\s+/i.test(body)) {
    notes.push('涉及异步或并发处理，需说明触发入口、并发边界和失败补偿。');
  }
  if (/validate|validator|rules\(|request\(|bindjson|shouldbind|@valid|@validated/i.test(body)) {
    notes.push('包含参数校验，需交接必填字段、格式约束和错误返回。');
  }
  if (/auth|permission|policy|gate|middleware|token|jwt|role/i.test(body)) {
    notes.push('涉及权限或身份校验，需说明角色、权限点和越权风险。');
  }
  if (/excel|csv|upload|download|multipart|file/i.test(lowered)) {
    notes.push('涉及文件导入导出或上传下载，需交接模板字段、文件大小和异常数据处理。');
  }

  return notes.slice(0, 5);
}

function extractMethodBody(content: string, methodStartIndex: number): string {
  const openBraceIndex = content.indexOf('{', methodStartIndex);
  if (openBraceIndex < 0) return '';

  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let i = openBraceIndex; i < content.length; i++) {
    const char = content[i];
    const prev = content[i - 1];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '/' && content[i + 1] === '/') {
      const nextLine = content.indexOf('\n', i + 2);
      if (nextLine < 0) break;
      i = nextLine;
      continue;
    }

    if (char === '/' && content[i + 1] === '*') {
      const commentEnd = content.indexOf('*/', i + 2);
      if (commentEnd < 0) break;
      i = commentEnd + 1;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, i);
      }
    } else if (prev === undefined) {
      continue;
    }
  }

  return content.slice(openBraceIndex + 1);
}

function inferBusinessArea(filePath: string): string {
  const parts = normalizePath(filePath).split('/').filter(Boolean);
  const controllerIndex = parts.findIndex(part => part === 'Controllers');
  const modelIndex = parts.findIndex(part => part === 'Models');
  const serviceIndex = parts.findIndex(part => part === 'Services' || part === 'Service');
  const commandIndex = parts.findIndex(part => part === 'Commands');

  const index = [controllerIndex, modelIndex, serviceIndex, commandIndex].find(item => item >= 0);
  if (index !== undefined && index >= 0 && parts[index + 1]) {
    const next = parts[index + 1];
    return next.endsWith('.php') ? parts[index] : `${parts[index]}/${next}`;
  }

  if (parts[0] === 'routes') return 'Routes';
  if (parts[0] === 'config') return 'Config';
  if (parts[0] === 'database') return 'Database';
  return parts.slice(0, 2).join('/') || 'Other';
}

function classifyFile(filePath: string): string {
  const normalized = normalizePath(filePath);
  if (normalized.includes('/Controllers/')) return '控制器';
  if (normalized.includes('/controller/') || normalized.includes('/controllers/')) return '控制器';
  if (normalized.includes('/handler/') || normalized.includes('/handlers/')) return '控制器';
  if (normalized.includes('/Services/') || normalized.includes('/Service/')) return '服务层';
  if (normalized.includes('/service/') || normalized.includes('/services/')) return '服务层';
  if (normalized.includes('/Models/')) return '模型';
  if (normalized.includes('/model/') || normalized.includes('/models/') || normalized.includes('/entity/') || normalized.includes('/entities/')) return '模型';
  if (normalized.includes('/Commands/')) return 'Artisan 命令';
  if (normalized.includes('/command/') || normalized.includes('/commands/') || normalized.includes('/cron/')) return '命令/定时任务';
  if (normalized.includes('/Jobs/')) return '队列任务';
  if (normalized.includes('/job/') || normalized.includes('/jobs/') || normalized.includes('/worker/') || normalized.includes('/consumer/')) return '队列任务';
  if (normalized.includes('/Middleware/')) return '中间件';
  if (normalized.includes('/middleware/')) return '中间件';
  if (normalized.includes('/repository/') || normalized.includes('/repositories/') || normalized.includes('/mapper/')) return '数据访问层';
  if (normalized.includes('/component/') || normalized.includes('/components/')) return '前端组件';
  if (normalized.includes('/view/') || normalized.includes('/views/') || normalized.includes('/page/') || normalized.includes('/pages/')) return '前端页面';
  if (normalized.includes('/api/')) return '前端接口封装';
  if (normalized.includes('/store/') || normalized.includes('/stores/')) return '前端状态管理';
  if (normalized.includes('/utils/') || normalized.includes('/util/') || normalized.includes('/composables/')) return '工具/组合函数';
  if (normalized.startsWith('routes/')) return '路由';
  if (normalized.startsWith('router/')) return '路由';
  if (normalized.startsWith('config/')) return '配置';
  if (normalized.includes('/config/')) return '配置';
  if (normalized.startsWith('database/migrations/')) return '数据库迁移';
  if (normalized.endsWith('.sql')) return '数据库脚本';
  return '其他代码';
}

function describeFileResponsibility(filePath: string): string {
  const category = classifyFile(filePath);
  const area = inferBusinessArea(filePath);
  if (category === '控制器') return `负责 ${area} 相关 HTTP 接口入口、参数接收与业务编排`;
  if (category === '服务层') return `负责 ${area} 相关可复用业务逻辑封装`;
  if (category === '模型') return `负责 ${area} 相关数据表映射、查询关系或领域数据访问`;
  if (category === 'Artisan 命令') return `负责 ${area} 相关后台命令、定时任务或批处理入口`;
  if (category === '命令/定时任务') return `负责 ${area} 相关后台命令、定时任务或批处理入口`;
  if (category === '队列任务') return `负责 ${area} 相关异步任务、消息消费或后台处理`;
  if (category === '中间件') return `负责 ${area} 相关请求拦截、鉴权、日志或上下文处理`;
  if (category === '数据访问层') return `负责 ${area} 相关数据库查询、持久化和数据映射`;
  if (category === '前端组件') return `负责 ${area} 相关可复用 UI 组件和交互封装`;
  if (category === '前端页面') return `负责 ${area} 相关页面展示、用户操作入口和接口编排`;
  if (category === '前端接口封装') return `负责 ${area} 相关前端请求封装、参数组装和响应处理`;
  if (category === '前端状态管理') return `负责 ${area} 相关跨组件状态、缓存数据和动作流转`;
  if (category === '工具/组合函数') return `负责 ${area} 相关通用工具、复用逻辑或组合式函数`;
  if (category === '数据库脚本') return `负责 ${area} 相关表结构、初始化数据或数据修复脚本`;
  if (category === '路由') return '负责接口路由入口定义';
  if (category === '配置') return '负责运行时配置或第三方依赖配置';
  return `属于 ${area} 相关代码，需要结合调用链继续交接`;
}

function inferMethodIntent(methodName: string, filePath: string): string {
  const lower = methodName.toLowerCase();
  if (lower.includes('list') || lower.includes('index') || lower.includes('search')) return '查询列表/检索数据';
  if (lower.includes('detail') || lower === 'show' || lower.includes('get')) return '查询详情或读取数据';
  if (lower.includes('add') || lower.includes('create') || lower.includes('store')) return '新增数据或创建业务单据';
  if (lower.includes('edit') || lower.includes('update') || lower.includes('save') || lower.includes('modify')) return '更新数据或保存业务状态';
  if (lower.includes('delete') || lower.includes('destroy') || lower.includes('remove')) return '删除或作废数据';
  if (lower.includes('approve') || lower.includes('examine') || lower.includes('audit')) return '审批/审核流程处理';
  if (lower.includes('login') || lower.includes('logout') || lower.includes('auth')) return '登录认证或权限相关处理';
  if (lower.includes('validate') || lower.includes('check')) return '校验输入、状态或业务约束';
  if (lower.includes('import') || lower.includes('upload')) return '导入文件或上传数据处理';
  if (lower.includes('export') || lower.includes('download')) return '导出文件或下载数据处理';
  if (lower.includes('sync') || lower.includes('pull') || lower.includes('fetch')) return '同步/拉取外部数据';
  if (lower === 'handle' && filePath.includes('/Commands/')) return '命令执行主流程';
  if (lower === 'handle' || lower.includes('handler')) return '请求或事件处理主流程';
  if (lower.includes('render') || lower.includes('mounted') || lower.includes('setup')) return '前端渲染或组件初始化逻辑';
  if (lower.includes('route') || lower.includes('router')) return '路由注册或页面跳转逻辑';
  if (lower.includes('format') || lower.includes('normalize') || lower.includes('parse') || lower.includes('transform')) return '数据格式化或结构转换';
  if (lower.includes('send') || lower.includes('request') || lower.includes('call')) return '外部请求、消息发送或接口调用';
  return '业务处理方法，需要结合调用方确认详细流程';
}

function inferFileNotes(filePath: string, content: string): string[] {
  const notes: string[] = [];
  if (content.includes('DB::transaction') || content.includes('beginTransaction')) {
    notes.push('包含事务处理，交接时需说明回滚条件和一致性要求。');
  }
  if (content.includes('Redis') || content.includes('Cache::') || content.includes('cache.') || content.includes('localStorage')) {
    notes.push('涉及缓存/Redis，需交接缓存 Key、过期策略和刷新时机。');
  }
  if (content.includes('Excel') || content.includes('PHPExcel') || content.includes('Maatwebsite')) {
    notes.push('涉及 Excel 导入/导出，需交接模板字段和异常数据处理方式。');
  }
  if (content.includes('Queue') || content.includes('dispatch(') || content.includes('go func') || content.includes('chan ')) {
    notes.push('会触发队列任务，需交接消费者、失败重试和补偿策略。');
  }
  if (content.includes('curl') || content.includes('Http::') || content.includes('Guzzle') || content.includes('fetch(') || content.includes('axios') || content.includes('RestTemplate')) {
    notes.push('涉及外部 HTTP 调用，需交接第三方接口、鉴权和超时处理。');
  }
  if (content.includes('select ') || content.includes('insert ') || content.includes('update ') || content.includes('delete ') || content.includes('gorm.') || content.includes('DB::')) {
    notes.push('包含数据访问逻辑，需交接核心表、查询条件和数据一致性要求。');
  }
  if (content.includes('TODO') || content.includes('FIXME')) {
    notes.push('存在 TODO/FIXME 标记，交接时需确认遗留事项是否仍有效。');
  }
  if (['控制器', '前端页面', '前端接口封装'].includes(classifyFile(filePath))) {
    notes.push('这是 HTTP 入口文件，建议交接请求参数、返回结构、权限和前端调用页面。');
  }
  return notes;
}

function formatSourceLogicSummary(summary: SourceLogicSummary): string {
  const lines: string[] = [];
  lines.push(`### ${summary.filePath}`);
  lines.push(`- 修改频次：${summary.changeCount} 次`);
  lines.push(`- 代码类型：${summary.category}`);
  lines.push(`- 业务域：${summary.businessArea}`);
  lines.push(`- 负责内容：${describeFileResponsibility(summary.filePath)}`);
  if (summary.namespace) lines.push(`- 命名空间：\`${summary.namespace}\``);
  if (summary.className) {
    lines.push(`- 类/结构：\`${summary.className}\`${summary.extendsName ? `，继承 \`${summary.extendsName}\`` : ''}`);
  }
  if (summary.commandSignature) lines.push(`- 命令签名：\`${summary.commandSignature}\``);
  if (summary.table) lines.push(`- 关联数据表：\`${summary.table}\``);
  if (summary.fillable.length > 0) lines.push(`- 可批量写入字段：${summary.fillable.map(item => `\`${item}\``).join('、')}`);
  if (summary.routes.length > 0) lines.push(`- 路由入口：${summary.routes.map(route => `\`${route}\``).join('、')}`);
  if (summary.relations.length > 0) lines.push(`- 模型关系：${summary.relations.map(item => `\`${item}\``).join('、')}`);

  if (summary.methods.length > 0) {
    lines.push('- 主要方法：');
    for (const method of summary.methods) {
      lines.push(`  - \`${method.visibility} ${method.name}(${method.params})\`：${method.intent}`);
      if (method.doc) lines.push(`    - 说明：${method.doc}`);
      if (method.logicNotes.length > 0) {
        lines.push('    - 逻辑备注：');
        for (const note of method.logicNotes) {
          lines.push(`      - ${note}`);
        }
      }
    }
  }

  if (summary.notes.length > 0) {
    lines.push(`- 交接注意：${summary.notes.join(' ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function listApiEndpoints(modules: ModuleSummary[], summaries: SourceLogicSummary[]): string {
  const endpoints = new Set<string>();
  for (const module of modules) {
    for (const route of module.routes || []) endpoints.add(`- \`${route}\` (${module.name})`);
  }
  for (const summary of summaries) {
    for (const route of summary.routes) endpoints.add(`- \`${route}\` (${summary.filePath})`);
  }
  return endpoints.size > 0 ? Array.from(endpoints).join('\n') + '\n' : '未在该人员负责文件中检测到接口入口。\n';
}

function listCommands(modules: ModuleSummary[], summaries: SourceLogicSummary[]): string {
  const commands = new Set<string>();
  for (const module of modules) {
    for (const command of module.commands || []) commands.add(`- \`${command}\` (${module.name})`);
  }
  for (const summary of summaries) {
    if (summary.commandSignature) commands.add(`- \`${summary.commandSignature}\` (${summary.filePath})`);
  }
  return commands.size > 0 ? Array.from(commands).join('\n') + '\n' : '未在该人员负责文件中检测到命令或定时任务。\n';
}

function listTables(modules: ModuleSummary[], summaries: SourceLogicSummary[]): string {
  const tables = new Set<string>();
  for (const module of modules) {
    for (const table of module.tables || []) tables.add(`- \`${table}\` (${module.name})`);
  }
  for (const summary of summaries) {
    if (summary.table) tables.add(`- \`${summary.table}\` (${summary.filePath})`);
  }
  return tables.size > 0 ? Array.from(tables).join('\n') + '\n' : '未在该人员负责文件中检测到明确数据表。\n';
}

function listConfigFiles(modules: ModuleSummary[], changedFiles: GitChangedFile[]): string {
  const files = new Map<string, string>();
  for (const file of changedFiles) {
    if (normalizePath(file.filePath).startsWith('config/')) {
      files.set(normalizePath(file.filePath), `- \`${file.filePath}\` (${file.changeCount} 次修改)`);
    }
  }
  for (const module of modules.filter(item => item.type === 'config')) {
    for (const file of module.files || []) {
      const normalizedPath = normalizePath(file);
      if (!files.has(normalizedPath)) files.set(normalizedPath, `- \`${file}\` (${module.name})`);
    }
  }
  return files.size > 0 ? Array.from(files.values()).join('\n') + '\n' : '未在该人员负责文件中检测到配置文件。\n';
}

function buildPersonalHandoverFocus(authorName: string, summaries: SourceLogicSummary[], changedFiles: GitChangedFile[]): string {
  const lines: string[] = [];
  const topFiles = changedFiles.slice(0, 8).map(file => `\`${file.filePath}\``).join('、');
  if (topFiles) lines.push(`- 优先交接 ${authorName} 高频维护文件：${topFiles}`);
  const riskyFiles = changedFiles.filter(file => file.riskLevel && file.riskLevel !== 'low');
  if (riskyFiles.length > 0) {
    lines.push(`- 优先复核 ${riskyFiles.length} 个中高风险文件，重点看重命名/删除历史、配置改动、接口入口、数据库脚本和后台任务。`);
  }
  if (changedFiles.some(file => (file.additions || 0) + (file.deletions || 0) >= 500)) {
    lines.push('- 存在累计变更行数较高的文件，建议交接时补充版本背景、核心 diff 和线上验证方式。');
  }
  if (changedFiles.some(file => file.statusCounts?.renamed || file.previousPath)) {
    lines.push('- 存在重命名历史，接手人需要同时确认旧路径调用方、历史文档引用和部署脚本中是否仍残留旧路径。');
  }
  if (changedFiles.some(file => file.statusCounts?.deleted || file.status === 'deleted')) {
    lines.push('- 存在删除历史，需说明删除原因、替代实现和是否存在回滚恢复需求。');
  }
  if (summaries.some(item => item.category === '控制器')) {
    lines.push('- 控制器文件需要补充接口调用页面、请求参数、返回结构、权限规则和异常返回。');
  }
  if (summaries.some(item => item.notes.some(note => note.includes('事务')))) {
    lines.push('- 存在事务处理代码，需说明哪些步骤必须一起成功、异常回滚条件和人工补偿方式。');
  }
  if (summaries.some(item => item.notes.some(note => note.includes('Excel')))) {
    lines.push('- 存在 Excel 导入/导出逻辑，需提供模板样例、字段含义、常见失败数据和重跑方式。');
  }
  if (summaries.some(item => item.notes.some(note => note.includes('外部 HTTP')))) {
    lines.push('- 存在第三方接口调用，需交接接口文档、账号权限、测试环境、限流和超时处理。');
  }
  if (summaries.some(item => item.category === 'Artisan 命令')) {
    lines.push('- 存在后台命令或定时任务，需说明触发入口、执行频率、日志位置和失败后如何重跑。');
  }
  if (lines.length === 0) {
    lines.push('- 建议围绕高频修改文件逐个补充业务背景、调用入口、测试用例和线上排查方式。');
  }
  return lines.join('\n') + '\n';
}

function buildPersonalSuggestions(summaries: SourceLogicSummary[]): string {
  const suggestions = [
    '- 为每个高频负责文件补充“入口、参数、核心流程、异常处理、依赖数据表”的人工说明。',
    '- 将交接人负责的接口整理成可运行的 API 示例，便于接手人快速验证。',
    '- 为导入导出、审批、定时任务等流程补充至少一组正常用例和一组异常用例。',
  ];

  if (summaries.some(item => item.methods.length > 10)) {
    suggestions.push('- 部分文件方法较多，建议后续拆分服务层或提取领域对象，降低单文件维护成本。');
  }
  if (summaries.some(item => item.notes.some(note => note.includes('缓存')))) {
    suggestions.push('- 涉及缓存的逻辑建议补充缓存 Key 命名表和刷新策略。');
  }

  return suggestions.join('\n') + '\n';
}

function inferStartCommand(result: ProjectAnalysisResult): string {
  const profile = getProjectProfile(result);
  if (profile.startCommands.length > 0) {
    return profile.startCommands.map(item => `\`${item.command}\``).join('、');
  }

  const frameworkNames = result.frameworks.map(item => item.name.toLowerCase());
  if (frameworkNames.some(name => name.includes('laravel'))) return 'php artisan serve';
  if (frameworkNames.some(name => name.includes('vue') || name.includes('react'))) return 'npm run dev';
  if (frameworkNames.some(name => name.includes('gin'))) return 'go run .';
  if (frameworkNames.some(name => name.includes('spring'))) return 'mvn spring-boot:run';
  return '请查看项目 README.md';
}

function describeAstAnalysis(result: ProjectAnalysisResult, allowedPaths?: Set<string>): string {
  const ast = result.ast;
  if (!ast) return '暂无 Tree-sitter AST 分析结果。\n';

  const files = allowedPaths
    ? ast.files.filter(file => allowedPaths.has(normalizePath(file.path)))
    : ast.files;
  const lines = [
    `- 解析引擎：${ast.engine}`,
    `- 已支持语言：${ast.languages.join('、') || '-'}`,
    `- 已解析文件：${files.length}`,
    `- 符号 / 导入 / 调用：${files.reduce((sum, file) => sum + file.symbols.length, 0)} / ${files.reduce((sum, file) => sum + file.imports.length, 0)} / ${files.reduce((sum, file) => sum + file.calls.length, 0)}`,
  ];
  const relationships = ast.relationships || {
    callGraph: [],
    inheritance: [],
    interfaceImplementations: [],
    dependencyReferences: [],
  };
  const allowedPathFilter = (filePath: string) => !allowedPaths || allowedPaths.has(normalizePath(filePath));
  const callGraph = relationships.callGraph.filter(edge => allowedPathFilter(edge.fromFile));
  const dependencyReferences = relationships.dependencyReferences.filter(edge => allowedPathFilter(edge.fromFile));
  const inheritance = relationships.inheritance.filter(edge => allowedPathFilter(edge.file));
  const interfaceImplementations = relationships.interfaceImplementations.filter(edge => allowedPathFilter(edge.file));
  lines.push(`- 关系图：调用 ${callGraph.length}、依赖 ${dependencyReferences.length}、继承 ${inheritance.length}、接口实现 ${interfaceImplementations.length}`);

  if (ast.skippedFileCount > 0) {
    lines.push(`- 受扫描上限影响跳过文件：${ast.skippedFileCount}`);
  }
  if (ast.failures.length > 0) {
    lines.push(`- 解析失败文件：${ast.failures.length}，建议人工确认 grammar 资源和源码语法`);
  }

  for (const file of files.slice(0, 40)) {
    lines.push(`\n### ${file.path}`);
    lines.push(`- 语言：${file.language}${file.hasErrors ? '，语法树包含错误节点' : ''}`);
    if (file.symbols.length > 0) {
      lines.push(`- 符号：${file.symbols.slice(0, 20).map(symbol => {
        const parent = symbol.parent ? `${symbol.parent}::` : '';
        return `\`${symbol.kind} ${parent}${symbol.name}\` (L${symbol.line})`;
      }).join('、')}`);
    }
    if (file.imports.length > 0) {
      lines.push(`- 导入：${file.imports.slice(0, 20).map(item => `\`${item}\``).join('、')}`);
    }
    if (file.calls.length > 0) {
      lines.push(`- 调用：${file.calls.slice(0, 30).map(item => `\`${item}\``).join('、')}`);
    }
  }

  if (callGraph.length > 0 || dependencyReferences.length > 0 || inheritance.length > 0 || interfaceImplementations.length > 0) {
    lines.push('\n### 关系图摘要');
    if (callGraph.length > 0) {
      lines.push('- 跨文件调用图：');
      for (const edge of callGraph.slice(0, 30)) {
        const target = edge.toFile ? ` -> \`${edge.toFile}\`` : '';
        const resolved = edge.resolvedSymbol ? ` (${edge.resolvedSymbol})` : '';
        lines.push(`  - \`${edge.fromFile}\` 调用 \`${edge.call}\`${target}${resolved}`);
      }
    }
    if (dependencyReferences.length > 0) {
      lines.push('- 依赖引用图：');
      for (const edge of dependencyReferences.slice(0, 30)) {
        const target = edge.toFile ? ` -> \`${edge.toFile}\`` : '';
        lines.push(`  - \`${edge.fromFile}\` 引用 \`${edge.importPath}\`${target}`);
      }
    }
    if (inheritance.length > 0) {
      lines.push('- 继承关系：');
      for (const edge of inheritance.slice(0, 30)) {
        lines.push(`  - \`${edge.symbol}\` extends \`${edge.base}\` (${edge.file})`);
      }
    }
    if (interfaceImplementations.length > 0) {
      lines.push('- 接口实现关系：');
      for (const edge of interfaceImplementations.slice(0, 30)) {
        lines.push(`  - \`${edge.symbol}\` implements \`${edge.interfaceName}\` (${edge.file})`);
      }
    }
  }

  if (files.length === 0) {
    lines.push('- 当前范围内没有已接入 Tree-sitter 适配器的源码文件。');
  }

  return lines.join('\n') + '\n';
}

function describeProjectProfile(result: ProjectAnalysisResult, sectionNumber: number = 3): string {
  const profile = getProjectProfile(result);
  const lines: string[] = [];

  lines.push(`### ${sectionNumber}.1 README 和辅助文档`);
  lines.push(profile.readmeFiles.length > 0
    ? `- README：${profile.readmeFiles.map(file => `\`${file}\``).join('、')}`
    : '- README：未识别到 README 文件');
  lines.push(profile.documentationFiles.length > 0
    ? `- 辅助文档：${profile.documentationFiles.map(file => `\`${file}\``).join('、')}`
    : '- 辅助文档：未识别到额外文档');

  lines.push(`\n### ${sectionNumber}.2 依赖清单`);
  if (profile.dependencyManifests.length === 0) {
    lines.push('- 未识别到常见依赖清单');
  } else {
    for (const manifest of profile.dependencyManifests) {
      const devDependencyText = manifest.devDependencyCount === undefined
        ? ''
        : `，开发依赖 ${manifest.devDependencyCount} 项`;
      lines.push(`- \`${manifest.path}\`：${manifest.ecosystem}，运行依赖 ${manifest.dependencyCount} 项${devDependencyText}`);
    }
  }

  lines.push(`\n### ${sectionNumber}.3 启动和运维入口`);
  if (profile.startCommands.length === 0) {
    lines.push('- 未自动识别到启动命令，请结合 README 和部署配置人工确认');
  } else {
    for (const item of profile.startCommands) {
      lines.push(`- \`${item.command}\`，来源：\`${item.source}\``);
    }
  }

  lines.push(`\n### ${sectionNumber}.4 配置和敏感文件`);
  lines.push(profile.configFiles.length > 0
    ? `- 配置文件：${profile.configFiles.map(file => `\`${file}\``).join('、')}`
    : '- 配置文件：未识别到常见配置文件');
  lines.push(profile.sensitiveFiles.length > 0
    ? `- 敏感文件提示：${profile.sensitiveFiles.map(file => `\`${file}\``).join('、')}。仅记录路径，未读取文件内容。`
    : '- 敏感文件提示：未发现需要单独提示的敏感文件路径。');

  return lines.join('\n') + '\n';
}

function describeDirectoryStructure(
  files: FileSummary[],
  topLevelDirectories: Array<{ path: string; fileCount: number }> = []
): string {
  const dirs = new Set<string>();
  for (const file of files) {
    const pathSegments = normalizePath(file.path).split('/');
    if (pathSegments.length < 2) continue;
    const first = pathSegments[0];
    if (first && !first.startsWith('.')) dirs.add(first);
  }
  if (dirs.size === 0) return '暂无目录结构分析结果。\n';
  const directoryCounts = new Map(topLevelDirectories.map(item => [item.path, item.fileCount]));
  return Array.from(dirs)
    .sort()
    .map(dir => {
      const fileCount = directoryCounts.get(dir);
      const countText = fileCount === undefined ? '' : `，已扫描 ${fileCount} 个文件`;
      return `- **${dir}**：${getDirectoryDescription(dir)}${countText}`;
    })
    .join('\n') + '\n';
}

function getDirectoryDescription(dir: string): string {
  const descriptions: Record<string, string> = {
    app: '应用核心代码',
    bootstrap: '框架启动文件',
    config: '配置文件',
    database: '数据库迁移、种子或工厂',
    public: '公开入口和静态资源',
    resources: '模板和前端资源',
    routes: '路由定义',
    tests: '测试文件',
    src: '源码目录',
  };
  return descriptions[dir] || '项目目录';
}

function describeModules(modules: ModuleSummary[]): string {
  if (modules.length === 0) return '暂无模块分析结果。\n';
  return modules.map(module => {
    const lines = [`### ${module.name}`, `- 类型：${module.type}`];
    if (module.framework) lines.push(`- 框架：${module.framework}`);
    if (module.summary) lines.push(`- 描述：${module.summary}`);
    if (module.files.length > 0) lines.push(`- 文件：${module.files.map(file => `\`${file}\``).join('、')}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function identifyProjectHandoverFocus(result: ProjectAnalysisResult): string {
  const points: string[] = [];
  if (result.modules.length > 0) points.push(`- 重点模块：${result.modules.slice(0, 5).map(item => item.name).join('、')}`);
  if (result.frameworks.length > 0) points.push(`- 技术栈：${result.frameworks.map(item => item.name).join('、')}`);
  points.push('- 建议先阅读 README 和启动配置，再按模块逐个确认业务入口。');
  return points.join('\n') + '\n';
}

function identifyProjectRisks(result: ProjectAnalysisResult): string {
  const risks: string[] = [];
  const profile = getProjectProfile(result);
  if (!result.repoUrl) risks.push('- 当前项目为本地项目，请确认远程仓库地址和分支同步情况。');
  if (result.modules.length === 0) risks.push('- 未识别到清晰模块结构，接手时需要人工梳理调用链。');
  if (profile.sensitiveFiles.length > 0) {
    risks.push(`- 发现 ${profile.sensitiveFiles.length} 个敏感文件路径，文档没有读取内容；交接时请通过受控渠道传递实际配置。`);
  }
  risks.push('- 交接前请确认 .env、密钥、第三方账号和生产配置不会进入文档。');
  return risks.join('\n') + '\n';
}

function getProjectProfile(result: ProjectAnalysisResult): ProjectAnalysisResult['profile'] {
  return result.profile || {
    readmeFiles: [],
    documentationFiles: [],
    dependencyManifests: [],
    configFiles: [],
    sensitiveFiles: [],
    startCommands: [],
    topLevelDirectories: [],
  };
}
