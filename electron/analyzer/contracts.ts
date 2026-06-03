import type { AstSymbolSummary, FrameworkSummary, ModuleSummary } from '../types';

export interface FrameworkAdapter {
  name: string;
  detect(localPath: string): Promise<FrameworkSummary | null>;
  scanModules(localPath: string): Promise<ModuleSummary[]>;
}

export interface LanguageFileAnalysis {
  symbols: AstSymbolSummary[];
  imports: string[];
  calls: string[];
  hasErrors: boolean;
}

export interface LanguageAnalyzerAdapter {
  language: string;
  extensions: string[];
  analyzeFile(filePath: string, content: string): Promise<LanguageFileAnalysis>;
}
