/**
 * CodeHandover - TypeScript Type Definitions
 * Generated for Electron + Vue 3 + TypeScript Windows Desktop App
 */

// ============================================================================
// Analysis Configuration
// ============================================================================

export interface AnalyzeOptions {
  localPath: string;
  sourceType: 'remote' | 'local';
  repoUrl?: string;
  branch?: string;
  enableGitAnalysis: boolean;
  enableAiSummary: boolean;
  outputType: 'markdown' | 'html' | 'pdf';
  authorName?: string;
  authorEmail?: string;
  since?: string;
  until?: string;
}

// ============================================================================
// Main Analysis Result
// ============================================================================

export interface ProjectAnalysisResult {
  projectName: string;
  localPath: string;
  repoUrl?: string;
  branch?: string;
  commitHash?: string;
  aiSummary?: string;
  aiSummaryProvider?: string;
  languages: LanguageSummary[];
  frameworks: FrameworkSummary[];
  profile: ProjectProfile;
  ast?: AstAnalysisResult;
  git?: GitAnalysisResult;
  modules: ModuleSummary[];
  files: FileSummary[];
  generatedAt: string;
}

export interface ProjectProfile {
  readmeFiles: string[];
  documentationFiles: string[];
  dependencyManifests: DependencyManifestSummary[];
  configFiles: string[];
  sensitiveFiles: string[];
  startCommands: StartCommandSummary[];
  topLevelDirectories: DirectorySummary[];
}

export interface DependencyManifestSummary {
  path: string;
  ecosystem: string;
  dependencyCount: number;
  devDependencyCount?: number;
  packageManager?: string;
}

export interface StartCommandSummary {
  command: string;
  source: string;
}

export interface DirectorySummary {
  path: string;
  fileCount: number;
}

export interface AstAnalysisResult {
  engine: 'tree-sitter-wasm' | 'tree-sitter-wasm+static-fallback';
  languages: string[];
  files: AstFileSummary[];
  relationships: AstRelationshipGraph;
  parsedFileCount: number;
  skippedFileCount: number;
  symbolCount: number;
  importCount: number;
  callCount: number;
  failures: AstFailureSummary[];
}

export interface AstFileSummary {
  path: string;
  language: string;
  symbols: AstSymbolSummary[];
  imports: string[];
  calls: string[];
  hasErrors: boolean;
}

export interface AstSymbolSummary {
  name: string;
  kind: string;
  line: number;
  parent?: string;
  signature?: string;
  visibility?: string;
  extends?: string[];
  implements?: string[];
}

export interface AstFailureSummary {
  path: string;
  reason: string;
}

export interface AstRelationshipGraph {
  callGraph: AstCallGraphEdge[];
  inheritance: AstInheritanceEdge[];
  interfaceImplementations: AstInterfaceImplementationEdge[];
  dependencyReferences: AstDependencyReferenceEdge[];
}

export interface AstCallGraphEdge {
  fromFile: string;
  toFile?: string;
  call: string;
  resolvedSymbol?: string;
}

export interface AstInheritanceEdge {
  file: string;
  symbol: string;
  base: string;
}

export interface AstInterfaceImplementationEdge {
  file: string;
  symbol: string;
  interfaceName: string;
}

export interface AstDependencyReferenceEdge {
  fromFile: string;
  importPath: string;
  toFile?: string;
  kind: 'relative' | 'package' | 'module';
}

// ============================================================================
// Language & Framework Summaries
// ============================================================================

export interface LanguageSummary {
  language: string;
  fileCount: number;
  percentage: number;
  extensions: string[];
}

export interface FrameworkSummary {
  name: string;
  confidence: number;
  evidence: string[];
}

// ============================================================================
// Git Analysis Results
// ============================================================================

export interface GitAnalysisResult {
  authors: GitAuthorSummary[];
  selectedAuthor?: GitAuthorDetail;
}

export interface GitAuthorSummary {
  name: string;
  email: string;
  commitCount: number;
}

export interface GitAuthorDetail {
  name: string;
  email: string;
  commitCount: number;
  analysisCommitCount?: number;
  firstCommitDate?: string;
  lastCommitDate?: string;
  totalAdditions?: number;
  totalDeletions?: number;
  languageStats?: GitContributionStat[];
  moduleStats?: GitContributionStat[];
  riskFiles?: GitChangedFile[];
  changedFiles: GitChangedFile[];
  recentCommits: GitCommit[];
}

export interface GitChangedFile {
  filePath: string;
  changeCount: number;
  commitHashes?: string[];
  firstCommitDate?: string;
  lastCommitDate?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  additions?: number;
  deletions?: number;
  statusCounts?: Record<'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'other', number>;
  status?: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'other';
  previousPath?: string;
  exists?: boolean;
  moduleName?: string;
  language?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  riskReasons?: string[];
}

export interface GitContributionStat {
  name: string;
  fileCount: number;
  changeCount: number;
  additions: number;
  deletions: number;
}

export interface GitCommit {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  files: string[];
  additions?: number;
  deletions?: number;
}

// ============================================================================
// Module & File Summaries
// ============================================================================

export interface RouteInfo {
  method: string;
  path: string;
  handler?: string;
  file?: string;
}

export type ModuleType =
  | 'controller'
  | 'service'
  | 'command'
  | 'model'
  | 'route'
  | 'config'
  | 'job'
  | 'middleware'
  | 'other'
  | 'migration'
  | 'util'
  | 'view'
  | 'component'
  | 'store';

export interface ModuleSummary {
  name: string;
  type: ModuleType;
  framework?: string;
  files: string[];
  routes?: string[];
  commands?: string[];
  tables?: string[];
  summary?: string;
  /** @deprecated Use files array length instead */
  fileCount?: number;
  /** @deprecated Use summary instead */
  description?: string;
  /** @deprecated Use files[0] instead */
  path?: string;
  /** @deprecated Not used in ModuleSummary */
  table?: string;
}

export interface FileSummary {
  path: string;
  name: string;
  extension: string;
  language: string;
  size: number;
  lastModified?: string;
}

// ============================================================================
// Progress Tracking
// ============================================================================

export interface AnalyzeProgress {
  stage: string;
  stageIndex: number;
  totalStages: number;
  message: string;
  percentage: number;
}

// ============================================================================
// Project Info (for config page)
// ============================================================================

export interface ProjectInfo {
  localPath: string;
  hasGit: boolean;
  currentBranch?: string;
  branches?: string[];
  authors?: GitAuthorSummary[];
}
