#!/usr/bin/env node
/**
 * 崩铁杀统一校验入口（只读；`--full` 会写安装树）。
 *
 * 用法：
 *   node scripts/verify.mjs [--fast|--full] [--changed] [--json] [--verbose]
 *   node scripts/verify.mjs --doctor
 *   node scripts/verify.mjs --no-install --no-smoke --no-trees
 *
 * 阶段：
 *   doctor  环境自检（Node / 目录 / 镜像 / 调试键 / overlay / git / 端口）
 *   syntax  node --check（fast/changed = 改动文件；默认 = source + scripts 全量）
 *   static  check.mjs 各项 + generate --check + rebuild --check + check-keys
 *   mirror  sync.mjs mirror（同步冒烟镜像）
 *   install sync.mjs install（仅 --full，可用 --no-install 关闭）
 *   smoke   _others/smoke/run-all.mjs（fast 跳过）
 *   trees   _others/smoke/diff-trees.mjs（信息型；fast 跳过）
 *
 * 报告：_others/debug/reports/verify-<时间>.json 与 verify-latest.json。
 * 任一闸门失败退出码 1；WARN 不阻断。frequent-audit 当前为信息型（WARN）。
 */
import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const WORKSPACE = resolve(ROOT, '..');
const SMOKE_DIR = join(WORKSPACE, '_others', 'smoke');
const REPORT_DIR = join(WORKSPACE, '_others', 'debug', 'reports');

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const options = {
    fast: has('--fast'),
    full: has('--full'),
    changed: has('--changed'),
    json: has('--json'),
    verbose: has('--verbose'),
    doctorOnly: has('--doctor'),
    noInstall: has('--no-install'),
    noSmoke: has('--no-smoke'),
    noTrees: has('--no-trees'),
    noMirror: has('--no-mirror'),
};
if (options.fast && options.full) {
    console.error('不能同时使用 --fast 与 --full。');
    process.exit(2);
}
if (options.doctorOnly) {
    options.noSmoke = true;
    options.noTrees = true;
    options.noInstall = true;
    options.noMirror = true;
}

const mode = options.fast ? 'fast' : options.full ? 'full' : 'default';
const emit = (...args) => {
    if (!options.json) console.log(...args);
};

const MAX_BUFFER = 20 * 1024 * 1024;

function tail(text, lines = 40) {
    const value = String(text || '').trim();
    if (!value) return '';
    return value.split(/\r?\n/).slice(-lines).join('\n');
}

function walk(dir, extensionRe, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, extensionRe, out);
        else if (entry.isFile() && extensionRe.test(entry.name)) out.push(full);
    }
    return out;
}

function git(args) {
    return spawnSync('git', args, {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 20_000,
        maxBuffer: MAX_BUFFER,
    });
}

/** 改动文件（git diff + untracked）；失败时返回 null。 */
function changedFiles() {
    const diff = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']);
    const untracked = git(['ls-files', '--others', '--exclude-standard']);
    if (diff.error || untracked.error) return null;
    if (diff.status !== 0 || untracked.status !== 0) return null;
    const files = new Set();
    for (const text of [diff.stdout, untracked.stdout]) {
        for (const line of String(text || '').split(/\r?\n/)) {
            const value = line.trim();
            if (value) files.add(value);
        }
    }
    return [...files]
        .filter((file) => /\.(?:js|mjs)$/.test(file))
        .map((file) => resolve(ROOT, file))
        .filter((file) => existsSync(file));
}

function syntaxFiles() {
    if (options.fast || options.changed) {
        const changed = changedFiles();
        if (changed === null) {
            emit('[WARN] git 不可用，改为检查 source 全量 JS');
            return walk(join(ROOT, 'source'), /\.js$/);
        }
        return changed;
    }
    const files = walk(join(ROOT, 'source'), /\.js$/);
    const extension = join(ROOT, 'extension.js');
    if (existsSync(extension)) files.push(extension);
    files.push(...walk(join(ROOT, 'scripts'), /\.(?:js|mjs)$/));
    return files;
}

function commandText(scriptPath, args) {
    const script = relative(WORKSPACE, scriptPath).replace(/\\/g, '/');
    return `node ${script}${args.length ? ' ' + args.join(' ') : ''}`;
}

