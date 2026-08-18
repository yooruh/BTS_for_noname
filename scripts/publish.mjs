#!/usr/bin/env node

/**
 * 崩铁杀 发布脚本 —— 将代码包提交到 zips 分支并创建 GitHub Release
 *
 * 前置条件:
 *   1. 已执行 npm run build（生成 {版本}-code.zip 到 ../_others/，
 *      并把 zip 元数据写入 version.json）
 *   2. 已安装并登录 GitHub CLI（gh auth login）
 *
 * 本脚本只处理「zips 分支 + v{版本} 分支 + Release」，不运行构建、不触碰 main：
 *   1. 校验 version.json 与 ../_others/ 中代码包的 size/md5 一致
 *   2. 把代码包提交到 zips 分支的 release/code/ 并推送（GitHub 必需，Gitee 尽力）
 *   3. 推送 v{版本} 分支（基于当前 HEAD，移除 version.json，GitHub 必需，Gitee 尽力）
 *   4. 打 v{版本} 标签并推送
 *   5. 用 gh 创建 GitHub Release 并附加代码包资产
 *
 * 用法:
 *   node scripts/publish.mjs              正式发布
 *   node scripts/publish.mjs --dry-run    预览（不执行任何写操作）
 *   node scripts/publish.mjs --force      远程 v{版本} 分支不一致时强制覆盖
 */

import { spawnSync } from 'node:child_process';
import {
    existsSync,
    statSync,
    readFileSync,
    copyFileSync,
    mkdirSync,
    writeFileSync,
    rmSync,
    mkdtempSync,
    readSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
    log,
    PATHS,
    readFile,
    stripV,
    withV,
    isValidVersion,
    releaseTag,
} from './lib/shared.mjs';
import {
    readReleaseManifest,
    getLatestRelease,
    getCurrentReleaseVersion,
} from './lib/release.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SELF_PATH = fileURLToPath(import.meta.url);

const OUT_DIR = resolve(ROOT, '..', '_others');
const ZIP_BRANCH = 'zips';
const WORKTREE = resolve(ROOT, '..', '.zips-worktree');
const VERSION_WORKTREE = resolve(ROOT, '..', '.version-worktree');
const REPO = 'yooruh/BTS_for_noname';
const GITHUB_PUSH = 'https://github.com/yooruh/BTS_for_noname.git';
const GITEE_PUSH = 'https://gitee.com/yooruh/BTS_for_noname.git';

/**
 * 执行命令，返回 {status, stdout, stderr}。
 * 失败时抛错（allowFail 为 true 时返回结果而不抛错）。
 */
function run(cmd, args, { allowFail = false, cwd } = {}) {
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

function printBanner() {
    console.log(`
\x1b[35m╔══════════════════════════════════╗
║ 崩铁杀 发布脚本（zips+Release）║
╚══════════════════════════════════╝\x1b[0m
`);
}

function printUsage() {
    console.log(`用法:
  node scripts/publish.mjs              正式发布（推送 zips 分支 + v{版本} 分支 + 标签 + GitHub Release）
  node scripts/publish.mjs --dry-run    预览（不执行任何写操作）
  node scripts/publish.mjs --force      远程 v{版本} 分支不一致时强制覆盖
`);
}

/** 前置校验：git 在仓库内；gh 已安装并登录（dry-run 仅警告） */
function checkPrereqs(dryRun) {
    // 不在仓库内会直接抛错
    run('git', ['rev-parse', '--is-inside-work-tree']);

    const ghCheck = run('gh', ['--version'], { allowFail: true });
    if (ghCheck.status !== 0) {
        if (dryRun) {
            log.warn(
                '未检测到 gh 命令，dry-run 将跳过 Release 步骤（正式发布需要安装并登录 GitHub CLI）',
            );
            return false;
        }
        throw new Error(
            '未找到 gh 命令。请先安装 GitHub CLI（https://cli.github.com/）并执行 `gh auth login` 授权后重试。',
        );
    }
    const authCheck = run('gh', ['auth', 'status'], { allowFail: true });
    if (authCheck.status !== 0) {
        if (dryRun) {
            log.warn('gh 未登录，dry-run 将跳过 Release 步骤');
            return false;
        }
        throw new Error('gh 未登录。请先执行 `gh auth login` 授权后重试。');
    }
    return true;
}

/** 检测工作区是否有未提交的更改（git status --porcelain） */
function getUncommittedChanges() {
    const res = run('git', ['status', '--porcelain'], { allowFail: true });
    if (res.status !== 0) return [];
    return res.stdout.split('\n').filter(Boolean);
}

/** 同步读取一行 stdin（非交互环境立即返回空串） */
function readLineSync() {
    const buf = Buffer.alloc(4096);
    try {
        const n = readSync(0, buf, 0, buf.length, null);
        return buf.toString('utf-8', 0, Math.max(0, n)).replace(/\r?\n$/, '');
    } catch {
        return '';
    }
}

/** 检测到未提交内容时询问是否继续发布；dry-run 仅警告不询问 */
function confirmIfDirty(dryRun) {
    const changes = getUncommittedChanges();
    if (changes.length === 0) return;

    log.warn(`检测到 ${changes.length} 项未提交的更改：`);
    for (const line of changes.slice(0, 20)) {
        console.log(`  ${line}`);
    }
    if (changes.length > 20) {
        console.log(`  ...（其余 ${changes.length - 20} 项略）`);
    }
    if (dryRun) {
        log.warn('dry-run 仅预览，不执行写操作，跳过确认');
        return;
    }

    process.stdout.write(
        '未提交的更改不会随本次发布推送。是否仍要发布？[y/N] ',
    );
    const answer = readLineSync().trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
        console.log('已取消发布：请先提交或撤销未提交的更改。');
        process.exit(0);
    }
}

