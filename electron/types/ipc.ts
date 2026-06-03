/**
 * CodeHandover - IPC Channel Definitions
 * Electron IPC channel names and type mappings
 */

import { AnalyzeOptions, ProjectAnalysisResult, AnalyzeProgress, ProjectInfo, GitAuthorSummary } from './index';

// ============================================================================
// IPC Channel Names
// ============================================================================

export const IPC_CHANNELS = {
  // Directory & Git Operations
  SELECT_DIRECTORY: 'select-directory',
  CHECK_GIT_REPO: 'check-git-repo',
  GET_BRANCHES: 'get-branches',
  GET_AUTHORS: 'get-authors',
  GET_COMMIT_LOG: 'get-commit-log',
  CLONE_REPO: 'clone-repo',

  // Analysis Operations
  ANALYZE_PROJECT: 'analyze-project',
  ANALYZE_PROGRESS: 'analyze-progress',

  // Document Operations
  GENERATE_DOCUMENT: 'generate-document',
  OPEN_FILE: 'open-file',
} as const;

// ============================================================================
// IPC Channel Type Unions
// ============================================================================

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// ============================================================================
// IPC Handler Input/Output Types
// ============================================================================

// Select Directory
export interface SelectDirectoryInput {
  title?: string;
}

export interface SelectDirectoryOutput {
  path: string | null;
}

// Check Git Repo
export interface CheckGitRepoInput {
  localPath: string;
}

export interface CheckGitRepoOutput {
  hasGit: boolean;
  currentBranch?: string;
}

// Get Branches
export interface GetBranchesInput {
  localPath: string;
}

export interface GetBranchesOutput {
  branches: string[];
}

// Get Authors
export interface GetAuthorsInput {
  localPath: string;
}

export interface GetAuthorsOutput {
  authors: GitAuthorSummary[];
}

// Get Commit Log
export interface GetCommitLogInput {
  localPath: string;
  authorName?: string;
  authorEmail?: string;
  since?: string;
  until?: string;
}

export interface GetCommitLogOutput {
  commits: Array<{
    hash: string;
    authorName: string;
    authorEmail: string;
    date: string;
    message: string;
  }>;
}

// Clone Repo
export interface CloneRepoInput {
  repoUrl: string;
  localPath: string;
  branch?: string;
}

export interface CloneRepoOutput {
  success: boolean;
  error?: string;
}

// Analyze Project
export interface AnalyzeProjectInput {
  options: AnalyzeOptions;
}

export interface AnalyzeProjectOutput {
  result: ProjectAnalysisResult;
}

// Analyze Progress (event-based)
export interface AnalyzeProgressData {
  progress: AnalyzeProgress;
}

// Generate Document
export interface GenerateDocumentInput {
  result: ProjectAnalysisResult;
  outputPath: string;
}

export interface GenerateDocumentOutput {
  success: boolean;
  outputPath?: string;
  error?: string;
}

// Open File
export interface OpenFileInput {
  path: string;
}

export interface OpenFileOutput {
  success: boolean;
  error?: string;
}

// ============================================================================
// IPC Event Payload Types (for renderer -> main events)
// ============================================================================

export interface IpcInvokePayload {
  channel: IpcChannel;
}

export interface IpcSendPayload {
  channel: IpcChannel;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isSelectDirectoryInput(data: unknown): data is SelectDirectoryInput {
  return typeof data === 'object' && data !== null;
}

export function isAnalyzeProjectInput(data: unknown): data is AnalyzeProjectInput {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.options === 'object' && d.options !== null;
}