function runNode(scriptPath, args, cwd, label, { advisory = false, timeout = 180_000 } = {}) {
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
        cwd,
        encoding: 'utf8',
        timeout,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    const combined = `${result.stdout || ''}${result.stderr || ''}`.trim();
    let status;
    if (result.error) status = advisory ? 'warn' : 'fail';
    else if (result.status === 0) status = 'ok';
    else status = advisory ? 'warn' : 'fail';
    const record = {
        name: label,
        label,
        status,
        exitCode: result.status,
        signal: result.signal || null,
        durationMs: Date.now() - startedAt,
        command: commandText(scriptPath, args),
        cwd: relative(WORKSPACE, cwd).replace(/\\/g, '/') || '.',
        error: result.error ? String(result.error.message || result.error) : '',
        outputTail: tail(combined),
    };
    const mark = status === 'ok' ? '[OK]' : status === 'warn' ? '[WARN]' : '[FAIL]';
    emit(`${mark} ${label}（${record.durationMs}ms）`);
    if (status !== 'ok' || options.verbose) {
        const output = record.outputTail || record.error;
        if (output) emit(output.split('\n').map((line) => `    ${line}`).join('\n'));
    }
    return record;
}

function recordSkip(label, detail) {
    emit(`[SKIP] ${label}：${detail}`);
    return {
        name: label,
        label,
        status: 'skip',
        exitCode: null,
        signal: null,
        durationMs: 0,
        command: '',
        cwd: '.',
        error: '',
        outputTail: detail,
    };
}

async function doctorStage() {
    const module = await import(pathToFileURL(join(here, 'doctor.mjs')).href);
    const result = await module.checkEnvironment({ workspace: WORKSPACE, root: ROOT });
    const fails = result.checks.filter((check) => check.status === 'fail');
    const warns = result.checks.filter((check) => check.status === 'warn');
    const status = fails.length ? 'fail' : 'ok';
    const mark = status === 'ok' ? '[OK]' : '[FAIL]';
    emit(`${mark} 环境自检（${fails.length} FAIL / ${warns.length} WARN）`);
    for (const check of result.checks) {
        if (check.status === 'ok' || check.status === 'skip') continue;
        emit(`    ${module.formatChecks({ checks: [check] })[0]}`);
    }
    return {
        name: 'doctor',
        label: '环境自检',
        status,
        exitCode: result.ok ? 0 : 1,
        signal: null,
        durationMs: 0,
        command: 'doctor.mjs',
        cwd: '.',
        error: '',
        outputTail: module.formatChecks(result).join('\n'),
        checks: result.checks,
    };
}

function syntaxStage() {
    const files = syntaxFiles();
    if (!files.length) return recordSkip('语法检查', '无待检查的 JS/MJS 文件');
    const failures = [];
    const startedAt = Date.now();
    for (const file of files) {
        const result = spawnSync(process.execPath, ['--check', file], {
            cwd: ROOT,
            encoding: 'utf8',
            timeout: 30_000,
            maxBuffer: MAX_BUFFER,
        });
        if (result.error || result.status !== 0) {
            failures.push({
                file: relative(WORKSPACE, file).replace(/\\/g, '/'),
                error: tail(`${result.stdout || ''}${result.stderr || ''}` || String(result.error || ''), 12),
            });
        }
    }
    const durationMs = Date.now() - startedAt;
    const status = failures.length ? 'fail' : 'ok';
    const mark = status === 'ok' ? '[OK]' : '[FAIL]';
    emit(`${mark} 语法检查（${files.length} 文件，${durationMs}ms）`);
    if (failures.length) {
        for (const failure of failures) emit(`    ${failure.file}\n${failure.error}`);
    }
    return {
        name: 'syntax',
        label: '语法检查',
        status,
        exitCode: failures.length ? 1 : 0,
        signal: null,
        durationMs,
        command: 'node --check <files>',
        cwd: '.',
        error: '',
        outputTail: failures.map((failure) => `${failure.file}: ${failure.error}`).join('\n'),
        files: files.length,
        failures,
    };
}

function staticStage() {
    const records = [];
    const checkScript = join(ROOT, 'scripts', 'check.mjs');
    const checks = [
        ['invisible', 'BOM/零宽/控制字符', ['--invisible']],
        ['globals', '包级标识符引用', ['--globals']],
        ['logskill', 'logSkill/cost 约定', ['--logskill']],
        ['choosetarget', 'active 选目标时机', ['--choosetarget']],
        ['skill-embed', '技能效果自注册', ['--skill-embed']],
        ['skins', '头像孤儿/缺失', ['--skins']],
        ['marks', '标记键全覆盖', ['--marks']],
        ['pitfalls', '历史坑位审计', ['--pitfalls', '--strict']],
        ['privacy', '公开仓库隐私', ['--privacy']],
    ];
    for (const [, label, args] of checks) {
        records.push(runNode(checkScript, args, ROOT, `check ${args[0]}（${label}）`));
    }

    const generateScript = join(ROOT, 'scripts', 'generate.mjs');
    records.push(runNode(generateScript, ['--check'], ROOT, 'generate --check（派生表）'));

    const rebuildScript = join(ROOT, 'scripts', 'rebuild.mjs');
    records.push(runNode(rebuildScript, ['--check'], ROOT, 'rebuild --check（索引/清单）'));

    const keysScript = join(WORKSPACE, '_others', 'debug', 'check-keys.mjs');
    if (existsSync(keysScript)) {
        records.push(runNode(keysScript, ['--json'], WORKSPACE, 'check-keys（调试键规范）'));
    } else {
        records.push(recordSkip('check-keys（调试键规范）', '脚本不存在'));
    }

    const docsAudit = join(ROOT, 'scripts', 'docs-audit.mjs');
    if (existsSync(docsAudit)) {
        records.push(runNode(docsAudit, ['--strict'], ROOT, 'docs-audit（文档引用）'));
    } else {
        records.push(recordSkip('docs-audit（文档引用）', '脚本不存在'));
    }

    const frequentScript = join(WORKSPACE, '_others', 'debug', 'frequent-audit.mjs');
    if (existsSync(frequentScript)) {
        records.push(
            runNode(frequentScript, ['--json'], WORKSPACE, 'frequent-audit（信息型）', {
                advisory: true,
                timeout: 120_000,
            }),
        );
    } else {
        records.push(recordSkip('frequent-audit（信息型）', '脚本不存在'));
    }

    return records;
}

