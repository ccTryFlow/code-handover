const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, '.codex-tmp', 'core-test');
const fixtureDir = path.join(tmpDir, 'fixture-repo');
const genericFixtureDir = path.join(tmpDir, 'generic-project');
const astFixtureDir = path.join(tmpDir, 'ast-project');
const frameworkFixtureDir = path.join(tmpDir, 'framework-project');
const remoteDir = path.join(tmpDir, 'fixture-remote.git');
const bundleDir = path.join(tmpDir, 'bundle');
const outputPath = path.join(fixtureDir, 'handover_Alice.md');
const htmlOutputPath = path.join(fixtureDir, 'handover_Alice.html');
const genericOutputPath = path.join(genericFixtureDir, 'handover_project.md');
const astOutputPath = path.join(astFixtureDir, 'handover_ast.md');
const cloneSourcePath = path.join(rootDir, 'electron', 'git', 'clone.ts');

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: options.stdio || 'pipe',
    env: { ...process.env, ...(options.env || {}) },
    windowsHide: true,
  });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function commitAs(authorName, authorEmail, message) {
  run('git', ['add', '.'], { cwd: fixtureDir });
  run('git', [
    '-c',
    `user.name=${authorName}`,
    '-c',
    `user.email=${authorEmail}`,
    'commit',
    '-m',
    message,
  ], { cwd: fixtureDir });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resetFixture() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(fixtureDir, { recursive: true });
  run('git', ['init'], { cwd: fixtureDir });
  run('git', ['config', 'core.autocrlf', 'false'], { cwd: fixtureDir });
}

function createFixtureRepository() {
  resetFixture();

  writeFile(path.join(fixtureDir, 'app', 'Services', 'LegacyService.php'), `<?php
namespace App\\Services;

class LegacyService
{
    public function untouchedByAlice(): void
    {
        Cache::put('legacy', true, 60);
    }
}
`);
  writeFile(path.join(fixtureDir, 'artisan'), '#!/usr/bin/env php\n');
  writeFile(path.join(fixtureDir, 'composer.json'), JSON.stringify({
    require: {
      'laravel/framework': '^11.0',
    },
  }, null, 2));
  writeFile(path.join(fixtureDir, 'routes', 'api.php'), `<?php
Route::get('bob-only', [BobController::class, 'index']);
`);
  writeFile(path.join(fixtureDir, 'config', 'app.php'), '<?php return [];\n');
  writeFile(path.join(fixtureDir, 'app', 'Console', 'Commands', 'BobCleanup.php'), `<?php
class BobCleanup
{
    protected $signature = 'bob:cleanup';
}
`);
  writeFile(path.join(fixtureDir, 'app', 'Models', 'BobRecord.php'), `<?php
class BobRecord
{
    protected $table = 'bob_records';
}
`);
  commitAs('Bob Dev', 'bob@example.com', 'add bob legacy service');

  writeFile(path.join(fixtureDir, 'app', 'Services', 'OrderService.php'), `<?php
namespace App\\Services;

class OrderService
{
    /**
     * 创建订单并写入数据库
     */
    public function createOrder(array $payload): int
    {
        DB::transaction(function () use ($payload) {
            if (empty($payload['items'])) {
                throw new InvalidArgumentException('items required');
            }
            Cache::put('last_order', $payload, 60);
        });

        return 1;
    }
}
`);

  writeFile(path.join(fixtureDir, 'handlers', 'order.go'), `package handlers

import "net/http"

// SyncOrders 同步订单数据
func SyncOrders(w http.ResponseWriter, r *http.Request) {
    for i := 0; i < 3; i++ {
        go func() {
            _ = http.MethodGet
        }()
    }
}
`);

  writeFile(path.join(fixtureDir, 'src', 'api', 'orders.ts'), `export async function fetchOrders(userId: string) {
  if (!userId) {
    throw new Error('missing userId')
  }
  const response = await fetch('/api/orders?userId=' + userId)
  return response.json()
}
`);
  writeFile(path.join(fixtureDir, 'routes', 'api.php'), `<?php
Route::get('bob-only', [BobController::class, 'index']);
Route::post('alice-owned', [AliceController::class, 'store']);
`);
  writeFile(path.join(fixtureDir, 'config', 'logging.php'), '<?php return [];\n');
  writeFile(path.join(fixtureDir, 'database', 'migrations', '2026_01_01_000000_create_alice_records.php'), `<?php
return new class {
    public function up(): void
    {
        Schema::create('alice_records', function ($table) {
            $table->id();
        });
    }
};
`);
  writeFile(path.join(fixtureDir, 'app', 'Console', 'Commands', 'AliceSync.php'), `<?php
class AliceSync
{
    protected $signature = 'alice:sync';
}
`);
  writeFile(path.join(fixtureDir, 'app', 'Models', 'AliceRecord.php'), `<?php
class AliceRecord
{
    protected $table = 'alice_records';
}
`);

  commitAs('Alice Dev', 'alice@example.com', 'add alice order handover code');

  fs.renameSync(
    path.join(fixtureDir, 'src', 'api', 'orders.ts'),
    path.join(fixtureDir, 'src', 'api', 'orderClient.ts')
  );
  commitAs('Alice Dev', 'alice@example.com', 'rename alice order api client');

  fs.rmSync(path.join(fixtureDir, 'handlers', 'order.go'));
  commitAs('Alice Dev', 'alice@example.com', 'remove obsolete order sync handler');
}