function md5Hex(buf) {
    return createHash('md5').update(buf).digest('hex');
}

/** 读取 version.json 与 _others 中的代码包并交叉校验 size/md5 */
function resolveTarget() {
    let vj;
    try {
        vj = JSON.parse(readFile(PATHS.versionJson));
    } catch {
        throw new Error('无法读取 version.json，请先运行 npm run build');
    }
    const entry = vj.versions?.[0];
    if (!entry?.zip?.filename) {
        throw new Error('version.json 缺少 zip 元数据，请先运行 npm run build');
    }
    const version = stripV(entry.extensionVersion);
    if (!isValidVersion(version)) {
        throw new Error(
            `version.json 中的版本号不合法: ${entry.extensionVersion}`,
        );
    }
    const { filename, size, md5, branch, tag } = entry.zip;
    if (branch && branch !== ZIP_BRANCH) {
        log.warn(
            `version.json 的 zip.branch 为 ${branch}，本脚本固定发布到 ${ZIP_BRANCH} 分支`,
        );
    }

    const absPath = resolve(OUT_DIR, filename);
    if (!existsSync(absPath)) {
        throw new Error(
            `未找到代码包: ${filename}\n请先运行 npm run build 重新生成`,
        );
    }
    const realSize = statSync(absPath).size;
    if (size != null && realSize !== size) {
        throw new Error(
            `代码包大小不符: 期望 ${size}，实际 ${realSize}\n请重新运行 npm run build`,
        );
    }
    const realMd5 = md5Hex(readFileSync(absPath));
    if (md5 && realMd5 !== md5) {
        throw new Error(
            `代码包 md5 不符: 期望 ${md5}，实际 ${realMd5}\n请重新运行 npm run build`,
        );
    }

    // 交叉核对 release/releases.json（不一致仅警告）
    try {
        if (getCurrentReleaseVersion(readReleaseManifest()) !== version) {
            log.warn(
                'version.json 与 release/releases.json 版本不一致，建议先运行 npm run build',
            );
        }
    } catch {
        /* manifest 校验失败忽略，不影响发布 */
    }

    return { version, filename, absPath, size: realSize, md5: realMd5, tag };
}

/** 把 {{poptip:a|b}} 与轻量 HTML 转为纯文本（用于 Release notes） */
function toPlainText(html) {
    return String(html ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '')
        .replace(/\{\{poptip:([^}]+)\}\}/g, (_, token) => {
            const [arg, label] = token.split('|');
            return label || String(arg).replace(/^[a-z0-9_]+/i, '') || arg;
        })
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&gt;/gi, '>')
        .replace(/&lt;/gi, '<')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/gi, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** 从 release/releases.json 最新 release 生成 Release notes */
function buildReleaseNotes(version) {
    const manifest = readReleaseManifest();
    const latest = getLatestRelease(manifest);
    const lines = (latest.highlights || [])
        .map((item, i) => `${i + 1}. ${toPlainText(item)}`)
        .join('\n');
    return `# 崩铁杀 v${stripV(version)}\n\n${lines}`;
}

