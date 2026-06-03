import * as path from 'path';
import type { ProjectAnalysisResult } from '../types';
import { generateHtml } from './html';
import { generateMarkdown } from './markdown';
import { generatePdf } from './pdf';

export type DocumentFormat = 'markdown' | 'html' | 'pdf';

export async function generateDocument(result: ProjectAnalysisResult, outputPath: string): Promise<string> {
  const format = getDocumentFormat(outputPath);

  if (format === 'html') return generateHtml(result, outputPath);
  if (format === 'pdf') return generatePdf(result, outputPath);
  return generateMarkdown(result, outputPath);
}

export function getDocumentFormat(outputPath: string): DocumentFormat {
  const extension = path.extname(outputPath).toLowerCase();
  if (extension === '.html') return 'html';
  if (extension === '.pdf') return 'pdf';
  return 'markdown';
}
