#!/usr/bin/env node
/**
 * 崩铁杀环境自检（只读）。
 *
 * 用法：
 *   node scripts/doctor.mjs [--json]
 *
 * 检查项：Node 版本、zip 项目根、Directory.json、冒烟镜像、调试键登记表、
 * 本机 dev-config.local.json 的 installed 目录、overlay 残留、git 脏文件、
 * 8931/8932 端口、pack 路径配置。输出 PASS/WARN/FAIL；FAIL 时退出码 1。
 *
 * 供 `verify.mjs` 直接 import 调用，也可单独运行。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const DEFAULT_WORKSPACE = resolve(ROOT, '..');

const STATUS_ORDER = { fail: 0, warn: 1, ok: 2, skip: 3 };
const STATUS_LABEL = { fail: '[FAIL]', warn: '[WARN]', ok: '[OK]', skip: '[SKIP]' };

/** 递归统计目录内文件数（不跟随符号链接）。 */
function countFiles(directory) {
    let count = 0;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) count += countFiles(full);
        else if (entry.isFile()) count++;
    }
    return count;
}

/** 端口是否可连接（300ms 超时）。 */
function portOpen(port, timeout = 300) {
    return new Promise((done) => {
        const socket = net.createConnection({ host: '127.0.0.1', port });
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            done(value);
        };
        socket.setTimeout(timeout);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
    });
}

function readJson(file) {
    return JSON.parse(readFileSync(file, 'utf8'));
}

/** 收集环境检查结果；不打印、不退出。 */
export async function checkEnvironment({
    workspace = DEFAULT_WORKSPACE,
    root = ROOT,
} = {}) {
    const checks = [];
    const add = (id, label, status, detail = '') => checks.push({ id, label, status, detail });

    const nodeMajor = Number(process.versions.node.split('.')[0]);
    add(
        'node',
        'Node.js 版本',
        nodeMajor >= 18 ? 'ok' : 'fail',
        `v${process.versions.node}（要求 >=18）`,
    );

    const packageFile = join(root, 'package.json');
    add(
        'zip-root',
        'zip 项目根',
        existsSync(packageFile) ? 'ok' : 'fail',
        existsSync(packageFile) ? root : `缺少 ${packageFile}`,
    );

    const directoryFile = join(root, 'Directory.json');
    add(
        'directory',
        'Directory.json',
        existsSync(directoryFile) ? 'ok' : 'fail',
        existsSync(directoryFile) ? '存在' : '缺少（先运行 node scripts/rebuild.mjs --write）',
    );

    const smokeSource = join(
        workspace,
        '_others',
        'smoke',
        'app',
        'extension',
        '崩铁杀',
        'source',
    );
    add(
        'smoke-app',
        '冒烟镜像',
        existsSync(smokeSource) ? 'ok' : 'fail',
        existsSync(smokeSource) ? '存在' : '缺少（先运行 node scripts/sync.mjs mirror）',
    );

    const keysFile = join(workspace, '_others', 'debug', 'bts-keys.json');
    if (!existsSync(keysFile)) {
        add('bts-keys', '调试键登记表', 'warn', '不存在（调试栈未初始化）');
    } else {
        try {
            const table = readJson(keysFile);
            const tokens = table.tokens && typeof table.tokens === 'object' ? table.tokens : {};
            add('bts-keys', '调试键登记表', 'ok', `${Object.keys(tokens).length} 条`);
        } catch (error) {
            add('bts-keys', '调试键登记表', 'fail', `不可解析：${error.message}`);
        }
    }

    const localConfigFile = join(root, 'scripts', 'lib', 'dev-config.local.json');
    let localConfig = null;
    if (!existsSync(localConfigFile)) {
        add(
            'dev-config',
            '本机同步配置',
            'warn',
            '缺失（按 dev-config.local.example.json 创建；不影响静态校验）',
        );
    } else {
        try {
            localConfig = readJson(localConfigFile);
            const installed = Array.isArray(localConfig.installed) ? localConfig.installed : [];
            if (!installed.length) {
                add('dev-config', '本机同步配置', 'warn', 'installed 为空（不会同步安装树）');
            } else {
                const missing = installed.filter((path) => !existsSync(path));
                add(
                    'dev-config',
                    '本机同步配置',
                    missing.length ? 'warn' : 'ok',
                    missing.length
                        ? `installed 缺失 ${missing.length} 个：${missing.join('；')}`
                        : `${installed.length} 个安装目录均存在`,
                );
            }
        } catch (error) {
            add('dev-config', '本机同步配置', 'fail', `不可解析：${error.message}`);
        }
    }

    const overlayDir = join(workspace, '_others', '_tmp_overlay');
    if (!existsSync(overlayDir)) {
        add('overlay', '调试覆盖层', 'ok', '不存在（无残留）');
    } else {
        try {
            const count = countFiles(overlayDir);
            add(
                'overlay',
                '调试覆盖层',
                count ? 'warn' : 'ok',
                count ? `残留 ${count} 个文件（overlay 优先于安装树）` : '空',
            );
        } catch (error) {
            add('overlay', '调试覆盖层', 'warn', `无法统计：${error.message}`);
        }
    }

    const git = spawnSync('git', ['-C', root, 'status', '--porcelain'], {
        encoding: 'utf8',
        timeout: 15_000,
    });
    if (git.error || git.status !== 0) {
        add('git', 'git 工作区', 'skip', 'git 不可用或不是仓库');
    } else {
        const dirty = (git.stdout || '').split(/\r?\n/).filter(Boolean).length;
        add(
            'git',
            'git 工作区',
            dirty ? 'warn' : 'ok',
            dirty ? `${dirty} 个未提交改动（确认是否为本轮预期）` : '干净',
        );
    }

    for (const port of [8931, 8932]) {
        const open = await portOpen(port);
        add(
            `port-${port}`,
            `调试端口 ${port}`,
            'ok',
            open ? '运行中' : '未监听',
        );
    }

    if (localConfig && localConfig.pack && typeof localConfig.pack === 'object') {
        const wanted = {
            nonameBuild: '构建树',
            desktopApp: '桌面树',
            baseDir: '电脑基座目录',
            keystoreProps: 'APK 签名配置',
        };
        const missing = [];
        for (const [key, label] of Object.entries(wanted)) {
            const value = localConfig.pack[key];
            if (!value) continue;
            if (!existsSync(value)) missing.push(`${label}（${key}）`);
        }
        add(
            'pack-paths',
            '打包路径配置',
            missing.length ? 'warn' : 'ok',
            missing.length ? `缺失：${missing.join('；')}` : '存在',
        );
    } else {
        add('pack-paths', '打包路径配置', 'warn', '未配置（打包/移动端任务前需补）');
    }

    checks.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    return {
        ok: !checks.some((check) => check.status === 'fail'),
        checks,
    };
}

/** 人读格式：一行一项。 */
export function formatChecks(result) {
    return result.checks.map((check) => {
        const label = STATUS_LABEL[check.status] || '[?]';
        return `${label} ${check.label}${check.detail ? `：${check.detail}` : ''}`;
    });
}

async function main() {
    const json = process.argv.includes('--json');
    const result = await checkEnvironment();
    if (json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log('== 崩铁杀环境自检 ==');
        for (const line of formatChecks(result)) console.log(line);
        console.log(
            result.ok
                ? '环境自检通过（WARN 不阻断）'
                : '环境自检失败：先修复 FAIL 项再继续',
        );
    }
    if (!result.ok) process.exitCode = 1;
}

const invoked = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invoked) main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