function bundleCoreModules() {
  fs.mkdirSync(bundleDir, { recursive: true });
  esbuild.buildSync({
    entryPoints: [
      path.join(rootDir, 'electron', 'analyzer', 'index.ts'),
      path.join(rootDir, 'electron', 'export', 'html.ts'),
      path.join(rootDir, 'electron', 'export', 'markdown.ts'),
      path.join(rootDir, 'electron', 'git', 'clone.ts'),
    ],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: bundleDir,
    external: ['electron', 'web-tree-sitter'],
    logLevel: 'silent',
  });
}

async function verifyCoreFlow() {
  const { analyzeProject } = require(path.join(bundleDir, 'analyzer', 'index.js'));
  const { buildHtmlDocument, generateHtml } = require(path.join(bundleDir, 'export', 'html.js'));
  const { generateMarkdown } = require(path.join(bundleDir, 'export', 'markdown.js'));

  const result = await analyzeProject(fixtureDir, {
    localPath: fixtureDir,
    sourceType: 'local',
    enableGitAnalysis: true,
    enableAiSummary: false,
    outputType: 'markdown',
    authorName: 'Wrong Display Name',
    authorEmail: 'alice@example.com',
  });

  result.aiSummary = 'AI summary: Alice mainly owns order creation and synchronization.';
  result.aiSummaryProvider = 'Core Test Provider';

  await generateMarkdown(result, outputPath);

  const markdown = fs.readFileSync(outputPath, 'utf8');
  const selectedAuthor = result.git && result.git.selectedAuthor;
  const changedFiles = selectedAuthor ? selectedAuthor.changedFiles.map(file => file.filePath.replace(/\\/g, '/')) : [];

  assert(selectedAuthor && selectedAuthor.name === 'Alice Dev', '应能按指定 Git 作者生成 selectedAuthor');
  assert(changedFiles.includes('app/Services/OrderService.php'), '应包含 Alice 修改的 PHP 文件');
  assert(changedFiles.includes('handlers/order.go'), '应包含 Alice 删除过的 Go 文件历史记录');
  assert(changedFiles.includes('src/api/orderClient.ts'), '应包含 Alice 重命名后的 TypeScript 文件');
  assert(!changedFiles.includes('src/api/orders.ts'), '重命名文件应以当前路径作为负责文件路径');
  assert(!changedFiles.includes('app/Services/LegacyService.php'), '不应包含 Bob 单独修改的文件');
  const renamedFile = selectedAuthor.changedFiles.find(file => file.filePath.replace(/\\/g, '/') === 'src/api/orderClient.ts');
  const deletedFile = selectedAuthor.changedFiles.find(file => file.filePath.replace(/\\/g, '/') === 'handlers/order.go');
  assert(renamedFile && renamedFile.status === 'renamed' && renamedFile.previousPath === 'src/api/orders.ts', '应识别重命名文件及来源路径');
  assert(deletedFile && deletedFile.status === 'deleted' && deletedFile.exists === false, '应保留已删除文件历史并标记不存在');
  assert(renamedFile && renamedFile.statusCounts && renamedFile.statusCounts.renamed === 1, '应统计文件级重命名次数');
  assert(renamedFile && renamedFile.firstCommitDate && renamedFile.lastCommitDate, '应记录责任文件首末提交日期');
  assert(renamedFile && renamedFile.lastCommitHash, '应记录责任文件最近提交 hash');
  assert(selectedAuthor.analysisCommitCount === 3, '应统计本次筛选范围内的真实提交次数');
  assert(selectedAuthor.totalAdditions > 0, '应统计作者累计新增行');
  assert(selectedAuthor.languageStats.some(item => item.name === 'PHP' && item.fileCount >= 1), '应输出作者语言贡献画像');
  assert(selectedAuthor.moduleStats.some(item => item.name.includes('OrderService')), '应输出作者模块贡献画像');
  assert(selectedAuthor.riskFiles.some(file => file.filePath.replace(/\\/g, '/') === 'database/migrations/2026_01_01_000000_create_alice_records.php'), '应识别数据库迁移类风险文件');
  assert(markdown.includes('createOrder'), 'Markdown 应包含 PHP 方法 createOrder');
  assert(markdown.includes('fetchOrders'), 'Markdown 应包含 TypeScript 方法 fetchOrders');
  assert(markdown.includes('重命名文件') && markdown.includes('src/api/orders.ts'), 'Markdown 应说明重命名来源路径');
  assert(markdown.includes('已删除文件') && markdown.includes('handlers/order.go'), 'Markdown 应说明删除文件历史');
  assert(markdown.includes('提交时间线和风险文件'), 'Markdown 应输出提交时间线和风险文件章节');
  assert(markdown.includes('最近提交') && markdown.includes('rename alice order api client'), 'Markdown 应输出最近提交摘要');
  assert(markdown.includes('累计增删行') && markdown.includes('个人涉及模块'), 'Markdown 应输出贡献画像摘要');
  assert(markdown.includes('需要优先交接的风险文件') && (markdown.includes('高风险') || markdown.includes('中风险')), 'Markdown 应输出风险文件等级');
  assert(markdown.includes('提交窗口') && markdown.includes('最近提交'), 'Markdown 高频文件清单应包含提交窗口');
  assert(!markdown.includes('SyncOrders'), 'Markdown 不应尝试展开当前已删除文件的方法');
  assert(markdown.includes('逻辑备注'), 'Markdown 应包含方法逻辑备注');
  assert(markdown.includes('执行入口'), 'Markdown 方法备注应说明执行入口');
  assert(markdown.includes('关键分支'), 'Markdown 方法备注应说明关键分支');
  assert(markdown.includes('事务'), 'Markdown 应识别事务逻辑');
  assert(markdown.includes('数据读写'), 'Markdown 应识别数据读写路径');
  assert(markdown.includes('缓存'), 'Markdown 应识别缓存逻辑');
  assert(markdown.includes('异步') || markdown.includes('并发'), 'Markdown 应识别异步或并发逻辑');
  assert(markdown.includes('外部调用'), 'Markdown 应识别外部调用逻辑');
  assert(markdown.includes('交接核对'), 'Markdown 方法备注应输出可复现交接核对项');
  assert(markdown.includes('AI 交接摘要'), 'Markdown 应输出 AI 交接摘要章节');
  assert(markdown.includes('Core Test Provider'), 'Markdown 应输出 AI 摘要来源');
  assert(markdown.includes(result.aiSummary), 'Markdown 应输出 AI 摘要内容');
  const html = buildHtmlDocument('# Demo\n\n<script>alert("x")</script>', 'Demo 交接文档');
  assert(html.includes('<h1>Demo</h1>'), 'HTML 导出应转换 Markdown 标题');
  assert(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'), 'HTML 导出应转义潜在脚本内容');
  await generateHtml(result, htmlOutputPath);
  const generatedHtml = fs.readFileSync(htmlOutputPath, 'utf8');
  assert(generatedHtml.includes('<!DOCTYPE html>') && generatedHtml.includes('createOrder'), 'HTML 导出应写入可阅读的交接文档');
  assert(!markdown.includes('untouchedByAlice'), '个人交接文档不应展开非该作者负责的方法');
  assert(markdown.includes('POST alice-owned'), '个人接口清单应包含 Alice 最后维护的路由定义');
  assert(!markdown.includes('GET bob-only'), '个人接口清单不应包含共享路由文件中 Bob 维护的接口');
  assert(markdown.includes('alice:sync'), '个人命令清单应包含 Alice 负责的命令');
  assert(!markdown.includes('bob:cleanup'), '个人命令清单不应透传全仓聚合命令');
  assert(markdown.includes('alice_records'), '个人数据表清单应包含 Alice 负责的模型');
  assert(!markdown.includes('bob_records'), '个人数据表清单不应透传全仓聚合模型');
  assert(markdown.includes('config/logging.php'), '个人配置清单应包含 Alice 修改的配置');
  assert(!markdown.includes('config/app.php'), '个人配置清单不应包含 Bob 单独维护的配置');

  console.log(JSON.stringify({
    outputPath,
    changedFiles,
    assertions: 'passed',
  }, null, 2));
}

async function verifyRemoteBranches() {
  const { getDefaultCloneDirectory, getRemoteBranches } = require(path.join(bundleDir, 'git', 'clone.js'));

  fs.rmSync(remoteDir, { recursive: true, force: true });
  run('git', ['init', '--bare', remoteDir]);
  run('git', ['branch', '-M', 'main'], { cwd: fixtureDir });
  run('git', ['remote', 'add', 'origin', remoteDir], { cwd: fixtureDir });
  run('git', ['push', '-u', 'origin', 'main'], { cwd: fixtureDir });
  run('git', ['checkout', '-b', 'dev'], { cwd: fixtureDir });
  writeFile(path.join(fixtureDir, 'README.md'), '# fixture\n');
  commitAs('Alice Dev', 'alice@example.com', 'add readme on dev');
  run('git', ['push', '-u', 'origin', 'dev'], { cwd: fixtureDir });

  const branches = await getRemoteBranches(remoteDir);
  assert(branches.includes('main'), '远程分支查询应包含 main');
  assert(branches.includes('dev'), '远程分支查询应包含 dev');
  assert(branches[0] === 'main', '远程分支查询应优先返回 main/master');

  assert(
    getDefaultCloneDirectory(tmpDir, 'https://github.com/example/order-service.git')
      === path.join(tmpDir, 'order-service'),
    '应根据 HTTPS 仓库地址生成默认克隆子目录'
  );
  assert(
    getDefaultCloneDirectory(tmpDir, 'git@github.com:example/order-service.git')
      === path.join(tmpDir, 'order-service'),
    '应根据 SSH 仓库地址生成默认克隆子目录'
  );
}

async function verifyGenericProjectProfile() {
  const { analyzeProject } = require(path.join(bundleDir, 'analyzer', 'index.js'));
  const { generateMarkdown } = require(path.join(bundleDir, 'export', 'markdown.js'));

  fs.mkdirSync(genericFixtureDir, { recursive: true });
  writeFile(path.join(genericFixtureDir, 'README.md'), '# Generic project\n');
  writeFile(path.join(genericFixtureDir, 'package.json'), JSON.stringify({
    scripts: {
      dev: 'vite',
      build: 'vite build',
    },
    dependencies: {
      vue: '^3.5.0',
    },
    devDependencies: {
      vite: '^6.0.0',
    },
  }, null, 2));
  writeFile(path.join(genericFixtureDir, '.env.example'), 'API_BASE_URL=http://localhost:8000\n');
  writeFile(path.join(genericFixtureDir, '.env.local'), 'SECRET_TOKEN=do-not-read\n');
  writeFile(path.join(genericFixtureDir, 'config', 'app.yml'), 'name: generic-project\n');
  writeFile(path.join(genericFixtureDir, 'src', 'main.py'), 'print(\"hello\")\n');
  writeFile(path.join(genericFixtureDir, 'Dockerfile'), 'FROM node:24-alpine\n');
  writeFile(path.join(genericFixtureDir, 'Makefile'), 'test:\n\tnpm test\n');
  writeFile(path.join(genericFixtureDir, 'infra', 'main.tf'), 'resource "null_resource" "demo" {}\n');
  writeFile(path.join(genericFixtureDir, 'mobile', 'main.dart'), 'void main() {}\n');
  writeFile(path.join(genericFixtureDir, 'ui', 'Button.svelte'), '<button>OK</button>\n');
  writeFile(path.join(genericFixtureDir, 'ui', 'Page.astro'), '---\n---\n<div />\n');
  writeFile(path.join(genericFixtureDir, 'ios', 'AppDelegate.swift'), 'import UIKit\n');
  writeFile(path.join(genericFixtureDir, 'android', 'MainActivity.kt'), 'class MainActivity\n');
  writeFile(path.join(genericFixtureDir, 'ios', 'ObjCBridge.m'), '@interface ObjCBridge\n@end\n');
  writeFile(path.join(genericFixtureDir, 'scripts', 'deploy.pl'), 'print "deploy";\n');
  writeFile(path.join(genericFixtureDir, 'native', 'lib.zig'), 'pub fn main() void {}\n');

  const result = await analyzeProject(genericFixtureDir, {
    localPath: genericFixtureDir,
    sourceType: 'local',
    enableGitAnalysis: false,
    enableAiSummary: false,
    outputType: 'markdown',
  });

  await generateMarkdown(result, genericOutputPath);

  const markdown = fs.readFileSync(genericOutputPath, 'utf8');
  const filePaths = result.files.map(file => file.path.replace(/\\/g, '/'));
  const languageNames = result.languages.map(item => item.language);
  [
    'Dockerfile',
    'Makefile',
    'HCL',
    'Dart',
    'Svelte',
    'Astro',
    'Swift',
    'Kotlin',
    'Objective-C',
    'Perl',
    'Zig',
  ].forEach(language => {
    assert(languageNames.includes(language), `generic language detection should include ${language}`);
  });

  assert(result.profile.readmeFiles.includes('README.md'), '通用画像应识别 README.md');
  assert(result.profile.readmeFiles.length === 1, 'Windows 下 README 路径应按大小写不敏感规则去重');
  assert(result.profile.dependencyManifests.some(item => item.path === 'package.json' && item.dependencyCount === 1), '通用画像应统计 package.json 依赖');
  assert(result.profile.configFiles.includes('.env.example'), '通用画像应识别可公开的环境变量模板');
  assert(result.profile.configFiles.includes('config/app.yml'), '通用画像应识别 config 目录文件');
  assert(result.profile.startCommands.some(item => item.command === 'npm run dev'), '通用画像应从 package.json scripts 推导启动命令');
  assert(result.profile.sensitiveFiles.includes('.env.local'), '通用画像应提示敏感文件路径');
  assert(!filePaths.includes('.env.local'), '敏感文件不应进入源码内容扫描列表');
  assert(markdown.includes('## 4. 通用项目画像'), '项目交接文档应输出通用项目画像章节');
  assert(markdown.includes('npm run dev'), '项目交接文档应输出可执行启动命令');
  assert(markdown.includes('仅记录路径，未读取文件内容'), '项目交接文档应明确敏感文件只记录路径');
  assert(!markdown.includes('**README.md**：项目目录'), '根目录文件不应被误判为一级目录');
}

async function verifyAstLanguageLayer() {
  const { analyzeProject } = require(path.join(bundleDir, 'analyzer', 'index.js'));
  const { generateMarkdown } = require(path.join(bundleDir, 'export', 'markdown.js'));

  fs.mkdirSync(astFixtureDir, { recursive: true });
  writeFile(path.join(astFixtureDir, 'src', 'OrderService.php'), `<?php
namespace App\\Services;

use Illuminate\\Support\\Facades\\Cache;

class OrderService extends BaseService
{
    public function createOrder(array $payload): int
    {
        Cache::put('last_order', $payload, 60);
        return $this->persist($payload);
    }
}
`);
  writeFile(path.join(astFixtureDir, 'handlers', 'order.go'), `package handlers

import (
    "context"
    "net/http"
)

type OrderService struct {}

func (service *OrderService) SyncOrders(ctx context.Context) error {
    _, err := http.Get("/")
    return err
}
`);
  writeFile(path.join(astFixtureDir, 'src', 'java', 'OrderController.java'), `package app.orders;

import java.util.List;

class OrderController {
    private final OrderRepository repository;

    OrderController(OrderRepository repository) {
        this.repository = repository;
    }

    Order createOrder(Order order) {
        return repository.save(order);
    }
}
`);
  writeFile(path.join(astFixtureDir, 'src', 'python', 'order_service.py'), `from fastapi import APIRouter
import logging

class OrderService:
    def __init__(self, repository):
        self.repository = repository

    def create_order(self, order):
        logging.info("create order")
        return self.repository.save(order)
`);
  writeFile(path.join(astFixtureDir, 'src', 'web', 'orderService.js'), `import api from './api.js';

export class OrderService {
  createOrder(order) {
    return api.post('/orders', order);
  }
}

export function formatOrder(order) {
  return String(order.id);
}
`);
  writeFile(path.join(astFixtureDir, 'src', 'web', 'orderService.ts'), `import type { Order } from './types';
import { api } from './api';

export class TypedOrderService {
  createOrder(order: Order): Promise<Order> {
    return api.post('/orders', order);
  }
}
`);
  writeFile(path.join(astFixtureDir, 'src', 'web', 'OrderCard.tsx'), `import React from 'react';

export function OrderCard({ orderId }: { orderId: string }) {
  return <article>{orderId}</article>;
}
`);
  writeFile(path.join(astFixtureDir, 'src', 'web', 'OrderPanel.vue'), `<template>
  <section>{{ title }}</section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { api } from './api';

const title = computed(() => 'Orders');

function loadOrders() {
  return api.get('/orders');
}
</script>
`);
  writeFile(path.join(astFixtureDir, 'src', 'dotnet', 'OrderController.cs'), `using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

public interface IOrderPort
{
    Task<int> SaveAsync(Order order);
}

public class OrderController : ControllerBase, IOrderPort
{
    public async Task<int> SaveAsync(Order order)
    {
        return await PersistAsync(order);
    }
}
`);
  writeFile(path.join(astFixtureDir, 'native', 'order.cpp'), `#include "order.hpp"

class OrderRunner : public BaseRunner {
public:
    int Run(Order order) {
        return persist_order(order);
    }
};
`);
  writeFile(path.join(astFixtureDir, 'rust', 'order.rs'), `use crate::repo::OrderRepo;

pub trait OrderPort {
    fn save(&self);
}

pub struct OrderService;

impl OrderPort for OrderService {
    fn save(&self) {
        persist_order();
    }
}
`);

  const result = await analyzeProject(astFixtureDir, {
    localPath: astFixtureDir,
    sourceType: 'local',
    enableGitAnalysis: false,
    enableAiSummary: false,
    outputType: 'markdown',
  });

  await generateMarkdown(result, astOutputPath);

  const markdown = fs.readFileSync(astOutputPath, 'utf8');
  const phpFile = result.ast && result.ast.files.find(file => file.path === 'src/OrderService.php');
  const goFile = result.ast && result.ast.files.find(file => file.path === 'handlers/order.go');
  const javaFile = result.ast && result.ast.files.find(file => file.path === 'src/java/OrderController.java');
  const pythonFile = result.ast && result.ast.files.find(file => file.path === 'src/python/order_service.py');
  const javascriptFile = result.ast && result.ast.files.find(file => file.path === 'src/web/orderService.js');
  const typescriptFile = result.ast && result.ast.files.find(file => file.path === 'src/web/orderService.ts');
  const tsxFile = result.ast && result.ast.files.find(file => file.path === 'src/web/OrderCard.tsx');
  const vueFile = result.ast && result.ast.files.find(file => file.path === 'src/web/OrderPanel.vue');
  const csharpFile = result.ast && result.ast.files.find(file => file.path === 'src/dotnet/OrderController.cs');
  const cppFile = result.ast && result.ast.files.find(file => file.path === 'native/order.cpp');
  const rustFile = result.ast && result.ast.files.find(file => file.path === 'rust/order.rs');

  assert(result.ast && result.ast.engine === 'tree-sitter-wasm+static-fallback', 'AST 分析应标记 Tree-sitter + 静态降级混合引擎');
  assert(
    ['PHP', 'Go', 'Java', 'Python', 'JavaScript', 'TypeScript', 'Vue', 'C#', 'C++', 'Rust'].every(language => result.ast.languages.includes(language)),
    'AST 分析应覆盖 P0 语言与本批 WASM 适配语言'
  );
  assert(phpFile && phpFile.symbols.some(symbol => symbol.kind === 'class' && symbol.name === 'OrderService'), 'PHP AST 应识别类');
  assert(phpFile && phpFile.symbols.some(symbol => symbol.kind === 'method' && symbol.name === 'createOrder'), 'PHP AST 应识别方法');
  assert(phpFile && phpFile.imports.includes('Illuminate\\Support\\Facades\\Cache'), 'PHP AST 应识别 use 导入');
  assert(phpFile && phpFile.calls.includes('Cache::put') && phpFile.calls.includes('$this->persist'), 'PHP AST 应识别静态与实例调用');
  assert(goFile && goFile.symbols.some(symbol => symbol.kind === 'struct' && symbol.name === 'OrderService'), 'Go AST 应识别结构体');
  assert(goFile && goFile.symbols.some(symbol => symbol.kind === 'method' && symbol.name === 'SyncOrders'), 'Go AST 应识别方法');
  assert(goFile && goFile.imports.includes('net/http'), 'Go AST 应识别包导入');
  assert(goFile && goFile.calls.includes('http.Get'), 'Go AST 应识别函数调用');
  assert(javaFile && javaFile.symbols.some(symbol => symbol.kind === 'class' && symbol.name === 'OrderController'), 'Java AST 应识别类');
  assert(javaFile && javaFile.symbols.some(symbol => symbol.kind === 'method' && symbol.name === 'createOrder'), 'Java AST 应识别方法');
  assert(javaFile && javaFile.imports.includes('java.util.List'), 'Java AST 应识别 import 导入');
  assert(javaFile && javaFile.calls.includes('repository.save'), 'Java AST 应识别方法调用');
  assert(pythonFile && pythonFile.symbols.some(symbol => symbol.kind === 'class' && symbol.name === 'OrderService'), 'Python AST 应识别类');
  assert(pythonFile && pythonFile.symbols.some(symbol => symbol.kind === 'method' && symbol.name === 'create_order'), 'Python AST 应识别方法');
  assert(pythonFile && pythonFile.imports.includes('fastapi::APIRouter'), 'Python AST 应识别 from import 导入');
  assert(pythonFile && pythonFile.calls.includes('self.repository.save'), 'Python AST 应识别方法调用');
  assert(javascriptFile && javascriptFile.symbols.some(symbol => symbol.kind === 'class' && symbol.name === 'OrderService'), 'JavaScript AST 应识别类');
  assert(javascriptFile && javascriptFile.symbols.some(symbol => symbol.kind === 'function' && symbol.name === 'formatOrder'), 'JavaScript AST 应识别函数');
  assert(javascriptFile && javascriptFile.imports.includes('./api.js'), 'JavaScript AST 应识别 import 导入');
  assert(javascriptFile && javascriptFile.calls.includes('api.post'), 'JavaScript AST 应识别方法调用');
  assert(typescriptFile && typescriptFile.symbols.some(symbol => symbol.kind === 'class' && symbol.name === 'TypedOrderService'), 'TypeScript AST 应识别类');
  assert(typescriptFile && typescriptFile.calls.includes('api.post'), 'TypeScript AST 应识别方法调用');
  assert(tsxFile && tsxFile.symbols.some(symbol => symbol.kind === 'function' && symbol.name === 'OrderCard'), 'TSX AST 应识别组件函数');
  assert(tsxFile && tsxFile.imports.includes('react'), 'TSX AST 应识别 React 导入');
  assert(vueFile && vueFile.symbols.some(symbol => symbol.name === 'loadOrders'), 'Vue SFC AST 应识别 script setup 函数');
  assert(vueFile && vueFile.imports.includes('vue'), 'Vue SFC AST 应识别 script setup 导入');
  assert(vueFile && vueFile.calls.includes('api.get'), 'Vue SFC AST 应识别脚本调用');
  assert(csharpFile && csharpFile.symbols.some(symbol => symbol.kind === 'class' && symbol.name === 'OrderController'), 'C# fallback 应识别类');
  assert(csharpFile && csharpFile.imports.includes('Microsoft.AspNetCore.Mvc'), 'C# fallback 应识别 using 导入');
  assert(csharpFile && csharpFile.calls.includes('PersistAsync'), 'C# fallback 应识别方法调用');
  assert(cppFile && cppFile.symbols.some(symbol => symbol.kind === 'class' && symbol.name === 'OrderRunner'), 'C++ fallback 应识别类');
  assert(cppFile && cppFile.imports.includes('order.hpp'), 'C++ fallback 应识别 include');
  assert(rustFile && rustFile.symbols.some(symbol => symbol.kind === 'trait' && symbol.name === 'OrderPort'), 'Rust fallback 应识别 trait');
  assert(rustFile && rustFile.imports.includes('crate::repo::OrderRepo'), 'Rust fallback 应识别 use 导入');
  assert(result.ast.relationships.dependencyReferences.some(edge => edge.fromFile === 'src/web/OrderPanel.vue' && edge.importPath === './api'), '关系层应记录 Vue SFC 依赖引用');
  assert(result.ast.relationships.callGraph.some(edge => edge.call === 'api.post' || edge.call === 'api.get'), '关系层应记录调用图边');
  assert(result.ast.relationships.inheritance.some(edge => edge.symbol === 'OrderService' && edge.base === 'BaseService'), '关系层应记录继承关系');
  assert(result.ast.relationships.interfaceImplementations.some(edge => edge.symbol === 'OrderController' && edge.interfaceName.includes('IOrderPort')), '关系层应记录接口实现关系');
  assert(markdown.includes('## 3. Tree-sitter AST 语言分析'), '项目交接文档应输出 AST 分析章节');
  assert(markdown.includes('method OrderService::createOrder'), '项目交接文档应输出 PHP AST 方法');
  assert(markdown.includes('http.Get'), '项目交接文档应输出 Go 调用关系');
  assert(markdown.includes('关系图摘要'), '项目交接文档应输出关系图摘要');
}

async function verifyFrameworkAdapters() {
  const { detectFrameworks, analyzeProject } = require(path.join(bundleDir, 'analyzer', 'index.js'));

  fs.mkdirSync(frameworkFixtureDir, { recursive: true });
  writeFile(path.join(frameworkFixtureDir, 'composer.json'), JSON.stringify({
    require: {
      'topthink/framework': '^8.0',
      'symfony/framework-bundle': '^7.0',
    },
  }, null, 2));
  writeFile(path.join(frameworkFixtureDir, 'think'), '#!/usr/bin/env php\n');
  writeFile(path.join(frameworkFixtureDir, 'app', 'controller', 'OrderController.php'), '<?php class OrderController {}\n');
  writeFile(path.join(frameworkFixtureDir, 'route', 'app.php'), '<?php Route::get("orders", "OrderController@index");\n');
  writeFile(path.join(frameworkFixtureDir, 'bin', 'console'), '#!/usr/bin/env php\n');
  writeFile(path.join(frameworkFixtureDir, 'src', 'Controller', 'OrderController.php'), '<?php class SymfonyOrderController {}\n');
  writeFile(path.join(frameworkFixtureDir, 'config', 'bundles.php'), '<?php return [];\n');
  writeFile(path.join(frameworkFixtureDir, 'config', 'routes.yaml'), 'orders:\n  path: /orders\n');
  writeFile(path.join(frameworkFixtureDir, 'go.mod'), 'module demo\n\nrequire github.com/zeromicro/go-zero v1.7.0\n');
  writeFile(path.join(frameworkFixtureDir, 'internal', 'handler', 'orderhandler.go'), 'package handler\n');
  writeFile(path.join(frameworkFixtureDir, 'internal', 'logic', 'orderlogic.go'), 'package logic\n');
  writeFile(path.join(frameworkFixtureDir, 'order.api'), 'service demo-api { @handler listOrders get /orders }\n');
  writeFile(path.join(frameworkFixtureDir, 'pyproject.toml'), '[project]\ndependencies = ["django", "flask", "fastapi"]\n');
  writeFile(path.join(frameworkFixtureDir, 'manage.py'), 'import django\n');
  writeFile(path.join(frameworkFixtureDir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/orders")\ndef orders(): pass\n');
  writeFile(path.join(frameworkFixtureDir, 'main.py'), 'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/orders")\ndef orders(): pass\n');
  writeFile(path.join(frameworkFixtureDir, 'package.json'), JSON.stringify({
    dependencies: {
      '@nestjs/core': '^10.0.0',
      '@angular/core': '^17.0.0',
      '@sveltejs/kit': '^2.0.0',
      electron: '^33.0.0',
      express: '^4.0.0',
      nuxt: '^3.0.0',
      react: '^18.0.0',
      next: '^14.0.0',
      vue: '^3.5.0',
    },
  }, null, 2));
  writeFile(path.join(frameworkFixtureDir, 'nest-cli.json'), '{}\n');
  writeFile(path.join(frameworkFixtureDir, 'src', 'main.ts'), 'import { NestFactory } from "@nestjs/core";\n');
  writeFile(path.join(frameworkFixtureDir, 'routes', 'orders.js'), 'router.get("/orders", handler)\n');
  writeFile(path.join(frameworkFixtureDir, 'src', 'App.tsx'), 'export function App() { return null }\n');
  writeFile(path.join(frameworkFixtureDir, 'next.config.js'), 'module.exports = {}\n');
  writeFile(path.join(frameworkFixtureDir, 'src', 'components', 'OrderList.vue'), '<script setup>const a = 1</script>\n');
  writeFile(path.join(frameworkFixtureDir, 'Gemfile'), 'gem "rails"\ngem "sinatra"\n');
  writeFile(path.join(frameworkFixtureDir, 'config', 'application.rb'), 'module Demo\n  class Application < Rails::Application\n  end\nend\n');
  writeFile(path.join(frameworkFixtureDir, 'config', 'routes.rb'), 'Rails.application.routes.draw do\n  resources :orders\nend\n');
  writeFile(path.join(frameworkFixtureDir, 'app', 'controllers', 'orders_controller.rb'), 'class OrdersController < ApplicationController\nend\n');
  writeFile(path.join(frameworkFixtureDir, 'app', 'models', 'order.rb'), 'class Order < ApplicationRecord\nend\n');
  writeFile(path.join(frameworkFixtureDir, 'app.rb'), 'require "sinatra"\nget "/orders" do\n  "ok"\nend\n');
  writeFile(path.join(frameworkFixtureDir, 'config.ru'), 'run Sinatra::Application\n');
  writeFile(path.join(frameworkFixtureDir, 'OrderApi.csproj'), '<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup><PackageReference Include="Microsoft.AspNetCore.App" /></ItemGroup></Project>\n');
  writeFile(path.join(frameworkFixtureDir, 'Program.cs'), 'var builder = WebApplication.CreateBuilder(args);\n');
  writeFile(path.join(frameworkFixtureDir, 'Controllers', 'OrdersController.cs'), 'public class OrdersController {}\n');
  writeFile(path.join(frameworkFixtureDir, 'appsettings.json'), '{}\n');
  writeFile(path.join(frameworkFixtureDir, 'angular.json'), '{}\n');
  writeFile(path.join(frameworkFixtureDir, 'src', 'app', 'app.component.ts'), 'export class AppComponent {}\n');
  writeFile(path.join(frameworkFixtureDir, 'nuxt.config.ts'), 'export default defineNuxtConfig({})\n');
  writeFile(path.join(frameworkFixtureDir, 'pages', 'index.vue'), '<template><div /></template>\n');
  writeFile(path.join(frameworkFixtureDir, 'server', 'api', 'orders.get.ts'), 'export default defineEventHandler(() => [])\n');
  writeFile(path.join(frameworkFixtureDir, 'svelte.config.js'), 'export default {}\n');
  writeFile(path.join(frameworkFixtureDir, 'src', 'routes', '+page.svelte'), '<h1>Orders</h1>\n');
  writeFile(path.join(frameworkFixtureDir, 'electron', 'main.ts'), 'import { app } from "electron";\n');
  writeFile(path.join(frameworkFixtureDir, 'pubspec.yaml'), 'dependencies:\n  flutter:\n    sdk: flutter\n');
  writeFile(path.join(frameworkFixtureDir, 'lib', 'main.dart'), 'void main() {}\n');
  writeFile(path.join(frameworkFixtureDir, 'settings.gradle'), 'pluginManagement {}\n');
  writeFile(path.join(frameworkFixtureDir, 'app', 'build.gradle'), 'plugins { id "com.android.application" }\n');
  writeFile(path.join(frameworkFixtureDir, 'app', 'src', 'main', 'AndroidManifest.xml'), '<manifest />\n');
  writeFile(path.join(frameworkFixtureDir, 'app', 'src', 'main', 'kotlin', 'MainActivity.kt'), 'class MainActivity\n');
  writeFile(path.join(frameworkFixtureDir, 'Demo.xcodeproj', 'project.pbxproj'), '// !$*UTF8*$!\n');
  writeFile(path.join(frameworkFixtureDir, 'Podfile'), 'pod "Alamofire"\n');
  writeFile(path.join(frameworkFixtureDir, 'Sources', 'App.swift'), 'import Foundation\n');
  writeFile(path.join(frameworkFixtureDir, 'mix.exs'), 'defp deps do\n  [{:phoenix, "~> 1.7"}]\nend\n');
  writeFile(path.join(frameworkFixtureDir, 'config', 'config.exs'), 'import Config\n');
  writeFile(path.join(frameworkFixtureDir, 'lib', 'demo_web', 'router.ex'), 'defmodule DemoWeb.Router do\nend\n');
  writeFile(path.join(frameworkFixtureDir, 'priv', 'repo', 'migrations', '20260101000000_create_orders.exs'), 'defmodule Demo.Repo.Migrations.CreateOrders do\nend\n');
  writeFile(path.join(frameworkFixtureDir, 'build.gradle.kts'), 'dependencies { implementation("io.ktor:ktor-server-core") }\n');
  writeFile(path.join(frameworkFixtureDir, 'src', 'main', 'kotlin', 'Application.kt'), 'fun main() {}\n');
  writeFile(path.join(frameworkFixtureDir, 'src', 'main', 'resources', 'application.conf'), 'ktor {}\n');
  writeFile(path.join(frameworkFixtureDir, 'src-tauri', 'Cargo.toml'), '[dependencies]\ntauri = "2"\n');
  writeFile(path.join(frameworkFixtureDir, 'src-tauri', 'tauri.conf.json'), '{}\n');
  writeFile(path.join(frameworkFixtureDir, 'src-tauri', 'src', 'main.rs'), 'fn main() {}\n');

  const frameworks = await detectFrameworks(frameworkFixtureDir);
  const frameworkNames = frameworks.map(item => item.name);
  [
    'ThinkPHP',
    'Symfony',
    'Go-Zero',
    'Django',
    'Flask',
    'FastAPI',
    'NestJS',
    'Express',
    'React',
    'Vue',
    'Next.js',
    'Angular',
    'Nuxt',
    'SvelteKit',
    'Electron',
    'Rails',
    'Sinatra',
    'ASP.NET Core',
    'Flutter',
    'Android',
    'iOS',
    'Phoenix',
    'Ktor',
    'Tauri',
  ].forEach(name => {
    assert(frameworkNames.includes(name), `应识别 ${name} 框架`);
  });

  const result = await analyzeProject(frameworkFixtureDir, {
    localPath: frameworkFixtureDir,
    sourceType: 'local',
    enableGitAnalysis: false,
    enableAiSummary: false,
    outputType: 'markdown',
  });
  assert(result.frameworks.length >= 20, 'expanded framework fixture should detect at least 20 frameworks');
  const ecosystems = result.profile.dependencyManifests.map(item => item.ecosystem);
  [
    'Ruby Bundler',
    '.NET NuGet',
    'Dart / Flutter pub',
    'Elixir Mix',
    'iOS CocoaPods',
  ].forEach(ecosystem => {
    assert(ecosystems.includes(ecosystem), `project profile should include ${ecosystem}`);
  });
  assert(result.profile.startCommands.some(item => item.command.includes('flutter run')), 'project profile should infer Flutter start command');
  assert(result.profile.startCommands.some(item => item.command.includes('mix phx.server')), 'project profile should infer Phoenix start command');
  assert(result.frameworks.length >= 8, '综合项目应识别多个 P1 框架');
  assert(result.modules.length > 0, '新增框架适配器应产出模块扫描结果');
}

async function main() {
  createFixtureRepository();
  bundleCoreModules();
  await verifyCoreFlow();
  await verifyGenericProjectProfile();
  await verifyAstLanguageLayer();
  await verifyFrameworkAdapters();
  await verifyRemoteBranches();
  verifyCloneTokenSafety();
}

function verifyCloneTokenSafety() {
  const cloneSource = fs.readFileSync(cloneSourcePath, 'utf8');
  assert(cloneSource.includes('http.extraHeader=Authorization'), 'clone 应通过临时 HTTP header 传递 Token');
  assert(cloneSource.includes('remote\', \'set-url\''), 'clone 后应重置 origin URL，避免持久化凭据');
  assert(cloneSource.includes('sanitizeCloneError'), 'clone 错误信息应做 Token 脱敏');
  assert(cloneSource.includes('assertCloneTargetAvailable'), 'clone 前应检查目标目录，避免覆盖非空目录');
  assert(cloneSource.includes('REMOTE_GIT_TIMEOUT_MS') && cloneSource.includes('timeout,'), '远程 Git 操作必须设置超时，避免获取分支一直 loading');
  assert(cloneSource.includes('formatGitError'), '远程 Git 操作错误应转换为可读提示');
  assert(cloneSource.includes('cloneWithRetries'), 'clone 应支持传输中断后的自动重试');
  assert(cloneSource.includes('curl 56') && cloneSource.includes('early EOF'), 'clone 应识别 Gitee/Git 传输中断类错误');
  assert(cloneSource.includes('http.version=HTTP/1.1'), 'clone 重试应支持 HTTP/1.1 兼容模式');
  assert(cloneSource.includes('--filter=blob:none'), 'clone 重试应支持省流模式，降低大仓库传输失败概率');
  assert(cloneSource.includes('removePartialClone'), 'clone 重试前应清理半成品目录');
  assert(!cloneSource.includes('${token}@'), 'clone 不应把 Token 拼接进远程 URL');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
