import type { ProjectAnalysisResult, ModuleSummary, FrameworkSummary, LanguageSummary } from '../types';

export function buildAnalysisPrompt(result: ProjectAnalysisResult): string {
  const prompt: string[] = [];
  const profile = result.profile || {
    readmeFiles: [],
    dependencyManifests: [],
    startCommands: [],
    configFiles: [],
    sensitiveFiles: [],
  };

  prompt.push('请基于以下项目分析结果，生成一份简洁的交接总结：\n');

  prompt.push('## 项目基本信息');
  prompt.push(`项目名称：${result.projectName}`);
  prompt.push(`项目路径：${result.localPath}`);
  prompt.push(`分析时间：${result.generatedAt}\n`);

  prompt.push('## 技术栈');
  prompt.push('### 主要编程语言');
  result.languages.forEach((lang: LanguageSummary) => {
    prompt.push(`- ${lang.language}: ${lang.percentage}% (${lang.fileCount} 个文件)`);
  });

  prompt.push('\n### 识别的框架');
  result.frameworks.forEach((fw: FrameworkSummary) => {
    prompt.push(`- ${fw.name}: ${formatConfidencePercent(fw.confidence)}% 置信度`);
    if (fw.evidence && fw.evidence.length > 0) {
      prompt.push(`  依据: ${fw.evidence.slice(0, 3).join(', ')}`);
    }
  });

  prompt.push('\n## 通用项目画像');
  prompt.push(`README: ${profile.readmeFiles.join(', ') || '未识别'}`);
  prompt.push(`依赖清单: ${profile.dependencyManifests.map(item => `${item.path} (${item.ecosystem})`).join(', ') || '未识别'}`);
  prompt.push(`启动命令: ${profile.startCommands.map(item => item.command).join(', ') || '未识别'}`);
  prompt.push(`配置文件: ${profile.configFiles.join(', ') || '未识别'}`);
  if (profile.sensitiveFiles.length > 0) {
    prompt.push(`敏感文件路径提示: ${profile.sensitiveFiles.join(', ')}。仅可提示路径，不得推断或输出文件内容。`);
  }

  if (result.ast) {
    prompt.push('\n## Tree-sitter AST 语言分析');
    prompt.push(`解析语言: ${result.ast.languages.join(', ') || '未识别'}`);
    prompt.push(`已解析文件: ${result.ast.parsedFileCount}`);
    prompt.push(`符号 / 导入 / 调用: ${result.ast.symbolCount} / ${result.ast.importCount} / ${result.ast.callCount}`);
    if (result.ast.relationships) {
      prompt.push(
        `关系图: 调用 ${result.ast.relationships.callGraph.length}, 依赖 ${result.ast.relationships.dependencyReferences.length}, 继承 ${result.ast.relationships.inheritance.length}, 接口实现 ${result.ast.relationships.interfaceImplementations.length}`
      );
    }
    result.ast.files.slice(0, 20).forEach(file => {
      prompt.push(`\n### ${file.path} (${file.language})`);
      if (file.symbols.length > 0) {
        prompt.push(`符号: ${file.symbols.slice(0, 15).map(symbol => `${symbol.kind} ${symbol.parent ? `${symbol.parent}::` : ''}${symbol.name}`).join(', ')}`);
      }
      if (file.imports.length > 0) {
        prompt.push(`导入: ${file.imports.slice(0, 15).join(', ')}`);
      }
      if (file.calls.length > 0) {
        prompt.push(`调用: ${file.calls.slice(0, 20).join(', ')}`);
      }
    });
    result.ast.relationships?.dependencyReferences.slice(0, 20).forEach(edge => {
      prompt.push(`依赖关系: ${edge.fromFile} -> ${edge.importPath}${edge.toFile ? ` (${edge.toFile})` : ''}`);
    });
    result.ast.relationships?.callGraph.slice(0, 20).forEach(edge => {
      prompt.push(`调用关系: ${edge.fromFile} -> ${edge.call}${edge.toFile ? ` (${edge.toFile})` : ''}`);
    });
  }

  if (result.git) {
    prompt.push('\n## Git 贡献分析');
    prompt.push(`参与作者总数: ${result.git.authors.length}`);
    prompt.push('\n### Top 贡献者');
    result.git.authors.slice(0, 5).forEach((author, index) => {
      prompt.push(`${index + 1}. ${author.name} (${author.commitCount} 次提交)`);
    });

    if (result.git.selectedAuthor) {
      prompt.push('\n### 选定作者详情');
      prompt.push(`姓名: ${result.git.selectedAuthor.name}`);
      prompt.push(`邮箱: ${result.git.selectedAuthor.email}`);
      prompt.push(`提交次数: ${result.git.selectedAuthor.commitCount}`);
      if (result.git.selectedAuthor.changedFiles.length > 0) {
        prompt.push('\n高频修改文件:');
        result.git.selectedAuthor.changedFiles.slice(0, 10).forEach(file => {
          prompt.push(`  - ${file.filePath} (${file.changeCount} 次)`);
        });
      }
    }
  }

  prompt.push('\n## 项目模块');
  result.modules.forEach((module: ModuleSummary) => {
    prompt.push(`\n### ${module.name} (${module.type})`);
    if (module.framework) {
      prompt.push(`框架: ${module.framework}`);
    }
    prompt.push(`文件数: ${module.files.length}`);
    if (module.summary) {
      prompt.push(`描述: ${module.summary}`);
    }
    if (module.routes?.length) {
      prompt.push(`路由: ${module.routes.slice(0, 5).join(', ')}`);
    }
    if (module.commands?.length) {
      prompt.push(`命令: ${module.commands.join(', ')}`);
    }
    if (module.tables?.length) {
      prompt.push(`数据表: ${module.tables.join(', ')}`);
    }
  });

  prompt.push('\n\n请生成一段 200-300 字的交接总结，包括：');
  prompt.push('1. 项目主要功能描述（基于模块和框架推断）');
  prompt.push('2. 技术架构概述');
  prompt.push('3. 重点关注区域');
  prompt.push('4. 可能的交接难点');

  return prompt.join('\n');
}

function formatConfidencePercent(confidence: number): number {
  const value = confidence > 1 ? confidence : confidence * 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildSystemPrompt(): string {
  return `你是一个资深软件工程师和代码交接专家。你的任务是分析代码库结构，为项目交接生成清晰、准确、有价值的总结文档。

你的职责：
1. 理解项目的技术栈和架构模式
2. 识别核心功能模块和它们之间的关系
3. 基于代码结构推断项目的主要功能
4. 识别可能的复杂性和风险点
5. 提供实用的交接建议

输出要求：
- 使用简洁专业的技术语言
- 避免过度推断不确定的信息
- 重点突出架构和关键模块
- 提供可操作的建议
- 保持客观中立的态度

注意：
- 如果信息不足以做出准确推断，明确说明
- 不要编造不存在的功能或模块
- 优先使用客观代码结构信息而非主观猜测`;
}