/** 清理残留 worktree：先 git 移除，失败则直接删除目录 + prune */
function cleanupWorktree(target = WORKTREE) {
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

/**
 * 推送 v{版本} 分支（基于当前 HEAD，移除 version.json）到 GitHub/Gitee。
 * 项目用 v{版本} 同时作为发布标签，故推送必须用显式 refs/heads/ refspec，
 * 避免同名标签造成 "matches more than one" 歧义。
 * @param {string} version 版本号（可带 v 前缀）
 * @param {object} [options]
 * @param {boolean} [options.dryRun] 预览模式，不执行任何写操作
 * @param {boolean} [options.force] 远程分支不一致时强制覆盖推送
 */
function pushVersionBranch(version, { dryRun = false, force = false } = {}) {
    const branch = withV(version);
    const ref = `refs/heads/${branch}:refs/heads/${branch}`;

    // 目标分支就是当前分支时，无法用 worktree 重建
    const currentBranch = run('git', [
        'rev-parse',
        '--abbrev-ref',
        'HEAD',
    ]).stdout;
    if (currentBranch === branch) {
        throw new Error(`当前已在 ${branch} 分支上，请先切回 main 再执行`);
    }

    log.info(`版本分支: ${branch}（基于当前 HEAD，移除 version.json）`);
    // version.json 是否被跟踪（只读探测，dry-run 同样有效）
    const tracked =
        run('git', ['ls-files', '--error-unmatch', 'version.json'], {
            allowFail: true,
        }).status === 0;

    if (dryRun) {
        log.info(`[DRY-RUN] git worktree add -B ${branch} <worktree> HEAD`);
        if (tracked) {
            log.info(`[DRY-RUN] git rm version.json`);
            log.info(
                `[DRY-RUN] git commit -m "移除 version.json（${branch} 版本分支）"`,
            );
        } else {
            log.warn('version.json 未被跟踪，分支上无需移除');
        }
        log.info(
            `[DRY-RUN] git push ${force ? '--force ' : ''}${GITHUB_PUSH} ${ref}`,
        );
        log.info(
            `[DRY-RUN] git push ${force ? '--force ' : ''}${GITEE_PUSH} ${ref}（Gitee 尽力）`,
        );
        return;
    }

    try {
        // 1) 创建/重置版本分支 worktree
        run('git', ['worktree', 'add', '-B', branch, VERSION_WORKTREE, 'HEAD']);

        // 2) 移除 version.json 并提交（仅当被跟踪）
        if (tracked) {
            run('git', ['rm', '--ignore-unmatch', 'version.json'], {
                cwd: VERSION_WORKTREE,
            });
            const porcelain = run('git', ['status', '--porcelain'], {
                cwd: VERSION_WORKTREE,
            });
            if (porcelain.stdout.trim().length > 0) {
                run(
                    'git',
                    ['commit', '-m', `移除 version.json（${branch} 版本分支）`],
                    { cwd: VERSION_WORKTREE },
                );
                log.ok(`已在 ${branch} 分支移除 version.json 并提交`);
            } else {
                log.ok(`${branch} 分支已不含 version.json，无需提交`);
            }
        } else {
            log.warn('version.json 未被跟踪，分支上无需移除');
        }

        // 3) 推送：GitHub 必需；Gitee 尽力
        const pushArgs = force ? ['--force'] : [];
        const github = run('git', ['push', ...pushArgs, GITHUB_PUSH, ref], {
            allowFail: true,
        });
        if (github.status !== 0) {
            if (
                !force &&
                /rejected|non-fast-forward|fetch first/i.test(
                    github.stderr + github.stdout,
                )
            ) {
                throw new Error(
                    `推送 ${branch} 到 GitHub 被拒绝（远程分支已存在且与本机不一致）。\n` +
                        `如需覆盖远程分支，请加 --force 重试。\n` +
                        (github.stderr || github.stdout),
                );
            }
            throw new Error(
                `推送 ${branch} 到 GitHub 失败: ${github.stderr || github.stdout || '未知原因'}`,
            );
        }
        log.ok(`已推送 ${branch} 到 GitHub`);

        const gitee = run('git', ['push', ...pushArgs, GITEE_PUSH, ref], {
            allowFail: true,
        });
        if (gitee.status !== 0) {
            log.warn(
                `Gitee 推送失败（不影响 GitHub）: ${gitee.stderr || gitee.stdout || '未知原因'}`,
            );
        } else {
            log.ok(`已推送 ${branch} 到 Gitee`);
        }
    } finally {
        cleanupWorktree(VERSION_WORKTREE);
    }
}

/** 探测 zips 分支状态：远端（origin/zips）/ 本地（refs/heads/zips） */
function detectBranchState(dryRun) {
    const hasLocal =
        run(
            'git',
            ['rev-parse', '--verify', '-q', `refs/heads/${ZIP_BRANCH}`],
            { allowFail: true },
        ).status === 0;
    let hasRemote = false;
    if (dryRun) {
        // 只读探测，不写本地引用
        hasRemote =
            run(
                'git',
                [
                    'ls-remote',
                    '--heads',
                    GITHUB_PUSH,
                    `refs/heads/${ZIP_BRANCH}`,
                ],
                { allowFail: true },
            ).stdout.trim().length > 0;
    } else {
        const fetched = run('git', ['fetch', 'origin'], { allowFail: true });
        if (fetched.status === 0) {
            hasRemote =
                run(
                    'git',
                    [
                        'rev-parse',
                        '--verify',
                        '-q',
                        `refs/remotes/origin/${ZIP_BRANCH}`,
                    ],
                    { allowFail: true },
                ).status === 0;
        } else {
            // fetch 失败（如断网）时退化为 ls-remote 探测
            hasRemote =
                run(
                    'git',
                    [
                        'ls-remote',
                        '--heads',
                        GITHUB_PUSH,
                        `refs/heads/${ZIP_BRANCH}`,
                    ],
                    { allowFail: true },
                ).stdout.trim().length > 0;
        }
    }
    return { hasRemote, hasLocal };
}

/**
 * 把代码包提交到 zips 分支的 release/code/ 并推送。
 * - 分支不存在 → 孤儿分支（只含 release/code/）
 * - 分支已存在 → 检出后在其上追加提交
 * @returns {{changed:boolean, sha:string, orphan:boolean}}
 */
function syncZipBranch(dryRun, target) {
    const { hasRemote, hasLocal } = detectBranchState(dryRun);
    const orphan = !hasRemote && !hasLocal;

    if (dryRun) {
        log.info(
            `[DRY-RUN] zips 分支: ${orphan ? '新建孤儿分支' : '复用现有分支'}（远端: ${hasRemote ? '有' : '无'}，本地: ${hasLocal ? '有' : '无'}）`,
        );
        log.info(
            `[DRY-RUN]   git worktree add ${orphan ? '--orphan -b zips' : '-B zips'} <worktree>`,
        );
        log.info(
            `[DRY-RUN]   拷贝 ${target.filename} → <worktree>/release/code/`,
        );
        log.info(`[DRY-RUN]   git commit -m "发布 v${target.version} 代码包"`);
        log.info(
            `[DRY-RUN]   git push ${GITHUB_PUSH} ${ZIP_BRANCH}（GitHub 必需）`,
        );
        log.info(
            `[DRY-RUN]   git push ${GITEE_PUSH} ${ZIP_BRANCH}（Gitee 尽力）`,
        );
        return { changed: true, sha: '(dry-run)', orphan };
    }

    log.info(`zips 分支: ${orphan ? '新建孤儿分支' : '复用现有分支'}`);
    try {
        if (orphan) {
            run('git', [
                'worktree',
                'add',
                '--orphan',
                '-b',
                ZIP_BRANCH,
                WORKTREE,
            ]);
            // 不同 git 版本下孤儿分支初始内容可能不同，保证为空
            const porcelain = run('git', ['status', '--porcelain'], {
                cwd: WORKTREE,
            });
            if (porcelain.stdout.trim().length > 0) {
                run('git', ['rm', '-rf', '.', '--ignore-unmatch'], {
                    cwd: WORKTREE,
                    allowFail: true,
                });
            }
        } else if (hasRemote) {
            run('git', [
                'worktree',
                'add',
                '-B',
                ZIP_BRANCH,
                '--track',
                WORKTREE,
                `origin/${ZIP_BRANCH}`,
            ]);
        } else {
            // 仅有本地分支（如上次首次发布中断残留）
            run('git', [
                'worktree',
                'add',
                '-B',
                ZIP_BRANCH,
                WORKTREE,
                ZIP_BRANCH,
            ]);
        }

        // 拷贝代码包
        const codeDir = join(WORKTREE, 'release', 'code');
        mkdirSync(codeDir, { recursive: true });
        copyFileSync(target.absPath, join(codeDir, target.filename));

        // 无改动且分支已存在 → 内容一致，跳过提交与推送
        const porcelain = run('git', ['status', '--porcelain'], {
            cwd: WORKTREE,
        });
        if (porcelain.stdout.trim().length === 0 && (hasRemote || hasLocal)) {
            log.ok('zips 分支已包含相同代码包，跳过提交与推送');
            const sha = run('git', ['rev-parse', 'HEAD'], {
                cwd: WORKTREE,
            }).stdout;
            return { changed: false, sha, orphan };
        }

        run('git', ['add', '-A'], { cwd: WORKTREE });
        run('git', ['commit', '-m', `发布 v${target.version} 代码包`], {
            cwd: WORKTREE,
        });
        const sha = run('git', ['rev-parse', 'HEAD'], { cwd: WORKTREE }).stdout;

        // 推送：GitHub 必需；Gitee 尽力
        run('git', ['push', GITHUB_PUSH, ZIP_BRANCH]);
        const gitee = run('git', ['push', GITEE_PUSH, ZIP_BRANCH], {
            allowFail: true,
        });
        if (gitee.status !== 0) {
            log.warn(
                `Gitee 推送失败（不影响 GitHub 发布）: ${gitee.stderr || gitee.stdout || '未知原因'}`,
            );
        }
        return { changed: true, sha, orphan };
    } finally {
        cleanupWorktree();
    }
}

/** 打 v{版本}-code-zip 标签（指向 zips 分支提交）并推送 */
function ensureTag(dryRun, target, sha) {
    const tag = releaseTag(target.version);
    if (dryRun) {
        log.info(`[DRY-RUN] 标签: 创建并推送 ${tag} -> ${sha}`);
        return;
    }

    // 读取/推送标签始终用显式 refs/tags/，避免与同名 ref 产生歧义
    const localSha = run(
        'git',
        ['rev-parse', '--verify', '-q', `refs/tags/${tag}`],
        { allowFail: true },
    ).stdout;
    if (!localSha) {
        run('git', ['tag', tag, sha]);
        log.ok(`已创建标签 ${tag}`);
    } else if (localSha !== sha) {
        log.warn(`本地标签 ${tag} 已存在且指向不同提交，强制更新`);
        run('git', ['tag', '-f', tag, sha]);
    } else {
        log.ok(`本地标签 ${tag} 已指向同一提交`);
    }

    const remoteTags = run(
        'git',
        ['ls-remote', '--tags', GITHUB_PUSH, `refs/tags/${tag}`],
        { allowFail: true },
    );
    if (remoteTags.status === 0 && remoteTags.stdout.trim().length > 0) {
        log.warn(
            `远端已存在标签 ${tag}；GitHub 禁止移动已存在的标签，推送可能被拒绝。`,
        );
        log.warn(
            `如需重新打标签：git push ${GITHUB_PUSH} :refs/tags/${tag} && git push ${GITHUB_PUSH} refs/tags/${tag}`,
        );
    }

    run('git', ['push', GITHUB_PUSH, `refs/tags/${tag}`]);
    const gitee = run('git', ['push', GITEE_PUSH, `refs/tags/${tag}`], {
        allowFail: true,
    });
    if (gitee.status !== 0) {
        log.warn(
            `Gitee 标签推送失败（不影响 GitHub 发布）: ${gitee.stderr || gitee.stdout || '未知原因'}`,
        );
    }
}

/** 用 gh 创建 GitHub Release（标签 v{版本}-code-zip）并附加代码包资产 */
function ensureRelease(dryRun, target, notes) {
    const tag = releaseTag(target.version);
    if (dryRun) {
        log.info(
            `[DRY-RUN] Release: gh release create ${tag} <${target.absPath}> --repo ${REPO}`,
        );
        return;
    }

    const tmpDir = mkdtempSync(join(tmpdir(), 'lit-publish-'));
    const notesPath = join(tmpDir, 'notes.md');
    writeFileSync(notesPath, notes, 'utf-8');
    const absPath = target.absPath.replace(/\\/g, '/'); // gh 在 Windows 上对反斜杠路径更友好
    try {
        const res = run(
            'gh',
            [
                'release',
                'create',
                tag,
                absPath,
                '--repo',
                REPO,
                '--title',
                `崩铁杀 v${target.version}`,
                '--notes-file',
                notesPath,
            ],
            { allowFail: true },
        );
        if (res.status === 0) {
            log.ok(`已创建 GitHub Release ${tag} 并附加资产`);
            return;
        }

        // Release 已存在（HTTP 422）→ 仅更新资产
        if (/already exists|HTTP 422|422/i.test(res.stderr + res.stdout)) {
            log.warn('Release 已存在，尝试仅更新资产...');
            const upload = run(
                'gh',
                [
                    'release',
                    'upload',
                    tag,
                    absPath,
                    '--repo',
                    REPO,
                    '--clobber',
                ],
                { allowFail: true },
            );
            if (upload.status === 0) {
                log.ok(`已更新 Release ${tag} 的资产`);
            } else {
                throw new Error(
                    `更新 Release 资产失败: ${upload.stderr || upload.stdout || '未知原因'}`,
                );
            }
        } else {
            throw new Error(
                `gh release create 失败: ${res.stderr || res.stdout || '未知原因'}`,
            );
        }
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }
}

function printSummary(target, { changed, sha }) {
    const enc = encodeURIComponent(target.filename);
    console.log('');
    log.ok(
        `发布流程完成${changed === false ? '（代码包已是最新，未新增提交）' : ''}`,
    );
    console.log(`  分支提交:  ${sha}`);
    console.log(
        `  Raw:       https://raw.githubusercontent.com/${REPO}/${ZIP_BRANCH}/release/code/${enc}`,
    );
    console.log(
        `  jsDelivr:  https://cdn.jsdelivr.net/gh/${REPO}@${ZIP_BRANCH}/release/code/${enc}`,
    );
    console.log(
        `  Gitee Raw: https://gitee.com/${REPO}/raw/${ZIP_BRANCH}/release/code/${enc}`,
    );
    console.log(
        `  Release:   https://github.com/${REPO}/releases/tag/${target.tag}`,
    );
    console.log('');
    console.log(
        '提示：更新器会先读 main 的 version.json → 再按 zip.branch/zips 下载代码包；',
    );
    console.log(
        '      若本机还未把 main 上构建产物（version.json/清单等）推送，请先提交推送 main。',
    );
}

function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    const force = args.includes('--force') || args.includes('-f');

    printBanner();
    try {
        const hasGh = checkPrereqs(dryRun);
        const target = resolveTarget();
        confirmIfDirty(dryRun);

        // 护栏：version.json 的 zip.tag 必须与发布标签一致，否则客户端按 tag 下载会 404
        if (target.tag && target.tag !== releaseTag(target.version)) {
            log.warn(
                `version.json 的 zip.tag（${target.tag}）与发布标签（${releaseTag(target.version)}）不一致；`,
            );
            log.warn(
                `请先重新执行 npm run build 重新生成代码包（会重写 version.json）后再发布。`,
            );
        }

        log.info(`目标版本: ${target.version}`);
        log.info(
            `代码包:   ${target.filename}（${(target.size / 1024).toFixed(1)} KB，md5 ${target.md5.slice(0, 8)}…）`,
        );

        const { changed, sha } = syncZipBranch(dryRun, target);

        // 推送 v{版本} 分支（基于当前 HEAD，移除 version.json）
        pushVersionBranch(target.version, { dryRun, force });

        if (dryRun) {
            log.info(
                `[DRY-RUN] 标签: 创建并推送 ${releaseTag(target.version)} -> ${sha}`,
            );
            ensureRelease(dryRun, target, buildReleaseNotes(target.version));
            console.log('\n\x1b[33m（预览模式，未执行任何写操作）\x1b[0m');
            printSummary(target, { changed, sha });
            return;
        }

        ensureTag(dryRun, target, sha);
        if (hasGh) {
            ensureRelease(dryRun, target, buildReleaseNotes(target.version));
        }
        printSummary(target, { changed, sha });
    } catch (error) {
        log.error(error instanceof Error ? error.message : String(error));
        console.log('');
        printUsage();
        process.exit(1);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) {
    main();
}
