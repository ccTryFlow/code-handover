import { executeAI, AISummaryRequest, AISummaryResponse } from './provider';
import { buildAnalysisPrompt, buildSystemPrompt } from './prompt';
import { ProjectAnalysisResult } from '../types';

export { executeAI, detectAvailableCliProviders } from './provider';
export type { AIProvider, AICliProvider, AICustomProvider, AICustomProviderProtocol, AISummaryRequest, AISummaryResponse } from './provider';

export async function generateAiSummary(
  result: ProjectAnalysisResult,
  provider: AISummaryRequest['provider']
): Promise<AISummaryResponse> {
  const systemPrompt = buildSystemPrompt();
  const prompt = buildAnalysisPrompt(result);

  return executeAI({
    provider,
    prompt,
    systemPrompt,
    maxTokens: 4096,
  });
}

export async function generateAiModuleSummary(
  moduleName: string,
  moduleFiles: string[],
  codeSnippets: string,
  provider: AISummaryRequest['provider']
): Promise<AISummaryResponse> {
  const systemPrompt = `你是一个资深项目交接文档生成助手。请根据提供的模块代码摘要生成模块说明。
要求：
1. 只能根据提供的信息生成，不要编造
2. 重点说明模块职责、核心流程
3. 输出简洁的中文 Markdown 格式`;

  const prompt = `## 模块: ${moduleName}\n\n### 相关文件:\n${moduleFiles.map(f => `- ${f}`).join('\n')}\n\n### 代码摘要:\n${codeSnippets}\n\n请生成该模块的交接说明。`;

  return executeAI({ provider, prompt, systemPrompt, maxTokens: 2048 });
}
