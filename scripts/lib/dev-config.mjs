/**
 * 崩铁杀 开发同步 — 路径配置。
 *
 * devRoot（项目固有）随仓库提交；installed（本机安装目录）存于 scripts/lib/dev-config.local.json
 * （.gitignore 忽略；缺失时为空数组，工具提示按 dev-config.local.example.json 创建）。
 *
 * 同步文件集以源目录 Directory.json 为唯一依据（由 scripts/rebuild.mjs 生成，与在线更新器清理
 * 失效文件共用同一清单）；dev:install / dev:export 只同步清单内文件。
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PATHS } from './shared.mjs';

const LOCAL_FILE = fileURLToPath(
    new URL('./dev-config.local.json', import.meta.url),
);

/** 读取本机配置（不存在或解析失败时回退为空对象） */
function readLocal() {
    if (!existsSync(LOCAL_FILE)) return {};
    try {
        return JSON.parse(readFileSync(LOCAL_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

const local = readLocal();

/** 开发工作区根目录 = zip/ 项目根 */
export const devRoot = PATHS.root;

/** 已安装的游戏扩展目录（离线版 + 联机版）——来自本机配置，勿提交 */
export const installed = Array.isArray(local.installed) ? local.installed : [];

/**
 * 一键打包（scripts/pack.mjs）本机路径：无名杀构建树 / 桌面树 app 根 / 电脑基座目录 / APK 签名资料。
 * 均可选——pack.mjs 有内置相对路径回退与命令行参数覆盖（--build-tree / --desktop-app / --base-dir / --ks-props）。
 */
export const pack = local.pack && typeof local.pack === 'object' ? local.pack : {};