function mirrorStage() {
    if (options.noMirror) return recordSkip('同步冒烟镜像', '--no-mirror');
    const syncScript = join(ROOT, 'scripts', 'sync.mjs');
    if (!existsSync(syncScript)) return recordSkip('同步冒烟镜像', 'sync.mjs 不存在');
    return runNode(syncScript, ['mirror'], ROOT, '同步冒烟镜像');
}

function installStage() {
    if (!options.full || options.noInstall) {
        return recordSkip('同步安装树', options.full ? '--no-install' : '仅 --full 执行');
    }
    const syncScript = join(ROOT, 'scripts', 'sync.mjs');
    if (!existsSync(syncScript)) return recordSkip('同步安装树', 'sync.mjs 不存在');
    return runNode(syncScript, ['install'], ROOT, '同步安装树');
}

function smokeStage() {
    if (options.fast) return recordSkip('冒烟套件', '--fast');
    if (options.noSmoke) return recordSkip('冒烟套件', '--no-smoke');
    const runAll = join(SMOKE_DIR, 'run-all.mjs');
    if (!existsSync(runAll)) return recordSkip('冒烟套件', 'run-all.mjs 不存在');
    return runNode(runAll, [], SMOKE_DIR, '冒烟套件', { timeout: 240_000 });
}

function treesStage() {
    if (options.fast) return recordSkip('三树差异（信息型）', '--fast');
    if (options.noTrees) return recordSkip('三树差异（信息型）', '--no-trees');
    const diffTrees = join(SMOKE_DIR, 'diff-trees.mjs');
    if (!existsSync(diffTrees)) return recordSkip('三树差异（信息型）', 'diff-trees.mjs 不存在');
    return runNode(diffTrees, [], SMOKE_DIR, '三树差异（信息型）', {
        advisory: true,
        timeout: 120_000,
    });
}

const startedAt = new Date().toISOString();
const startedMs = Date.now();
const records = [];

records.push(await doctorStage());
if (!options.doctorOnly) {
    records.push(syntaxStage());
    records.push(...staticStage());
    records.push(mirrorStage());
    records.push(installStage());
    records.push(smokeStage());
    records.push(treesStage());
}

const failed = records.filter((record) => record.status === 'fail');
const warned = records.filter((record) => record.status === 'warn');
const report = {
    tool: 'bts-verify',
    version: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    mode,
    cwd: WORKSPACE,
    options,
    ok: failed.length === 0,
    summary: {
        total: records.length,
        ok: records.filter((record) => record.status === 'ok').length,
        warn: warned.length,
        fail: failed.length,
        skip: records.filter((record) => record.status === 'skip').length,
    },
    results: records,
};

mkdirSync(REPORT_DIR, { recursive: true });
const stamp = startedAt.replace(/[:.]/g, '-');
const reportFile = join(REPORT_DIR, `verify-${stamp}.json`);
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(join(REPORT_DIR, 'verify-latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (options.json) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log('\n== 校验汇总 ==');
    for (const record of records) {
        const mark =
            record.status === 'ok'
                ? '[OK]'
                : record.status === 'warn'
                  ? '[WARN]'
                  : record.status === 'skip'
                    ? '[SKIP]'
                    : '[FAIL]';
        console.log(`${mark} ${record.label}（${record.durationMs}ms）`);
    }
    console.log(
        report.ok
            ? `\n校验通过：${report.summary.ok} OK / ${report.summary.warn} WARN / ${report.summary.skip} SKIP ✓`
            : `\n校验失败：${report.summary.fail} 项未通过 ✗`,
    );
    console.log(`报告：${relative(WORKSPACE, reportFile).replace(/\\/g, '/')}`);
}

if (!report.ok) process.exitCode = 1;
