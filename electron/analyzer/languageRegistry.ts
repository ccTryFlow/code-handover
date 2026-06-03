import * as path from 'path';
import type { LanguageAnalyzerAdapter } from './contracts';
import { phpLanguageAdapter } from './languages/php';
import { goLanguageAdapter } from './languages/go';
import { javaLanguageAdapter } from './languages/java';
import { pythonLanguageAdapter } from './languages/python';
import { csharpLanguageAdapter } from './languages/csharp';
import { cLanguageAdapter, cppLanguageAdapter } from './languages/cpp';
import { rustLanguageAdapter } from './languages/rust';
import { vueLanguageAdapter } from './languages/vue';
import {
  javascriptLanguageAdapter,
  typescriptLanguageAdapter,
  tsxLanguageAdapter,
} from './languages/javascript';

export const LANGUAGE_ANALYZER_ADAPTERS: LanguageAnalyzerAdapter[] = [
  phpLanguageAdapter,
  goLanguageAdapter,
  javaLanguageAdapter,
  pythonLanguageAdapter,
  javascriptLanguageAdapter,
  typescriptLanguageAdapter,
  tsxLanguageAdapter,
  vueLanguageAdapter,
  csharpLanguageAdapter,
  cLanguageAdapter,
  cppLanguageAdapter,
  rustLanguageAdapter,
];

export function getLanguageAnalyzerAdapter(filePath: string): LanguageAnalyzerAdapter | undefined {
  const extension = path.extname(filePath).toLowerCase();
  return LANGUAGE_ANALYZER_ADAPTERS.find(adapter => adapter.extensions.includes(extension));
}
