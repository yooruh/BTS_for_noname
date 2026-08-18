#!/usr/bin/env node

/**
 * 崩铁杀 远程清理脚本：清除 zips 分支 / 删除某个 zip 版本 / 删除某个 v{版本} 分支。
 *
 * 合并自原 purge-zips.mjs + purge-version-branch.mjs：
 *  - purgeAll      整体清除 zips 分支（本地 + GitHub/Gitee 远端，连同发布标签与提交物理抹除）
 *  - purgeZipVer   删除某个 zip 版本：移除 zips 分支上代码包 + 删除其 GitHub Release 与标签
 *  - purgeBranch   删除某个 v{版本} 分支（本地 + 远端），并顺带清理该版本的代码包/Release
 *  - listBranches  仅列出 v{版本} 分支（只读）
 *
 * 无参数时进入交互菜单选择清理方式；有参数时按参数直接执行。
 *
 * 用法:
 *   node scripts/purge.mjs                   交互菜单（整体清除 / 删 zip 版本 / 删版本分支 / 列分支）
 *   node scripts/purge.mjs --all             直接整体清除 zips 分支（跳过询问）
 *   node scripts/purge.mjs --version <版本号> 直接删除指定 zip 版本及其 Release
 *   node scripts/purge.mjs --branch <版本号>  直接删除指定 v{版本} 分支（并清理其代码包/Release）
 *   node scripts/purge.mjs <版本号>           同上（--branch 简写）
 *   node scripts/purge.mjs --list            仅列出可用的版本分支，不删除
 *   通用选项:
 *     --dry-run / -d  仅预览将执行的操作，不写入
 *     --local         仅处理本地（不推送远端删除、不删远端 Release）
 *     --yes           跳过不可逆确认（供脚本/CI 调用）
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, stripV, withV, isValidVersion, releaseTag } from './lib/shared.mjs';
import {
    run,
    git,
    currentBranch,
    cleanupWorktree,
    getRepoSlug,
    remoteBranchExists,
} from './lib/git-cli.mjs';
import { menu, prompt, closeInteractive } from './lib/interactive.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SELF_PATH = fileURLToPath(import.meta.url);

const ZIP_BRANCH = 'zips';
const MAIN_BRANCH = 'main';
// 按版本删除时使用的临时工作树（整体清除直接删引用，用不到）
const VERSION_WORKTREE = resolve(ROOT, '..', '.zips-purge-worktree');
// v{版本} 分支名（如 v26.8.7.0）
const BRANCH_RE = /^v\d+\.\d+\.\d+(?:\.\d+)?$/;

// ── 通用辅助 ────────────────────────────────────────────────────────────────
/** 数值分段比较版本号（ascending） */
function compareVersion(a, b) {
    const pa = stripV(a).split('.').map(Number);
    const pb = stripV(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}

/** 版本号是否为当前发布版本（release/releases.json 最新）；删除其代码包/Release 会使在线更新不可用 */
function isCurrentReleaseVersion(version) {
    try {
        const manifest = JSON.parse(
            readFileSync(resolve(ROOT, 'release', 'releases.json'), 'utf-8'),
        );
        const latest = manifest?.releases?.[0];
        return !!latest && stripV(latest.version) === stripV(version);
    } catch {
        return false;
    }
}

/** 不可逆确认（非 TTY 且未配 --yes 时按拒绝处理；经 interactive 单一流输入） */
async function confirmDestructive(promptText, { skipConfirm }) {
    if (skipConfirm) return true;
    const answer = await prompt(`\x1b[31m${promptText}\x1b[0m (y/N) `);
    return /^y(es)?$/i.test(answer);
}

// ── zips 分支清理（吸收 purge-zips.mjs）────────────────────────────────────
function hasZipsBranch() {
    return (
        git(['rev-parse', '--verify', '-q', `refs/heads/${ZIP_BRANCH}`], {
            allowFail: true,
        }).status === 0
    );
}

function hasOriginZips() {
    return (
        git(
            [
                'rev-parse',
                '--verify',
                '-q',
                `refs/remotes/origin/${ZIP_BRANCH}`,
            ],
            { allowFail: true },
        ).status === 0
    );
}

/** 远端 zips 分支是否真实存在（ls-remote 直查）；失败返回 null */
function remoteZipsExistsLive() {
    const res = run(
        'git',
        ['ls-remote', '--heads', 'origin', `refs/heads/${ZIP_BRANCH}`],
        { allowFail: true },
    );
    if (res.status !== 0) return null;
    return res.stdout.trim().length > 0;
}

/** 收集「仅挂在 zips 上」的标签 */
function zipsOnlyTags(ref = ZIP_BRANCH) {
    const fromZips = git(['tag', '--merged', ref], { allowFail: true })
        .stdout.split('\n')
        .filter(Boolean);
    const fromMain = new Set(
        git(['tag', '--merged', MAIN_BRANCH])
            .stdout.split('\n')
            .filter(Boolean),
    );
    return fromZips.filter((t) => !fromMain.has(t));
}

/** 打印并执行一条 git 操作；execute=false 时仅预览 */
function act(label, cmdArgs, { execute = true, allowFail = false } = {}) {
    const shown = `$ git ${cmdArgs.join(' ')}`;
    log.info(execute ? `${label}: ${shown}` : `[DRY-RUN] ${label}: ${shown}`);
    if (!execute) return null;
    const result = git(cmdArgs, { allowFail });
    if (allowFail && result.status !== 0) {
        log.warn(`  跳过（${result.stderr || result.stdout || '失败'}）`);
        return null;
    }
    return result;
}

/** 列出 zips 分支 release/code/ 下的代码包文件名 */
function listZipFilenames() {
    run('git', ['fetch', 'origin', ZIP_BRANCH], { allowFail: true });
    let ref = null;
    if (hasOriginZips()) ref = `origin/${ZIP_BRANCH}`;
    else if (hasZipsBranch()) ref = ZIP_BRANCH;
    if (!ref) return [];
    const out = git(
        ['ls-tree', '-r', '--name-only', ref, '--', 'release/code'],
        { allowFail: true },
    );
    if (out.status !== 0) return [];
    return out.stdout
        .split('\n')
        .filter(Boolean)
        .map((p) => p.replace(/^release\/code\//, ''))
        .filter((name) => name.length > 0);
}

/** 从代码包文件名解析版本号（如 26.8.7.0-code.zip → 26.8.7.0） */
function versionFromFilename(name) {
    const m = String(name).match(/^(\d+\.\d+\.\d+(?:\.\d+)?)/);
    return m ? m[1] : null;
}

/** 取指定版本在 zips 分支上的全部文件 */
function resolveVersionFiles(version) {
    const v = stripV(version);
    return listZipFilenames().filter((name) => versionFromFilename(name) === v);
}

/** 收集 zips 分支上 版本号 → [文件名] 的映射 */
function collectZipVersions() {
    const map = new Map();
    for (const name of listZipFilenames()) {
        const v = versionFromFilename(name);
        if (!v) continue;
        if (!map.has(v)) map.set(v, []);
        map.get(v).push(name);
    }
    return map;
}

/** 整体清除 zips 分支（本地 + GitHub/Gitee 远端，物理抹除） */
async function purgeAll({ dryRun, localOnly, skipConfirm }) {
    const hasLocal = hasZipsBranch();
    const remoteLive = remoteZipsExistsLive();
    const remoteConfirmedAbsent = remoteLive === false && !hasOriginZips();

    if (!hasLocal && remoteConfirmedAbsent) {
        log.warn(`${ZIP_BRANCH} 分支不存在（本地与远端均无），无需清除`);
        return;
    }
    if (!hasLocal) {
        log.info(
            `${ZIP_BRANCH} 本地分支不存在，将清理远端残留（GitHub + Gitee）`,
        );
    }

    const tagRef = hasLocal
        ? ZIP_BRANCH
        : hasOriginZips()
          ? `origin/${ZIP_BRANCH}`
          : null;

    if (hasLocal && currentBranch() === ZIP_BRANCH) {
        log.info(
            `当前在 ${ZIP_BRANCH} 上，先切换到 ${MAIN_BRANCH}（若失败请先处理工作区改动）`,
        );
        act('切换到 main', ['switch', MAIN_BRANCH], { execute: !dryRun });
    }

    const tags = tagRef ? zipsOnlyTags(tagRef) : [];
    if (tags.length > 0) {
        log.info(
            `发现 ${tags.length} 个仅挂在 ${ZIP_BRANCH} 上的标签: ${tags.join(', ')}`,
        );
    } else {
        log.info(`未发现仅挂在 ${ZIP_BRANCH} 上的标签`);
    }

    const scope = localOnly
        ? '本地'
        : hasLocal
          ? '本地 + GitHub/Gitee 远端'
          : 'GitHub/Gitee 远端（本地分支已不存在）';
    if (!dryRun && !skipConfirm) {
        const ok = await confirmDestructive(
            `确认彻底清除 ${ZIP_BRANCH} 及其提交（${scope}）？此操作不可逆`,
            { skipConfirm },
        );
        if (!ok) {
            log.warn('已取消，未执行任何删除');
            return;
        }
    }

    if (!localOnly && (remoteLive === true || remoteLive === null)) {
        for (const t of tags) {
            act(
                `删除远端标签 ${t}（GitHub + Gitee）`,
                ['push', 'origin', '--delete', `refs/tags/${t}`],
                { execute: !dryRun, allowFail: true },
            );
        }
        act(
            `删除远端分支 ${ZIP_BRANCH}`,
            ['push', 'origin', '--delete', `refs/heads/${ZIP_BRANCH}`],
            { execute: !dryRun, allowFail: true },
        );
    } else if (!localOnly && remoteLive === false && hasOriginZips()) {
        log.info(`远端已无 ${ZIP_BRANCH} 分支，仅清理本地残留跟踪引用`);
    }

    if (tags.length > 0) {
        act('删除本地标签', ['tag', '-d', ...tags], { execute: !dryRun });
    }
    if (hasLocal) {
        act(`删除本地分支 ${ZIP_BRANCH}`, ['branch', '-D', ZIP_BRANCH], {
            execute: !dryRun,
        });
    }
    if (hasOriginZips()) {
        act(
            `删除远端跟踪引用 origin/${ZIP_BRANCH}`,
            ['branch', '-rd', `origin/${ZIP_BRANCH}`],
            { execute: !dryRun, allowFail: true },
        );
    }

    act('过期全部 reflog', ['reflog', 'expire', '--expire=now', '--all'], {
        execute: !dryRun,
    });
    act('强制 GC 清理不可达对象', ['gc', '--prune=now'], { execute: !dryRun });

    if (dryRun) {
        console.log('\n\x1b[33m（预览模式，未写入任何文件）\x1b[0m');
        return;
    }
    log.ok(`${ZIP_BRANCH} 已彻底清除（${scope}），不可达提交已物理抹除`);
}

/** 从 zips 分支移除指定版本的代码包文件（工作树 rm + commit + push） */
function removeVersionFiles(version, filenames, { dryRun, localOnly }) {
    const files = filenames.map((f) => `release/code/${f}`);
    log.info('将移除 zips 分支文件:');
    files.forEach((f) => log.info(`  ${f}`));

    if (dryRun) {
        const startPoint = hasOriginZips()
            ? `origin/${ZIP_BRANCH}`
            : ZIP_BRANCH;
        log.info(
            `[DRY-RUN] git worktree add -B ${ZIP_BRANCH} <worktree> ${startPoint}`,
        );
        log.info(`[DRY-RUN] git rm ${files.join(' ')}`);
        log.info(`[DRY-RUN] git commit -m "移除 v${version} 代码包"`);
        if (!localOnly)
            log.info(
                `[DRY-RUN] git push origin ${ZIP_BRANCH}（GitHub + Gitee）`,
            );
        return;
    }

    try {
        const startPoint = hasOriginZips()
            ? `origin/${ZIP_BRANCH}`
            : ZIP_BRANCH;
        run('git', [
            'worktree',
            'add',
            '-B',
            ZIP_BRANCH,
            VERSION_WORKTREE,
            startPoint,
        ]);
        run('git', ['rm', '-q', ...files], { cwd: VERSION_WORKTREE });
        run('git', ['commit', '-m', `移除 v${version} 代码包`], {
            cwd: VERSION_WORKTREE,
        });
        log.ok(`已从本地 zips 分支移除 v${version} 代码包`);
        if (!localOnly) {
            const res = run('git', ['push', 'origin', ZIP_BRANCH], {
                allowFail: true,
            });
            if (res.status === 0) log.ok(`已推送 zips 分支（GitHub + Gitee）`);
            else
                log.warn(
                    `推送 zips 分支失败: ${res.stderr || res.stdout || '未知原因'}`,
                );
        }
    } finally {
        cleanupWorktree(VERSION_WORKTREE);
    }
}

/** 删除指定版本的 GitHub Release（先探存在，兼容旧式 v{版本} 标签） */
function deleteGitHubRelease(version) {
    const repo = getRepoSlug();
    if (!repo) {
        log.warn('无法从 origin 解析 owner/repo，跳过 GitHub Release 删除');
        return;
    }
    const candidates = [releaseTag(version), withV(version)];
    for (const tag of candidates) {
        const view = run('gh', ['release', 'view', tag, '--repo', repo], {
            allowFail: true,
        });
        if (view.status !== 0) continue;
        const res = run(
            'gh',
            ['release', 'delete', tag, '--repo', repo, '--yes'],
            { allowFail: true },
        );
        if (res.status === 0) log.ok(`已删除 GitHub Release ${tag}`);
        else
            log.warn(
                `GitHub Release ${tag} 删除失败: ${res.stderr || res.stdout || '未知原因'}`,
            );
    }
}

/** 删除指定版本的发布标签（本地 + 远端 origin） */
function deleteReleaseTag(version, { dryRun, localOnly }) {
    const tags = [releaseTag(version)];
    if (
        git(['rev-parse', '--verify', '-q', `refs/tags/${withV(version)}`], {
            allowFail: true,
        }).status === 0
    ) {
        tags.push(withV(version));
    }

    for (const t of tags) {
        if (dryRun) {
            log.info(
                `[DRY-RUN] 删除标签 ${t}（本地${localOnly ? '' : ' + GitHub/Gitee 远端'}）`,
            );
            continue;
        }
        run('git', ['tag', '-d', t], { allowFail: true });
        if (!localOnly) {
            const res = run(
                'git',
                ['push', 'origin', '--delete', `refs/tags/${t}`],
                { allowFail: true },
            );
            if (res.status === 0) log.ok(`已删除远端标签 ${t}`);
            else
                log.warn(
                    `远端标签 ${t} 删除失败（可能不存在）: ${res.stderr || res.stdout || ''}`,
                );
        }
    }
}

/** 删除某个 zip 版本：移除代码包文件 + 删除其 GitHub Release 与标签 */
async function purgeZipVer(version, { dryRun, localOnly, skipConfirm }) {
    const filenames = resolveVersionFiles(version);
    if (filenames.length === 0) {
        log.warn(
            `zips 分支上未找到版本 ${version} 的代码包（可能已被清理或从未发布）`,
        );
    }

    if (isCurrentReleaseVersion(version)) {
        log.warn(
            `⚠️ ${version} 是当前发布版本（release/releases.json），删除后在线更新将不可用，请谨慎！`,
        );
    }

    log.info(`目标版本: ${version}`);
    if (filenames.length > 0) {
        log.info('zips 分支代码包文件:');
        filenames.forEach((f) => log.info(`  release/code/${f}`));
    }
    log.info(
        `Release 与标签: ${releaseTag(version)}${localOnly ? '（仅本地）' : '（含远端）'}`,
    );

    if (dryRun) {
        if (filenames.length > 0)
            removeVersionFiles(version, filenames, { dryRun: true, localOnly });
        if (!localOnly) {
            const repo = getRepoSlug() || 'owner/repo';
            log.info(
                `[DRY-RUN] gh release delete ${releaseTag(version)} --repo ${repo} --yes`,
            );
        }
        deleteReleaseTag(version, { dryRun: true, localOnly });
        console.log('\n\x1b[33m（预览模式，未执行任何写操作）\x1b[0m');
        return;
    }

    if (!skipConfirm) {
        const ok = await confirmDestructive(
            `确认删除版本 ${version} 的代码包${localOnly ? '（仅本地）' : '及 GitHub Release（本地 + 远端）'}？此操作不可逆`,
            { skipConfirm },
        );
        if (!ok) {
            log.warn('已取消，未执行任何删除');
            return;
        }
    }

    if (filenames.length > 0) {
        removeVersionFiles(version, filenames, { dryRun, localOnly });
    }
    if (!localOnly) {
        deleteGitHubRelease(version);
    }
    deleteReleaseTag(version, { dryRun, localOnly });
    log.ok(`版本 ${version} 清理完成`);
}

// ── 版本分支清理（吸收 purge-version-branch.mjs）───────────────────────────
/** 收集本地 + 远端(origin) 的 v{版本} 分支名（新版本在前） */
function listVersionBranches() {
    const set = new Set();
    const collect = (refPrefix, stripOrigin) => {
        const out = run(
            'git',
            ['for-each-ref', '--format=%(refname:short)', refPrefix],
            { allowFail: true },
        );
        if (out.status !== 0) return;
        for (const name of out.stdout.split('\n').filter(Boolean)) {
            const short = stripOrigin ? name.replace(/^origin\//, '') : name;
            if (BRANCH_RE.test(short)) set.add(short);
        }
    };
    collect('refs/heads/', false);
    collect('refs/remotes/origin/', true);
    return [...set].sort(compareVersion).reverse();
}

/** 分支的本地/远端存在情况描述 */
function describeBranch(branch) {
    const local =
        git(['rev-parse', '--verify', '-q', `refs/heads/${branch}`], {
            allowFail: true,
        }).status === 0;
    const remote =
        git(['rev-parse', '--verify', '-q', `refs/remotes/origin/${branch}`], {
            allowFail: true,
        }).status === 0;
    if (local && remote) return `${branch}（本地 + 远端）`;
    if (local) return `${branch}（仅本地）`;
    return `${branch}（仅远端）`;
}

/** 检查 GitHub 分支保护；返回 { protected, checkable, allowDeletions } */
function branchProtection(branch) {
    const repo = getRepoSlug();
    if (!repo) return { protected: false, checkable: false };
    if (run('gh', ['--version'], { allowFail: true }).status !== 0)
        return { protected: false, checkable: false };
    const res = run(
        'gh',
        ['api', `repos/${repo}/branches/${encodeURIComponent(branch)}/protection`],
        { allowFail: true },
    );
    if (res.status !== 0) return { protected: false, checkable: true };
    let data = null;
    try {
        data = JSON.parse(res.stdout);
    } catch {
        /* 解析失败按受保护处理 */
    }
    return {
        protected: true,
        checkable: true,
        allowDeletions: !!data?.allow_deletions?.enabled,
    };
}

/** 删除版本分支（本地 + 远端 + 远端跟踪引用）；返回是否实际删除了某个引用 */
function deleteVersionBranch(branch, { dryRun, localOnly }) {
    const hasLocal =
        git(['rev-parse', '--verify', '-q', `refs/heads/${branch}`], {
            allowFail: true,
        }).status === 0;
    const hasRemoteTrack =
        git(['rev-parse', '--verify', '-q', `refs/remotes/origin/${branch}`], {
            allowFail: true,
        }).status === 0;
    const remoteLive = remoteBranchExists(branch);
    const remoteNeedsDelete =
        !localOnly && (remoteLive === true || remoteLive === null);

    if (dryRun) {
        if (hasLocal) log.info(`[DRY-RUN] git branch -D ${branch}`);
        if (hasRemoteTrack) log.info(`[DRY-RUN] git branch -rd origin/${branch}`);
        if (remoteNeedsDelete) {
            log.info(
                `[DRY-RUN] git push origin --delete refs/heads/${branch}（GitHub + Gitee）${remoteLive === null ? '；远端存在性未知，将尝试删除' : ''}`,
            );
        }
        return hasLocal || remoteLive === true;
    }

    let removedAny = false;

    if (hasLocal) {
        if (currentBranch() === branch) {
            log.warn(`当前就在 ${branch} 上，先切换到 ${MAIN_BRANCH}`);
            run('git', ['switch', MAIN_BRANCH]);
        }
        const res = run('git', ['branch', '-D', branch], { allowFail: true });
        if (res.status === 0) {
            log.ok(`已删除本地分支 ${branch}`);
            removedAny = true;
        } else {
            log.warn(`本地分支删除失败: ${res.stderr || res.stdout || ''}`);
        }
    } else {
        log.info(`本地无分支 ${branch}`);
    }

    if (!localOnly) {
        if (remoteNeedsDelete) {
            const res = run(
                'git',
                ['push', 'origin', '--delete', `refs/heads/${branch}`],
                { allowFail: true },
            );
            if (res.status === 0) {
                log.ok(`已删除远端分支 ${branch}（GitHub + Gitee）`);
                removedAny = true;
            } else {
                log.warn(
                    `远端分支删除失败（可能受保护/只读、远端已不存在，或网络异常）: ${res.stderr || res.stdout || ''}`,
                );
                const repo = getRepoSlug();
                if (
                    repo &&
                    /protected|rejected|non-fast-forward|deny|permission/i.test(
                        res.stderr + res.stdout,
                    )
                ) {
                    log.warn(
                        `提示: gh api repos/${repo}/branches/${branch}/protection 可查看保护规则`,
                    );
                }
            }
        } else {
            log.info(`远端无分支 ${branch}`);
        }
    }

    if (hasRemoteTrack) {
        run('git', ['branch', '-rd', `origin/${branch}`], { allowFail: true });
    }
    return removedAny;
}

/** 删除后清理无引用的 git 提交 */
function gcUnreferenced({ dryRun }) {
    if (dryRun) {
        log.info('[DRY-RUN] git reflog expire --expire=now --all');
        log.info('[DRY-RUN] git gc --prune=now');
        return;
    }
    log.info('清理无引用的 git 提交...');
    run('git', ['reflog', 'expire', '--expire=now', '--all'], {
        allowFail: true,
    });
    run('git', ['gc', '--prune=now'], { allowFail: true });
    log.ok('无引用 git 提交已清理');
}

/** 删除单个版本分支主流程（顺带清理该版本的代码包/Release） */
async function purgeOne(version, { dryRun, localOnly, skipConfirm }) {
    const branch = withV(version);
    const hasLocal =
        git(['rev-parse', '--verify', '-q', `refs/heads/${branch}`], {
            allowFail: true,
        }).status === 0;
    const remoteLive = remoteBranchExists(branch);

    if (!hasLocal && remoteLive === false) {
        log.warn(`未找到版本分支 ${branch}（本地与远端均无）`);
        return;
    }

    log.info(`目标版本分支: ${branch}`);

    if (!localOnly) {
        const prot = branchProtection(branch);
        if (prot.protected) {
            if (prot.allowDeletions) {
                log.warn(
                    `⚠️ ${branch} 受 GitHub 分支保护，但已启用 allow_deletions，删除可能被允许`,
                );
            } else {
                log.warn(
                    `⚠️ ${branch} 受 GitHub 分支保护（只读），远端删除大概率会被拒绝；本地删除不受影响`,
                );
            }
        } else if (prot.checkable) {
            log.info(`✓ ${branch} 未受 GitHub 分支保护`);
        }
    }

    if (isCurrentReleaseVersion(version)) {
        log.warn(
            `⚠️ ${version} 是当前发布版本（release/releases.json），删除其代码包/Release 后在线更新将不可用，请谨慎！`,
        );
    }

    if (dryRun) {
        log.info('将删除:');
        if (hasLocal) log.info('  本地分支');
        if ((remoteLive === true || remoteLive === null) && !localOnly)
            log.info('  远端分支（GitHub + Gitee）');
        log.info('并顺带清理该版本的代码包与 GitHub Release/标签（如有）');
        log.info('删除后将清理无引用的 git 提交（reflog expire + gc --prune=now）');
        await purgeZipVer(version, { dryRun: true, localOnly, skipConfirm: true });
        console.log('\n\x1b[33m（预览模式，未执行任何写操作）\x1b[0m');
        return;
    }

    if (!skipConfirm) {
        const ok = await confirmDestructive(
            `确认删除版本分支 ${branch} 及其代码包/Release${localOnly ? '（仅本地）' : '（本地 + GitHub/Gitee 远端）'}？此操作不可逆`,
            { skipConfirm },
        );
        if (!ok) {
            log.warn('已取消');
            return;
        }
    }

    const removedAny = deleteVersionBranch(branch, { dryRun, localOnly });
    // 顺带清理该版本在 zips 上的代码包 + Release + 标签（父流程已确认，直接以 --yes 语义执行）
    await purgeZipVer(version, { dryRun, localOnly, skipConfirm: true });
    if (removedAny) gcUnreferenced({ dryRun });
    log.ok(`版本分支 ${branch} 清理完成`);
}

function printUsage() {
    console.log(`用法:
  node scripts/purge.mjs                   交互菜单（整体清除 / 删 zip 版本 / 删版本分支 / 列分支）
  node scripts/purge.mjs --all             直接整体清除 zips 分支（跳过询问）
  node scripts/purge.mjs --version <版本号> 直接删除指定 zip 版本及其 Release
  node scripts/purge.mjs --branch <版本号>  直接删除指定 v{版本} 分支（并清理其代码包/Release）
  node scripts/purge.mjs <版本号>           同上（--branch 简写）
  node scripts/purge.mjs --list            仅列出可用的版本分支，不删除
  通用选项:
    --dry-run / -d 仅预览；--local 仅处理本地；--yes 跳过不可逆确认`);
}

/** 交互：无参数时选择清理方式 */
async function chooseInteractiveAction() {
    const choice = await menu('请选择清理方式:', [
        { label: '删除整个 zips 分支（连同发布标签与提交，物理清除）', value: 'all' },
        { label: '删除某个 zip 版本（移除代码包 + 删除其 GitHub Release 与标签）', value: 'zip-version' },
        { label: '删除某个 v{版本} 分支（并清理其代码包/Release）', value: 'branch' },
        { label: '列出当前的 v{版本} 分支（只读，不删除）', value: 'list' },
    ]);
    if (!choice) return null;
    return choice.value;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) return printUsage();
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    const localOnly = args.includes('--local');
    const skipConfirm = args.includes('--yes');
    const listOnly = args.includes('--list');
    const allMode = args.includes('--all');
    const versionIndex = args.indexOf('--version');
    const versionArg = versionIndex >= 0 ? args[versionIndex + 1] : null;
    const branchIndex = args.indexOf('--branch');
    const branchArg = branchIndex >= 0 ? args[branchIndex + 1] : null;
    const positional = args.find((a) => a && !a.startsWith('-'));

    if (
        git(['rev-parse', '--is-inside-work-tree'], { allowFail: true })
            .status !== 0
    ) {
        log.error('必须在 git 仓库内运行本脚本');
        process.exit(1);
    }

    // 尽量刷新远端引用，保证列出的版本分支最新（断网时忽略）
    run('git', ['fetch', 'origin', '--prune'], { allowFail: true });

    try {
        // 只读：列出版本分支
        if (listOnly) {
            const versions = listVersionBranches();
            if (versions.length === 0) log.warn('未发现版本分支');
            else versions.forEach((b) => console.log(`  ${describeBranch(b)}`));
            return;
        }

        // 确定操作与目标
        let action = null;
        let target = null;

        if (allMode) {
            action = 'all';
        } else if (versionArg) {
            if (!isValidVersion(versionArg)) throw new Error(`无效的版本号：${versionArg}，正确格式如 26.8.7.0`);
            action = 'zip-version';
            target = stripV(versionArg);
        } else if (branchArg || positional) {
            const v = (branchArg || positional);
            if (!isValidVersion(v)) throw new Error(`无效的版本号：${v}，正确格式如 26.8.7.0`);
            action = 'branch';
            target = stripV(v);
        } else if (skipConfirm) {
            log.error('CI 场景必须显式指定 --all / --version <版本号> / --branch <版本号>，避免误删');
            printUsage();
            process.exit(1);
        } else {
            action = await chooseInteractiveAction();
            if (!action) {
                log.warn('已取消');
                return;
            }
        }

        if (action === 'all') {
            await purgeAll({ dryRun, localOnly, skipConfirm });
        } else if (action === 'zip-version') {
            // 交互进入此模式时 target 为空：列出 zips 上的代码包版本供选择（不能只靠命令行）
            if (!target) {
                const versions = collectZipVersions();
                if (versions.size === 0) {
                    log.warn('zips 分支上没有可枚举的代码包版本，请改用 --all 或 --version <版本号>');
                    return;
                }
                const choice = await menu(
                    `选择要删除的 zip 版本（共 ${versions.size} 个）：`,
                    [...versions.keys()].sort(compareVersion).reverse(),
                );
                if (!choice) {
                    log.warn('已取消');
                    return;
                }
                target = choice;
            }
            await purgeZipVer(target, { dryRun, localOnly, skipConfirm });
        } else if (action === 'branch') {
            if (!target) {
                const versions = listVersionBranches();
                if (versions.length === 0) {
                    log.warn('未发现可删除的版本分支');
                    return;
                }
                const choice = await menu('现有版本分支：', versions);
                if (!choice) {
                    log.warn('已取消');
                    return;
                }
                target = stripV(choice);
            }
            await purgeOne(target, { dryRun, localOnly, skipConfirm });
        } else if (action === 'list') {
            const versions = listVersionBranches();
            if (versions.length === 0) log.warn('未发现版本分支');
            else versions.forEach((b) => console.log(`  ${describeBranch(b)}`));
        }
    } finally {
        closeInteractive();
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) {
    main().catch((error) => {
        log.error(error instanceof Error ? error.message : String(error));
        printUsage();
        process.exit(1);
    });
}