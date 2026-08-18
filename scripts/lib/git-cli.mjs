/**
 * 崩铁杀 清理类 CLI 脚本共享工具
 *
 * 提供 git 命令执行、交互输入（队列式 readline）、临时工作树清理、origin 仓库 slug 解析。
 * 供 scripts/purge.mjs 复用。
 *
 * 交互输入注意：
 *   readline 的 question() 在管道一次性灌入多行时，会在同一个 data 事件里同步 emit 所有行，
 *   async/await 的微任务间隙会丢掉后续行。因此这里用 on('line') 持续入队，由 ask() 按需消费，
 *   对真实终端与管道/脚本化输入都稳定。
 */

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, rmSync } from 'node:fs';

/** 执行命令并返回 {status, stdout, stderr}；allowFail 时不因失败抛错 */
export function run(cmd, args, { allowFail = false, cwd } = {}) {
    const result = spawnSync(cmd, args, {
        encoding: 'utf-8',
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = {
        status: result.status,
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
    };
    if (!allowFail && result.status !== 0) {
        throw new Error(
            `命令执行失败: ${cmd} ${args.join(' ')}\n` +
                (output.stderr || output.stdout || '（无输出）'),
        );
    }
    return output;
}

/** 执行一条 git 命令（失败抛错，或返回 allowFail 结果） */
export function git(args, opts) {
    return run('git', args, opts);
}

/** 当前分支名 */
export function currentBranch() {
    return git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
}

/**
 * 远端分支是否真实存在（ls-remote 直查，不依赖可能过期的跟踪引用）。
 * @param {string} branch 分支名（不带 refs/heads/ 前缀）
 * @returns {boolean|null} true=存在 / false=确认不存在 / null=查询失败（网络波动等，无法确认）
 */
export function remoteBranchExists(branch) {
    const res = run(
        'git',
        ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`],
        { allowFail: true },
    );
    if (res.status !== 0) return null;
    return res.stdout.trim().length > 0;
}

let _rl = null;
let _inputQueue = [];
const _inputWaiters = [];

function _ensureRl() {
    if (_rl) return;
    _rl = createInterface({ input: process.stdin, output: process.stdout });
    _rl.on('line', (line) => {
        const waiter = _inputWaiters.shift();
        const value = line.trim();
        if (waiter) waiter(value);
        else _inputQueue.push(value);
    });
}

/** 行输入（通用），返回去掉首尾空白的答案 */
export function ask(promptText) {
    _ensureRl();
    process.stdout.write(promptText);
    return new Promise((done) => {
        const pending = _inputQueue.shift();
        if (pending !== undefined) done(pending);
        else _inputWaiters.push(done);
    });
}

/** 不可逆确认；非 TTY 且未传 --yes 时按拒绝处理 */
export function confirm(promptText) {
    return ask(`\x1b[31m${promptText}\x1b[0m (y/N) `).then((answer) =>
        /^y(es)?$/i.test(answer),
    );
}

/** 关闭交互输入（流程结束后调用，避免进程挂起） */
export function closePrompts() {
    if (_rl) {
        _rl.close();
        _rl = null;
    }
    _inputQueue.length = 0;
    _inputWaiters.splice(0).forEach((w) => w(''));
}

/** 清理残留的临时工作树：先 git 移除，失败则直接删除目录 + prune */
export function cleanupWorktree(target) {
    run('git', ['worktree', 'prune'], { allowFail: true });
    const list = run('git', ['worktree', 'list', '--porcelain'], {
        allowFail: true,
    });
    if (list.status === 0 && list.stdout.includes(target)) {
        const res = run('git', ['worktree', 'remove', '--force', target], {
            allowFail: true,
        });
        if (res.status !== 0)
            run('git', ['worktree', 'prune'], { allowFail: true });
    }
    if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
        run('git', ['worktree', 'prune'], { allowFail: true });
    }
}

/** 从 origin 的 fetch URL 解析 owner/repo，供 gh 使用；失败返回 null */
export function getRepoSlug() {
    const out = run('git', ['remote', 'get-url', 'origin'], {
        allowFail: true,
    });
    if (out.status !== 0) return null;
    const m = (out.stdout || '').match(
        /(?:github\.com|gitee\.com)[:/]([^/]+)\/([^/]+?)(?:\.git)?$/,
    );
    return m ? `${m[1]}/${m[2]}` : null;
}
