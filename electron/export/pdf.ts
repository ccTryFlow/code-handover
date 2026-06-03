import { BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { ProjectAnalysisResult } from '../types';
import { buildHtmlDocument } from './html';
import { buildMarkdownContent } from './markdown';

export async function generatePdf(result: ProjectAnalysisResult, outputPath: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `codehandover-${randomUUID()}.html`);
  let printWindow: BrowserWindow | null = null;

  try {
    const html = buildHtmlDocument(await buildMarkdownContent(result), `${result.projectName} 交接文档`);
    await fs.writeFile(tempPath, html, 'utf-8');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
      },
    });
    await printWindow.loadFile(tempPath);

    const pdf = await printWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5,
      },
    });
    await fs.writeFile(outputPath, pdf);
    return outputPath;
  } finally {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.destroy();
    }
    await fs.unlink(tempPath).catch(() => undefined);
  }
}
