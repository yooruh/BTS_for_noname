#!/usr/bin/env node

/**
 * 崩铁杀 · 一键打包（pack）——本体 / APK / 电脑安装器，统一出口。
 *
 * ── 菜单顺序（交互模式）─────────────────────────────────────────────────
 *   [1] 本体打包    ①完全体/②丐版 → 是否包含崩铁杀扩展 → 是否包含电脑基座
 *   [2] APK 打包    从「本体打包」目录挑选不含基座的本体包 → 封装为安卓 APK
 *   [3] 安装器打包  从「本体打包」目录挑选任意本体包 → 生成 NSIS 安装向导 exe
 *
 * ── 功能说明 ────────────────────────────────────────────────────────────
 * [1] 本体打包（输出 zip 根＝游戏网页根；含引擎补丁）
 *     · 完全体 = 官方 8 扩展 + 全部媒体（完整发行内容）；
 *       丐版   = 无音频 / 无 src/docs/font；图像仅保留卡牌图（image/card）；
 *                扩展默认全去（可选保留崩铁杀）。
 *     · 包含崩铁杀 → 先把 `zip` 源同步进构建树 dist/extension/崩铁杀（按 Directory.json 清单逐字节
 *       比对，防包内扩展与项目不一致），再打入包内；并修改默认 config 预设启用
 *       （"extensions": ["崩铁杀"] + 3 个 enable 键；不注入 version，保持“正常首次安装”形态）。
 *     · 包含电脑基座 → 与基座 zip 合体（游戏内容并入 <基座>/resources/app/；
 *       同名冲突：内容一致去重、不一致本体优先并告警）。
 * [2] APK 打包
 *     扫描「本体打包」目录中不含电脑基座内容的 zip，任选其一：
 *     · 打包前先把 `zip` 源同步进构建树 dist 扩展（约定：避免打包版本与项目扩展不一致）。
 *     用该本体包整体替换安卓外壳 APK 的 assets/public/ 游戏内容。
 *     · 壳层保留：cordova.js、_pnpm/**，以及【手机版 preload.js】——它由手机版构建管线生成、
 *       提供 SAF 文件系统桥接（entry.js 动态 import('/preload.js') 覆写文件 API）；
 *       与 dist 的桌面版 preload.js 同名，必须强制保留壳版本，丢失会导致手机启动崩溃
 *       （回退到需 noname_inited 的 cordova 文件实现 → path.join(null) 报错）。
 *     随后 zipalign → java apksigner 重签（禁 v4）→ 校验证书。
 *     外壳 APK 缺失时：交互模式询问重建（pnpm run build:android --skip-web-build），
 *     CLI 加 --rebuild 自动重建。
 * [3] 安装器打包（NSIS 向导式安装程序）
 *     扫描「本体打包」目录中任意 zip，任选其一；若无电脑基座自动补基座 →
 *     解包为 NSIS 载荷（按组件分流：core / 崩铁杀 / 卡牌图像 / 音效 / 角色图像 /
 *     角色语音 / 本体扩展）→ 编译出带组件选择的安装 exe。
 *     · 安装目录默认 = 首个非系统盘固定盘符的 \noname（如 D:\noname）；没有
 *       其他固定盘才退回系统盘（C:\noname）。
 *     · 更新模式：注册表记录的上次安装目录、该目录存在非空、且含启动器/资源/卸载器
 *       任一 → 自动沿用旧目录覆盖更新（保留现有文件不删除）；命令行显式 /D= 优先。
 *     · 可选：桌面快捷方式；六个可选组件默认全选；某组件在包中不存在则不显示。
 *     · 崩铁杀勾选后保留其扩展内全部素材（与本体媒体勾选无关）。
 *     · 编译完成后清理全部临时文件（安装器目录不残留 zip）。
 *
 * ── 用法（AI / 自动化）──────────────────────────────────────────────────
 *   node scripts/pack.mjs body --variant full|slim [--with-bts] [--base <基座zip>|--with-base] [--dry-run]
 *   node scripts/pack.mjs apk --from <本体包zip> [--rebuild] [--dry-run]
 *   node scripts/pack.mjs installer --from <zip> [--fast] [--dry-run]
 *   node scripts/pack.mjs bases                                 列出可用电脑基座包
 *   无参数运行（npm run pack）＝交互式菜单。
 *
 *   通用可选参数：
 *     --out <目录>         打包根输出目录（默认 <仓库>/_others/打包目录；子目录自动建）
 *     --build-tree <目录>  无名杀构建树（含 dist/ 与安卓工程；默认读 dev-config.local.json）
 *     --desktop-app <目录> 已打补丁的桌面树 app 根（引擎补丁与官方 config 来源）
 *     --base-dir <目录>    电脑基座 zip 搜索目录（默认读 dev-config.local.json）
 *     --apk-src <文件>     外壳 APK 路径（默认构建树 gradle release 产物）
 *     --ks-props <文件>    APK 签名资料 keystore.properties
 *     --dry-run            只检查与统计，不写任何文件
 *
 * ── 输出（默认 _others/打包目录/…）─────────────────────────────────────
 *   本体打包/   v{版本}_完全体[_含崩铁杀].zip ｜ v{版本}_丐版[_含崩铁杀].zip
 *               {基座名}_合体_{本体包名}.zip
 *   APK打包/    {本体包名}.apk
 *   安装器打包/ {本体包名}_安装器.exe
 *
 * ── 依赖 ────────────────────────────────────────────────────────────────
 *   · 构建树 noname-build：dist（当前应处于「官方 1.11.6 + 崩铁杀扩展」状态）；
 *     APK 打包另需 gradle 外壳产物；安装器不需要构建树（只用本体/基座 zip）。
 *   · 桌面补丁树（引擎补丁与官方 config；断言标记存在）。
 *   · NSIS 3.x（makensis）用于安装器：探测顺序 dev-config.pack.nsisDir →
 *     _others/tools/nsis/** → PATH → 常见安装目录。项目内已就绪：
 *     _others/tools/nsis/nsis-3.11/makensis.exe
 *   · APK 工具：Android SDK build-tools（zipalign + apksigner.jar，经 java 调用）。
 */
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    readSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
    writeSync,
} from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { crc32 } from './lib/crc32.mjs';
import { PATHS, withV } from './lib/shared.mjs';
import { pack as PACK_CFG } from './lib/dev-config.mjs';
import { menu, prompt, confirm, closeInteractive } from './lib/interactive.mjs';

// ─────────────────────────────────────────────────────────────────────────
// 基础：路径 / 参数 / 日志
// ─────────────────────────────────────────────────────────────────────────
const REPO_ROOT = resolve(PATHS.root, '..'); // 崩铁杀仓库根（zip/ 的上一级）
const SGFORK_ROOT = resolve(REPO_ROOT, '..', '..'); // sgs_fork

const { flags, opts, positional } = parseArgv(process.argv.slice(2));
const DRY = flags.has('--dry-run');
const SUB = positional[0] || null;

const OUT_BASE = resolve(opts['--out'] || PACK_CFG.outDir || join(REPO_ROOT, '_others', '打包目录'));
const CFG = {
    outBase: OUT_BASE,
    bodyDir: join(OUT_BASE, '本体打包'),
    apkDir: join(OUT_BASE, 'APK打包'),
    setupDir: join(OUT_BASE, '安装器打包'),
    buildTree: resolve(opts['--build-tree'] || PACK_CFG.nonameBuild || join(SGFORK_ROOT, 'noname-build')),
    desktopApp: resolve(opts['--desktop-app'] || PACK_CFG.desktopApp || join(SGFORK_ROOT, 'noname', 'resources', 'app')),
    baseDir: opts['--base-dir'] || PACK_CFG.baseDir || '',
    ksProps: resolve(opts['--ks-props'] || PACK_CFG.keystoreProps || join(SGFORK_ROOT, 'apk-signing', 'keystore.properties')),
};
CFG.distDir = join(CFG.buildTree, 'dist');
CFG.apkSrc = resolve(opts['--apk-src'] || join(CFG.buildTree, 'apps', 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'));

const say = (m) => console.log(`\x1b[36m[PACK]\x1b[0m ${m}`);
const ok = (m) => console.log(`\x1b[32m[ OK ]\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[33m[WARN]\x1b[0m ${m}`);
const fail = (m) => console.error(`\x1b[31m[FAIL]\x1b[0m ${m}`);
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

const OUTPUTS = [];

function parseArgv(argv) {
    const VALUE_FLAGS = new Set(['--variant', '--out', '--base', '--base-dir', '--build-tree', '--desktop-app', '--apk-src', '--ks-props', '--from']);
    const flags = new Set();
    const opts = {};
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            if (VALUE_FLAGS.has(a)) opts[a] = argv[++i];
            else flags.add(a);
        } else positional.push(a);
    }
    return { flags, opts, positional };
}

function detectGameVersion() {
    const f = join(CFG.distDir, 'game', 'update.js');
    if (existsSync(f)) {
        const m = readFileSync(f, 'utf-8').match(/version:\s*["']([^"']+)["']/);
        if (m) return m[1];
    }
    const f2 = join(CFG.desktopApp, 'game', 'update.js');
    if (existsSync(f2)) {
        const m = readFileSync(f2, 'utf-8').match(/version:\s*["']([^"']+)["']/);
        if (m) return m[1];
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────
// zip 内核（流式写；读）
// ─────────────────────────────────────────────────────────────────────────
const EOCD_SIG = 0x06054b50;

function dosDateTime(d) {
    return {
        date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    };
}

function decodeName(raw, flags) {
    if (flags & 0x0800) return raw.toString('utf8');
    const asUtf8 = raw.toString('utf8');
    if (Buffer.compare(Buffer.from(asUtf8, 'utf8'), raw) === 0) return asUtf8; // APK 风格：无标志但实为 UTF-8
    try {
        return new TextDecoder('gbk').decode(raw); // 中文 Windows 工具风格
    } catch {
        return asUtf8;
    }
}

function makeZipWriter(outPath, { onProgress } = {}) {
    const fd = openSync(outPath, 'w');
    let offset = 0;
    let count = 0;
    const cdChunks = [];
    const w = (buf) => {
        writeSync(fd, buf, 0, buf.length, offset);
        offset += buf.length;
    };
    const emit = (nameBuf, meta, compBuf) => {
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(meta.flags & ~0x08, 6);
        lh.writeUInt16LE(meta.method, 8);
        lh.writeUInt16LE(meta.time, 10);
        lh.writeUInt16LE(meta.date, 12);
        lh.writeUInt32LE(meta.crc, 14);
        lh.writeUInt32LE(compBuf ? compBuf.length : 0, 18);
        lh.writeUInt32LE(meta.usize, 22);
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(0, 28);
        const localOffset = offset;
        w(lh);
        w(nameBuf);
        if (compBuf && compBuf.length) w(compBuf);
        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4);
        cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(meta.flags & ~0x08, 8);
        cd.writeUInt16LE(meta.method, 10);
        cd.writeUInt16LE(meta.time, 12);
        cd.writeUInt16LE(meta.date, 14);
        cd.writeUInt32LE(meta.crc, 16);
        cd.writeUInt32LE(compBuf ? compBuf.length : 0, 20);
        cd.writeUInt32LE(meta.usize, 24);
        cd.writeUInt16LE(nameBuf.length, 28);
        cd.writeUInt16LE(0, 30);
        cd.writeUInt16LE(0, 32);
        cd.writeUInt16LE(0, 34);
        cd.writeUInt16LE(0, 36);
        cd.writeUInt32LE(0, 38);
        cd.writeUInt32LE(localOffset, 42);
        cdChunks.push(cd, nameBuf);
        count++;
        if (onProgress && count % 3000 === 0) onProgress(count, offset);
    };
    return {
        addDir(name) {
            const t = dosDateTime(new Date());
            emit(Buffer.from(name, 'utf8'), { method: 0, flags: 0x0800, crc: 0, usize: 0, time: t.time, date: t.date }, null);
        },
        addBuffer(name, buf, meta = {}) {
            const t = meta.time !== undefined ? { time: meta.time, date: meta.date } : dosDateTime(new Date());
            const compressed = deflateRawSync(buf, { level: meta.level || 6 });
            emit(Buffer.from(name, 'utf8'), { method: 8, flags: 0x0800, crc: crc32(buf), usize: buf.length, time: t.time, date: t.date }, compressed);
        },
        addRaw(nameBuf, entry, compBuf) {
            emit(nameBuf, { method: entry.method, flags: entry.flags, crc: entry.crc, usize: entry.usize, time: entry.time, date: entry.date }, compBuf);
        },
        finish() {
            const cdOffset = offset;
            for (const c of cdChunks) w(c);
            const cdSize = offset - cdOffset;
            const eocd = Buffer.alloc(22);
            eocd.writeUInt32LE(EOCD_SIG, 0);
            eocd.writeUInt16LE(0, 4);
            eocd.writeUInt16LE(0, 6);
            eocd.writeUInt16LE(count, 8);
            eocd.writeUInt16LE(count, 10);
            eocd.writeUInt32LE(cdSize, 12);
            eocd.writeUInt32LE(cdOffset, 16);
            eocd.writeUInt16LE(0, 20);
            w(eocd);
            closeSync(fd);
            return { path: outPath, count, bytes: offset };
        },
        abort() {
            try {
                closeSync(fd);
            } catch {
                /* ignore */
            }
        },
    };
}

function openZip(path) {
    const fd = openSync(path, 'r');
    const fileSize = statSync(path).size;
    const scan = Math.min(fileSize, 22 + 0xffff);
    const tail = Buffer.alloc(scan);
    readSync(fd, tail, 0, scan, fileSize - scan);
    let rel = -1;
    for (let i = scan - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) === EOCD_SIG) {
            const cl = tail.readUInt16LE(i + 20);
            if (i + 22 + cl === scan) {
                rel = i;
                break;
            }
        }
    }
    if (rel < 0) {
        closeSync(fd);
        throw new Error(`不是有效的 zip：${path}`);
    }
    const count = tail.readUInt16LE(rel + 10);
    const cdSize = tail.readUInt32LE(rel + 12);
    const cdOffset = tail.readUInt32LE(rel + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
        closeSync(fd);
        throw new Error(`ZIP64 暂不受支持：${path}`);
    }
    const cd = Buffer.alloc(cdSize);
    readSync(fd, cd, 0, cdSize, cdOffset);
    const entries = [];
    let p = 0;
    while (p < cdSize) {
        if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error(`中央目录损坏：${path}`);
        const nameLen = cd.readUInt16LE(p + 28);
        const extraLen = cd.readUInt16LE(p + 30);
        const commentLen = cd.readUInt16LE(p + 32);
        const flags = cd.readUInt16LE(p + 8);
        const nameRaw = cd.subarray(p + 46, p + 46 + nameLen);
        entries.push({
            flags,
            method: cd.readUInt16LE(p + 10),
            time: cd.readUInt16LE(p + 12),
            date: cd.readUInt16LE(p + 14),
            crc: cd.readUInt32LE(p + 16),
            csize: cd.readUInt32LE(p + 20),
            usize: cd.readUInt32LE(p + 24),
            localOffset: cd.readUInt32LE(p + 42),
            nameRaw,
            name: decodeName(nameRaw, flags),
            isDir: nameRaw.length > 0 && nameRaw[nameRaw.length - 1] === 0x2f,
        });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return {
        path,
        fd,
        fileSize,
        count,
        entries,
        close() {
            closeSync(fd);
        },
    };
}

function readEntryRaw(zip, e) {
    const lh = Buffer.alloc(30);
    readSync(zip.fd, lh, 0, 30, e.localOffset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`本地头异常：${e.name}`);
    const nameLen = lh.readUInt16LE(26);
    const extraLen = lh.readUInt16LE(28);
    const pos = e.localOffset + 30 + nameLen + extraLen;
    const buf = Buffer.alloc(e.csize);
    readSync(zip.fd, buf, 0, e.csize, pos);
    return buf;
}

function readEntryData(zip, e) {
    const raw = readEntryRaw(zip, e);
    return e.method === 0 ? raw : inflateRawSync(raw);
}

// ─────────────────────────────────────────────────────────────────────────
// 目录枚举 / config 注入 / 补丁断言
// ─────────────────────────────────────────────────────────────────────────
function walkFiles(rootDir, excludeDirs, excludeFiles) {
    const out = [];
    const rec = (absDir, relDir) => {
        const items = readdirSync(absDir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const it of items) {
            const rel = relDir ? `${relDir}/${it.name}` : it.name;
            const abs = join(absDir, it.name);
            if (it.isDirectory()) {
                if (excludeDirs.has(rel)) continue;
                out.push({ rel: rel + '/', abs, isDir: true });
                rec(abs, rel);
            } else if (it.isFile()) {
                if (excludeFiles.has(rel)) continue;
                out.push({ rel, abs, isDir: false });
            }
        }
    };
    rec(rootDir, '');
    return out;
}

const BTS_KEYS = ['extension_崩铁杀_enable', 'extension_崩铁杀_characters_enable', 'extension_崩铁杀_cards_enable'];

// 注意：不注入 extension_崩铁杀_version —— 产物保持“正常首次安装”形态（版本字段由扩展自身逻辑写入，
// 与用户实装/后续以 zip 升级的路径一致）；"不循环"由扩展侧修复逻辑（幂等锁 + 逐键保存）保证。
function injectBtsConfig(text) {
    if (text.includes('崩铁杀')) return { text, injected: false, already: true };
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/); // 兼容混合换行输入
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*"extensions":\s*\[\s*\],?\s*$/.test(lines[i])) {
            idx = i;
            break;
        }
    }
    if (idx < 0) throw new Error('config 中未找到 `"extensions": []` 行，无法预设扩展');
    const indent = lines[idx].match(/^(\s*)/)[1];
    lines.splice(
        idx,
        1,
        `${indent}"extensions": ["崩铁杀"],`,
        ...BTS_KEYS.map((k) => `${indent}"${k}": true,`),
    );
    const out = lines.join(eol);
    JSON.parse(out); // 语法校验
    return { text: out, injected: true };
}

// 将 zip 源（扩展内容）同步到构建树 dist 扩展：dist 里的崩铁杀是“塞入物”，官方构建不会更新它，
// 不同步就会出现“包里带着旧版扩展”的事故。范围 = Directory.json 清单；逐字节比对，只补/更新，不删除。
function syncBtsExtensionToDist({ dryRun }) {
    const extDir = join(CFG.distDir, 'extension', '崩铁杀');
    const manifestPath = join(PATHS.root, 'Directory.json');
    if (!existsSync(manifestPath)) throw new Error('缺少 zip/Directory.json');
    if (!existsSync(extDir)) throw new Error(`构建树缺少扩展目录：${extDir}`);
    const manifest = Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8'))).sort();
    let changed = 0, added = 0, same = 0;
    const dirtyTops = new Map();
    for (const rel of manifest) {
        const src = join(PATHS.root, rel);
        const dst = join(extDir, rel);
        if (!existsSync(src)) continue;
        const srcBuf = readFileSync(src);
        if (existsSync(dst) && readFileSync(dst).equals(srcBuf)) {
            same++;
            continue;
        }
        const dstExists = existsSync(dst);
        if (!dryRun) {
            mkdirSync(dirname(dst), { recursive: true });
            writeFileSync(dst, srcBuf);
        }
        if (dstExists) changed++; else added++;
        const top = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '(根)';
        dirtyTops.set(top, (dirtyTops.get(top) || 0) + 1);
    }
    const detail = [...dirtyTops].map(([k, v]) => `${k}:${v}`).join('、');
    if (changed + added > 0) {
        (dryRun ? say : warn)(`扩展源 → dist 同步（${dryRun ? 'dry-run 预计' : '已写入'}）：更新 ${changed}、新增 ${added} 个文件${detail ? '（' + detail + '）' : ''}`);
    } else {
        say(`扩展源 → dist：一致（${same} 个文件，无需同步）`);
    }
}

function assertPatchedDesktopTree() {
    const idbPath = join(CFG.desktopApp, 'noname', 'game', 'index.js');
    const guardPath = join(CFG.desktopApp, 'noname', 'ui', 'create', 'menu', 'pages', 'exetensionMenu.js');
    const cfgPath = join(CFG.desktopApp, 'game', 'config.json');
    for (const p of [idbPath, guardPath, cfgPath]) {
        if (!existsSync(p)) throw new Error(`缺少桌面树文件：${p}（用 --desktop-app 指定）`);
    }
    if (!readFileSync(idbPath, 'utf8').includes('IndexedDB 操作失败')) throw new Error('桌面树 game/index.js 未含 IDB 补丁（先运行 engine-idb-patch.mjs）');
    if (!readFileSync(guardPath, 'utf8').includes('文件读取失败（可能为存储权限或内存不足）')) throw new Error('桌面树 exetensionMenu.js 未含导入守卫补丁');
    if (readFileSync(cfgPath, 'utf8').includes('崩铁杀')) throw new Error('桌面树 config.json 意外含「崩铁杀」');
    return { idbPath, guardPath, cfgPath };
}

// ─────────────────────────────────────────────────────────────────────────
// APK 工具：签名 / 对齐
// ─────────────────────────────────────────────────────────────────────────
function findBuildTool(exe) {
    const bases = [];
    if (process.env.ANDROID_HOME) bases.push(join(process.env.ANDROID_HOME, 'build-tools'));
    if (process.env.ANDROID_SDK_ROOT) bases.push(join(process.env.ANDROID_SDK_ROOT, 'build-tools'));
    bases.push('C:\\Users\\Admin\\AppData\\Local\\Android\\Sdk\\build-tools');
    for (const base of bases) {
        if (!existsSync(base)) continue;
        const dirs = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(base, d.name)).sort();
        for (let i = dirs.length - 1; i >= 0; i--) {
            const cand = join(dirs[i], exe);
            if (existsSync(cand)) return cand;
        }
    }
    return null;
}

function readKsProps() {
    if (!existsSync(CFG.ksProps)) throw new Error(`签名资料不存在：${CFG.ksProps}`);
    const props = {};
    for (const line of readFileSync(CFG.ksProps, 'utf-8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i > 0) props[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    const ksFile = resolve(join(CFG.ksProps, '..'), props.storeFile || '');
    return { ksFile, alias: props.keyAlias, type: props.storeType || 'pkcs12', pass: props.storePassword || '', keyPass: props.keyPassword || '' };
}

// 注意：Node 20.12+/22 在 Windows 上禁止直接 spawn .bat（EINVAL）——
// apksigner.bat 本质是 `java -jar lib/apksigner.jar`，这里直接调 jar，跨机更稳。
function findApksignerJar() {
    const bat = findBuildTool('apksigner.bat');
    if (!bat) return null;
    const jar = join(bat, '..', 'lib', 'apksigner.jar');
    return existsSync(jar) ? jar : null;
}

function runApksigner(args, extraEnv) {
    const jar = findApksignerJar();
    if (!jar) throw new Error('未找到 apksigner.jar（需要 Android SDK build-tools）');
    return execFileSync('java', ['-jar', jar, ...args], { env: { ...process.env, ...(extraEnv || {}) } });
}

function signApk(apkPath) {
    const ks = readKsProps();
    if (!existsSync(ks.ksFile) || !ks.alias) throw new Error(`签名资料不完整：${CFG.ksProps}`);
    runApksigner(['sign', '--v4-signing-enabled', 'false', '--ks', ks.ksFile, '--ks-type', ks.type, '--ks-key-alias', ks.alias, '--ks-pass', 'env:PACK_KS_PASS', '--key-pass', 'env:PACK_KEY_PASS', apkPath], { PACK_KS_PASS: ks.pass, PACK_KEY_PASS: ks.keyPass });
}

function verifyApk(apkPath) {
    const out = runApksigner(['verify', '--print-certs', apkPath]).toString();
    const certLine = out.split(/\r?\n/).find((l) => l.includes('SHA-256 digest'));
    return certLine ? certLine.trim() : '(无证书行)';
}

// ─────────────────────────────────────────────────────────────────────────
// 打包目录扫描：zip 分类（本体 / 合体 / 其他）
// ─────────────────────────────────────────────────────────────────────────
function classifyZip(path) {
    const z = openZip(path);
    try {
        let rootIndex = false;
        let wrappedIndex = false;
        const segs = new Set();
        for (const e of z.entries) {
            segs.add(e.name.split('/')[0]);
            if (e.name === 'index.html') rootIndex = true;
            if (/^[^/]+\/resources\/app\/index\.html$/.test(e.name)) wrappedIndex = true;
        }
        if (rootIndex) return { kind: 'body', wrapper: '' };
        if (segs.size === 1 && wrappedIndex) return { kind: 'merged', wrapper: [...segs][0] };
        return { kind: 'other', wrapper: '' };
    } finally {
        z.close();
    }
}

function scanZipDir(kinds) {
    if (!existsSync(CFG.bodyDir)) return [];
    const out = [];
    for (const f of readdirSync(CFG.bodyDir, { withFileTypes: true })) {
        if (!f.isFile() || !/\.zip$/i.test(f.name)) continue;
        const p = join(CFG.bodyDir, f.name);
        try {
            const c = classifyZip(p);
            if (kinds.includes(c.kind)) out.push({ path: p, name: f.name, stem: f.name.replace(/\.zip$/i, ''), size: statSync(p).size, ...c });
        } catch (err) {
            warn(`跳过无法解析的 zip：${f.name}（${err.message}）`);
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveFrom(value) {
    if (!value) return null;
    const p = existsSync(value) ? resolve(value) : resolve(join(CFG.bodyDir, value));
    return existsSync(p) ? p : null;
}

// ─────────────────────────────────────────────────────────────────────────
// 电脑基座：候选 / 默认挑选 / 合体
// ─────────────────────────────────────────────────────────────────────────
function listBaseCandidates() {
    if (!CFG.baseDir || !existsSync(CFG.baseDir)) return [];
    return readdirSync(CFG.baseDir, { withFileTypes: true })
        .filter((d) => d.isFile() && /基座.*\.zip$/i.test(d.name))
        .map((d) => join(CFG.baseDir, d.name))
        .sort();
}

function pickDefaultBase() {
    const score = (p) => {
        const name = basename(p);
        const m = name.match(/(\d+(?:\.\d+)*)/);
        return { light: /轻量/.test(name) ? 0 : 1, ver: m ? m[1].split('.').map(Number) : [0] };
    };
    const sorted = listBaseCandidates().slice().sort((a, b) => {
        const sa = score(a);
        const sb = score(b);
        if (sa.light !== sb.light) return sb.light - sa.light;
        for (let i = 0; i < Math.max(sa.ver.length, sb.ver.length); i++) {
            const d = (sb.ver[i] || 0) - (sa.ver[i] || 0);
            if (d) return d;
        }
        return a.localeCompare(b);
    });
    return sorted[0] || null;
}

function wrapperOf(entries) {
    if (!entries.length) return '';
    const segs = new Set(entries.map((e) => e.name.split('/')[0]));
    return segs.size === 1 ? [...segs][0] : '';
}

async function runBaseMerge({ bodyZip, baseZip, dryRun }) {
    if (!existsSync(bodyZip)) throw new Error(`本体包不存在：${bodyZip}`);
    if (!existsSync(baseZip)) throw new Error(`基座包不存在：${baseZip}`);
    const baseStem = basename(baseZip).replace(/\.zip$/i, '');
    const bodyStem = basename(bodyZip).replace(/\.zip$/i, '');
    const out = join(CFG.bodyDir, `${baseStem}_合体_${bodyStem}.zip`);

    const bz = openZip(baseZip);
    const gz = openZip(bodyZip);
    try {
        const wrapper = wrapperOf(bz.entries);
        const prefix = wrapper ? `${wrapper}/resources/app/` : 'resources/app/';
        const baseByName = new Map(bz.entries.map((e) => [e.name, e]));
        const skipBaseNames = new Set();
        const addGame = [];
        const conflicts = [];
        let skipDup = 0;
        let skipDirs = 0;
        for (const ge of gz.entries) {
            const target = prefix + ge.name;
            const be = baseByName.get(target);
            if (!be) {
                addGame.push({ ge, target });
                continue;
            }
            if (ge.isDir) {
                skipDirs++;
                continue;
            }
            if (be.crc === ge.crc && be.usize === ge.usize && be.method === ge.method) {
                skipDup++;
                continue;
            }
            conflicts.push(target);
            skipBaseNames.add(target);
            addGame.push({ ge, target });
        }
        say(`基座：${basename(baseZip)}（${bz.count} 条；wrapper=${wrapper || '(无)'}）`);
        say(`本体：${basename(bodyZip)}（${gz.count} 条）`);
        say(`合并计划：新增 ${addGame.filter((x) => !x.ge.isDir).length} 文件 / ${addGame.filter((x) => x.ge.isDir).length} 目录；与基座完全相同去重 ${skipDup}；目录合并跳过 ${skipDirs}；内容冲突 ${conflicts.length}（本体优先）`);
        for (const c of conflicts.slice(0, 20)) warn(`冲突（本体覆盖基座）：${c}`);
        if (conflicts.length > 20) warn(`… 另有 ${conflicts.length - 20} 个冲突未列出`);
        if (dryRun) {
            say(`[dry-run] 将输出：${out}`);
            return null;
        }
        mkdirSync(CFG.bodyDir, { recursive: true });
        const zw = makeZipWriter(out, { onProgress: (n, off) => say(`  … ${n} 条（${mb(off)}）`) });
        try {
            for (const be of bz.entries) {
                if (skipBaseNames.has(be.name)) continue;
                zw.addRaw(be.nameRaw, be, readEntryRaw(bz, be));
            }
            for (const { ge, target } of addGame) {
                if (ge.isDir) {
                    zw.addDir(target);
                    continue;
                }
                zw.addRaw(Buffer.from(target, 'utf8'), ge, readEntryRaw(gz, ge));
            }
            const st = zw.finish();
            ok(`输出：${out}（${st.count} 条 / ${mb(st.bytes)}）`);
        } catch (err) {
            zw.abort();
            throw err;
        }
        const v = openZip(out);
        try {
            const cfgEntry = v.entries.find((e) => e.name === `${prefix}game/config.json`);
            const cfgBts = cfgEntry ? readEntryData(v, cfgEntry).toString('utf8').includes('崩铁杀') : false;
            const hasExt = v.entries.some((e) => e.name.startsWith(`${prefix}extension/崩铁杀/`));
            const hasIndex = v.entries.some((e) => e.name === `${prefix}index.html`);
            ok(`复核：entry=${v.count}  index.html=${hasIndex ? '✓' : '✗'}  崩铁杀扩展=${hasExt ? '✓' : '—'}  config预设崩铁杀=${cfgBts ? '✓' : '—'}`);
            if (hasExt && !cfgBts) warn('含崩铁杀扩展但 config 未见预设（旧流程产物？）');
        } finally {
            v.close();
        }
        OUTPUTS.push(out);
        return out;
    } finally {
        bz.close();
        gz.close();
    }
}

// ─────────────────────────────────────────────────────────────────────────
// [1] 本体打包
// ─────────────────────────────────────────────────────────────────────────
async function runBodyBuild({ variant, withBts, dryRun }) {
    const ver = detectGameVersion();
    if (!ver) throw new Error('无法从 dist 检测游戏版本（缺少 game/update.js）');
    const suffix = variant === 'full' ? '完全体' : '丐版';
    const out = join(CFG.bodyDir, `${withV(ver)}_${suffix}${withBts ? '_含崩铁杀' : ''}.zip`);
    const { idbPath, guardPath, cfgPath } = assertPatchedDesktopTree();
    let cfgText = readFileSync(cfgPath, 'utf8');
    if (withBts) {
        syncBtsExtensionToDist({ dryRun });
        cfgText = injectBtsConfig(cfgText).text;
    }

    const excludeDirs = new Set();
    const excludeFiles = new Set(['preload.js']);
    if (variant === 'full') {
        if (!withBts) excludeDirs.add('extension/崩铁杀');
    } else {
        // 丐版：去音频 / src / docs / font；图像仅保留卡牌图（image/card），其余图像子目录全剔
        for (const d of ['audio', 'src', 'docs', 'font']) excludeDirs.add(d);
        const imgRoot = join(CFG.distDir, 'image');
        if (existsSync(imgRoot)) {
            for (const sub of readdirSync(imgRoot, { withFileTypes: true })) {
                if (sub.isDirectory() && sub.name !== 'card') excludeDirs.add(`image/${sub.name}`);
            }
        }
        if (!withBts) {
            excludeDirs.add('extension');
        } else {
            const extRoot = join(CFG.distDir, 'extension');
            if (existsSync(extRoot)) {
                for (const sub of readdirSync(extRoot, { withFileTypes: true })) {
                    if (sub.isDirectory() && sub.name !== '崩铁杀') excludeDirs.add(`extension/${sub.name}`);
                }
            }
        }
    }
    if (!existsSync(CFG.distDir)) throw new Error(`构建产物不存在：${CFG.distDir}（先在构建树执行 pnpm build）`);
    const walk = walkFiles(CFG.distDir, excludeDirs, excludeFiles);
    const fileCount = walk.filter((x) => !x.isDir).length;
    say(`本体[${suffix}]：打包 ${fileCount} 个文件（排除 ${[...excludeDirs].join('、') || '（无）'} 与 preload.js）${withBts ? '；含崩铁杀扩展并预设启用' : ''}`);
    if (dryRun) {
        say(`[dry-run] 将输出：${out}`);
        return null;
    }
    mkdirSync(CFG.bodyDir, { recursive: true });
    const zw = makeZipWriter(out, { onProgress: (n, off) => say(`  … ${n} 条（${mb(off)}）`) });
    try {
        for (const item of walk) {
            if (item.isDir) {
                zw.addDir(item.rel);
                continue;
            }
            if (item.rel === 'game/config.json') {
                zw.addBuffer(item.rel, Buffer.from(cfgText, 'utf8'));
                continue;
            }
            if (item.rel === 'noname/game/index.js') {
                zw.addBuffer(item.rel, readFileSync(idbPath));
                continue;
            }
            if (item.rel === 'noname/ui/create/menu/pages/exetensionMenu.js') {
                zw.addBuffer(item.rel, readFileSync(guardPath));
                continue;
            }
            zw.addBuffer(item.rel, readFileSync(item.abs));
        }
        const st = zw.finish();
        ok(`输出：${out}（${st.count} 条 / ${mb(st.bytes)}）`);
    } catch (err) {
        zw.abort();
        throw err;
    }
    OUTPUTS.push(out);
    return out;
}

// ─────────────────────────────────────────────────────────────────────────
// [2] APK 打包：用本体包替换外壳 APK 的游戏内容
// ─────────────────────────────────────────────────────────────────────────
function runGradleRebuild() {
    const mobile = join(CFG.buildTree, 'apps', 'mobile');
    say('重建安卓外壳（pnpm run build:android -- --skip-web-build）…');
    execSync('pnpm run build:android -- --skip-web-build', { cwd: mobile, stdio: 'inherit' });
    if (!existsSync(CFG.apkSrc)) throw new Error(`重建后仍未找到外壳 APK：${CFG.apkSrc}`);
}

async function runApkFromBody({ bodyZip, dryRun, interactive }) {
    const info = classifyZip(bodyZip);
    if (info.kind !== 'body') {
        const what = info.kind === 'merged' ? '含电脑基座的合体包' : '未知格式';
        throw new Error(`APK 打包需要「不含电脑基座」的本体包，但 ${basename(bodyZip)} 判定为：${what}`);
    }
    // 约定：APK 打包前先把 zip 源同步进构建树 dist 扩展（防包内扩展与项目不一致；
    // 同时保证壳层保留的对照基准 dist 与项目一致，重建外壳时也吃到最新扩展）
    syncBtsExtensionToDist({ dryRun });
    if (!existsSync(CFG.apkSrc)) {
        if (interactive && !dryRun) {
            const yes = await confirm(`未找到安卓外壳 APK：\n  ${CFG.apkSrc}\n是否现在重建？（需要几分钟）`, { defaultYes: true });
            if (yes) runGradleRebuild();
        }
        if (!existsSync(CFG.apkSrc)) {
            throw new Error(`外壳 APK 不存在：${CFG.apkSrc}\n请先重建：cd noname-build/apps/mobile && pnpm run build:android -- --skip-web-build（或加 --rebuild）`);
        }
    }
    const ver = detectGameVersion();
    if (!ver) warn('无法检测游戏版本（dist/update.js 缺失），输出名不强制用版本号');
    const stem = basename(bodyZip).replace(/\.zip$/i, '');
    const out = join(CFG.apkDir, `${stem}.apk`);

    // 壳层独有文件 = APK assets/public 内、但构建树 dist 中不存在的文件（如 cordova.js、_pnpm/** 等）；
    // 并强制保留 preload.js —— 手机版 SAF 桥接：entry.js 动态 import('/preload.js') 成功时用它覆写
    // 文件 API（game.checkFile 等）；失败则回退到需 noname_inited 的 cordova 实现而启动崩溃。
    // 它与 dist 的桌面版 preload.js 同名，不强制保留会被误判丢弃（本体包按桌面约定排除 preload.js）。
    const SHELL_ALWAYS_KEEP = new Set(['preload.js']);
    const distSet = new Set(walkFiles(CFG.distDir, new Set(), new Set()).filter((x) => !x.isDir).map((x) => x.rel));
    const extras = [];
    {
        const az = openZip(CFG.apkSrc);
        try {
            for (const e of az.entries) {
                if (!e.name.startsWith('assets/public/') || e.isDir) continue;
                const rel = e.name.slice('assets/public/'.length);
                if (SHELL_ALWAYS_KEEP.has(rel) || !distSet.has(rel)) extras.push({ rel, e });
            }
        } finally {
            az.close();
        }
    }

    // 本体包状态
    const bz0 = openZip(bodyZip);
    let bodyHasBts = false;
    let bodyCfgBts = false;
    try {
        bodyHasBts = bz0.entries.some((e) => e.name.startsWith('extension/崩铁杀/'));
        const ce = bz0.entries.find((e) => e.name === 'game/config.json');
        if (ce) bodyCfgBts = readEntryData(bz0, ce).toString('utf8').includes('崩铁杀');
    } finally {
        bz0.close();
    }
    if (bodyHasBts && !bodyCfgBts) warn('本体包含崩铁杀扩展但 config 未见预设（旧流程产物？）');

    say(`外壳：${basename(CFG.apkSrc)} ｜ 本体：${basename(bodyZip)}（含崩铁杀=${bodyHasBts ? '是' : '否'}）`);
    say(`壳层保留文件 ${extras.length} 个${extras.length ? `（如：${extras.slice(0, 6).map((x) => x.rel).join('、')}${extras.length > 6 ? ' …' : ''}）` : ''}`);
    if (dryRun) {
        say(`[dry-run] 将输出：${out}`);
        return null;
    }
    mkdirSync(CFG.apkDir, { recursive: true });
    const tmp = out + '.tmp';
    const zw = makeZipWriter(tmp, { onProgress: (n, off) => say(`  … ${n} 条（${mb(off)}）`) });
    try {
        // 外壳（除 assets/public 外全部保留）
        const az2 = openZip(CFG.apkSrc);
        try {
            for (const e of az2.entries) {
                if (e.name.startsWith('assets/public/')) continue;
                zw.addRaw(e.nameRaw, e, readEntryRaw(az2, e));
            }
        } finally {
            az2.close();
        }
        // 本体 → assets/public/
        const bz2 = openZip(bodyZip);
        try {
            for (const e of bz2.entries) {
                if (e.isDir) {
                    zw.addDir(`assets/public/${e.name}`);
                    continue;
                }
                zw.addRaw(Buffer.from(`assets/public/${e.name}`, 'utf8'), e, readEntryRaw(bz2, e));
            }
        } finally {
            bz2.close();
        }
        // 壳层保留文件
        const az3 = openZip(CFG.apkSrc);
        try {
            for (const x of extras) {
                zw.addRaw(Buffer.from(`assets/public/${x.rel}`, 'utf8'), x.e, readEntryRaw(az3, x.e));
            }
        } finally {
            az3.close();
        }
        const st = zw.finish();
        say(`重写完成：${st.count} 条 / ${mb(st.bytes)}`);
    } catch (err) {
        zw.abort();
        rmSync(tmp, { force: true });
        throw err;
    }
    const zipalign = findBuildTool('zipalign.exe');
    if (!zipalign) throw new Error('未找到 zipalign（需要 Android SDK build-tools）');
    const aligned = out + '.aligned';
    execFileSync(zipalign, ['-f', '-p', '4', tmp, aligned]);
    rmSync(tmp);
    signApk(aligned);
    rmSync(out, { force: true });
    renameSync(aligned, out);

    // 校验
    const v = openZip(out);
    let cfgMatched = false;
    let hasIndex = false;
    let hasPreload = false;
    let mediaFiles = 0;
    let extFiles = 0;
    try {
        for (const e of v.entries) {
            if (e.name === 'assets/public/index.html') hasIndex = true;
            if (e.name === 'assets/public/preload.js') hasPreload = true;
            if (e.name === 'assets/public/game/config.json') cfgMatched = readEntryData(v, e).toString('utf8').includes('崩铁杀') === bodyCfgBts;
            if (e.name.startsWith('assets/public/audio/') || e.name.startsWith('assets/public/image/')) mediaFiles++;
            if (e.name.startsWith('assets/public/extension/')) extFiles++;
        }
    } finally {
        v.close();
    }
    const cert = verifyApk(out);
    ok(`APK 输出：${out}（${mb(statSync(out).size)}）`);
    ok(`校验：index.html=${hasIndex ? '✓' : '✗'}  preload.js=${hasPreload ? '✓' : '✗（移动端启动必需）'}  config与本体一致=${cfgMatched ? '✓' : '✗'}  媒体文件=${mediaFiles}  扩展文件=${extFiles}`);
    ok(`签名验证：${cert}`);
    OUTPUTS.push(out);
    return out;
}

// ─────────────────────────────────────────────────────────────────────────
// [3] 安装器打包（NSIS）
// ─────────────────────────────────────────────────────────────────────────
function findMakensis() {
    const candidates = [];
    if (PACK_CFG.nsisDir) candidates.push(join(PACK_CFG.nsisDir, 'makensis.exe'), PACK_CFG.nsisDir);
    const toolsDir = join(REPO_ROOT, '_others', 'tools', 'nsis');
    if (existsSync(toolsDir)) {
        for (const sub of readdirSync(toolsDir, { withFileTypes: true })) {
            if (sub.isDirectory()) candidates.push(join(toolsDir, sub.name, 'makensis.exe'));
        }
        candidates.push(join(toolsDir, 'makensis.exe'));
    }
    for (const d of (process.env.PATH || '').split(';').filter(Boolean)) candidates.push(join(d, 'makensis.exe'));
    candidates.push(
        'C:\\Program Files (x86)\\NSIS\\makensis.exe',
        'C:\\Program Files\\NSIS\\makensis.exe',
        'D:\\Program Files\\NSIS\\makensis.exe',
        'D:\\ProgramCode\\NSIS\\makensis.exe',
    );
    for (const c of candidates) {
        try {
            if (existsSync(c) && statSync(c).isFile()) return c;
        } catch {
            /* ignore */
        }
    }
    return null;
}

/** 安装器组件定义（顺序即安装器组件页顺序） */
const COMPONENTS = [
    { key: 'opt_bts', id: 'SecBts', label: '崩铁杀', desc: '安装崩铁杀扩展（含全部专属素材），并自动在游戏中预设启用' },
    { key: 'opt_cardimg', id: 'SecCardimg', label: '无名杀本体卡牌图像', desc: '卡牌图片（image/card）' },
    { key: 'opt_sfx', id: 'SecSfx', label: '无名杀本体音效', desc: '游戏音效与卡牌音效（audio/effect + audio/card）' },
    { key: 'opt_chimg', id: 'SecChimg', label: '无名杀本体角色图像', desc: '武将图片（image/character）' },
    { key: 'opt_voice', id: 'SecVoice', label: '无名杀本体角色语音', desc: '技能配音与阵亡配音（audio/skill + audio/die + audio/voice）' },
    { key: 'opt_ext', id: 'SecExt', label: '无名杀本体扩展', desc: 'extension/ 内官方扩展（不含崩铁杀）' },
];

/** 游戏内容（wrapper 相对路径）→ 组件；其余一律 core */
function routeGameRel(p) {
    if (!p.startsWith('resources/app/')) return 'core';
    const r = p.slice('resources/app/'.length);
    if (r === 'extension/崩铁杀' || r.startsWith('extension/崩铁杀/')) return 'opt_bts';
    if (r.startsWith('extension/')) return 'opt_ext';
    if (r.startsWith('image/card/')) return 'opt_cardimg';
    if (r.startsWith('audio/effect/') || r.startsWith('audio/card/')) return 'opt_sfx';
    if (r.startsWith('image/character/')) return 'opt_chimg';
    if (r.startsWith('audio/skill/') || r.startsWith('audio/die/') || r.startsWith('audio/voice/')) return 'opt_voice';
    return 'core';
}

/** 全部基座候选的 wrapper 相对路径集合（用于判分合体包里的「基座部分」） */
function buildBaseRefSet() {
    const set = new Set();
    for (const p of listBaseCandidates()) {
        try {
            const z = openZip(p);
            try {
                const w = wrapperOf(z.entries);
                if (!w) continue;
                for (const e of z.entries) if (!e.isDir && e.name.startsWith(w + '/')) set.add(e.name.slice(w.length + 1));
            } finally {
                z.close();
            }
        } catch {
            /* 忽略无法解析的基座 */
        }
    }
    return set;
}

function bumpCount(map, key, bytes) {
    const s = map.get(key) || { files: 0, bytes: 0 };
    s.files++;
    s.bytes += bytes;
    map.set(key, s);
}

function mergeCounts(target, src) {
    for (const [k, s] of src) {
        const t = target.get(k) || { files: 0, bytes: 0 };
        t.files += s.files;
        t.bytes += s.bytes;
        target.set(k, t);
    }
}

/** 计划/统计：仅扫中央目录，不写盘。返回 { counts, hasLauncher, baseZip } */
function planInstallerPayload({ info, zipPath, baseZip }) {
    const counts = new Map();
    if (baseZip) {
        const z = openZip(baseZip);
        try {
            for (const e of z.entries) if (!e.isDir) bumpCount(counts, 'core', e.usize);
        } finally {
            z.close();
        }
    }
    const baseRef = info.kind === 'merged' ? buildBaseRefSet() : null;
    const z = openZip(zipPath);
    try {
        for (const e of z.entries) {
            if (e.isDir) continue;
            if (info.kind === 'merged') {
                if (!info.wrapper || !e.name.startsWith(info.wrapper + '/')) continue;
                const dest = e.name.slice(info.wrapper.length + 1);
                bumpCount(counts, baseRef.has(dest) ? 'core' : routeGameRel(dest), e.usize);
            } else {
                bumpCount(counts, routeGameRel('resources/app/' + e.name), e.usize);
            }
        }
    } finally {
        z.close();
    }
    let hasLauncher = false;
    if (baseZip) {
        const z = openZip(baseZip);
        try {
            const w = wrapperOf(z.entries);
            hasLauncher = z.entries.some((e) => e.name === `${w}/noname.exe`);
        } finally {
            z.close();
        }
    }
    return { counts, hasLauncher };
}

/** 解包：mapEntry(name, isDir) → { section, destRel } | null；文件按 section 分流写入 payloadRoot */
function extractZipToPayload({ zipPath, payloadRoot, mapEntry }) {
    const counts = new Map();
    const madeDirs = new Set();
    const z = openZip(zipPath);
    let n = 0;
    try {
        for (const e of z.entries) {
            const m = mapEntry(e.name, e.isDir);
            if (!m || e.isDir) continue;
            if (m.destRel.includes('..')) {
                warn(`跳过可疑路径：${e.name}`);
                continue;
            }
            const destAbs = join(payloadRoot, m.section, m.destRel);
            const dir = dirname(destAbs);
            if (!madeDirs.has(dir)) {
                mkdirSync(dir, { recursive: true });
                madeDirs.add(dir);
            }
            writeFileSync(destAbs, readEntryData(z, e));
            bumpCount(counts, m.section, e.usize);
            n++;
            if (n % 2500 === 0) say(`  … 已解包 ${n} 个文件`);
        }
    } finally {
        z.close();
    }
    return counts;
}

function generateNsi({ tmpRoot, payloadRoot, exePath, displayName, ver, present, hasLauncher, fast, totalBytes }) {
    const viParts = ver.split('.').map((x) => String(Number(x) || 0));
    while (viParts.length < 4) viParts.push('0');
    const vi = viParts.slice(0, 4).join('.');
    const lit = (s) => '"' + String(s).split('$').join('$$') + '"'; // 仅用于外部数据（路径/名称）
    const L = [];
    L.push('; 无名杀安装器脚本（由 pack.mjs 自动生成，请勿手改）');
    L.push('Unicode true');
    L.push('!include "MUI2.nsh"');
    L.push('!include "FileFunc.nsh"');
    L.push('!include "LogicLib.nsh"');
    L.push(`SetCompressor /SOLID ${fast ? 'zlib' : 'lzma'}`);
    L.push(`Name ${lit(displayName)}`);
    L.push(`OutFile ${lit(exePath)}`);
    L.push('RequestExecutionLevel user');
    L.push('InstallDir "C:\\__noname_install_unset__"'); // 哨兵：.onInit 据此判断是否显式传了 /D=
    L.push('ShowInstDetails show');
    L.push('ShowUninstDetails show');
    L.push(`VIProductVersion "${vi}"`);
    L.push('VIAddVersionKey /LANG=2052 "ProductName" "无名杀"');
    L.push(`VIAddVersionKey /LANG=2052 "FileDescription" ${lit(displayName + ' 安装程序')}`);
    L.push(`VIAddVersionKey /LANG=2052 "FileVersion" ${lit(ver)}`);
    L.push(`VIAddVersionKey /LANG=2052 "ProductVersion" ${lit(ver)}`);
    L.push('VIAddVersionKey /LANG=2052 "LegalCopyright" "GPL-3.0 · 崩铁杀（无名杀扩展）"');
    L.push('!define MUI_ABORTWARNING');
    if (hasLauncher) {
        L.push('!define MUI_FINISHPAGE_RUN "$INSTDIR\\noname.exe"');
        L.push('!define MUI_FINISHPAGE_RUN_TEXT "运行：无名杀"');
        L.push('!define MUI_FINISHPAGE_RUN_NOTCHECKED');
    }
    L.push('!insertmacro MUI_PAGE_WELCOME');
    L.push('!define MUI_PAGE_CUSTOMFUNCTION_PRE UpdateSkipDirPage'); // 更新模式跳过目录页
    L.push('!insertmacro MUI_PAGE_DIRECTORY');
    L.push('!insertmacro MUI_PAGE_COMPONENTS');
    L.push('!insertmacro MUI_PAGE_INSTFILES');
    L.push('!insertmacro MUI_PAGE_FINISH');
    L.push('!insertmacro MUI_UNPAGE_CONFIRM');
    L.push('!insertmacro MUI_UNPAGE_INSTFILES');
    L.push('!insertmacro MUI_LANGUAGE "SimpChinese"');
    L.push('');
    L.push('Var UpdateMode ; 1=更新模式（沿用旧目录覆盖）');
    L.push('');
    L.push('Function .onInit');
    L.push('  StrCpy $UpdateMode "0"');
    L.push('  ; 命令行显式 /D=目录（$INSTDIR 非哨兵值）优先，直接沿用');
    L.push('  ${If} $INSTDIR != "C:\\__noname_install_unset__"');
    L.push('    Goto init_done');
    L.push('  ${EndIf}');
    L.push('  ; ——— 更新检测：注册表记录 + 旧目录存在非空 + 确认为无名杀目录 → 自动覆盖更新 ———');
    L.push('  StrCpy $R1 ""');
    L.push('  ReadRegStr $R0 HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀" "InstallLocation"');
    L.push('  ${If} $R0 == ""');
    L.push('    ReadRegStr $R0 HKCU "Software\\无名杀" "InstallDir"');
    L.push('  ${EndIf}');
    L.push('  ${If} $R0 != ""');
    L.push('    StrCpy $R1 $R0');
    L.push('  ${EndIf}');
    L.push('  ${If} $R1 != ""');
    L.push('    StrCpy $R2 "0"');
    L.push('    FindFirst $R3 $R4 "$R1\\*.*" ; 目录存在且非空（跳过 . 与 ..）');
    L.push('    FindLoopPL:');
    L.push('      StrCmp $R4 "" FindDonePL');
    L.push('      StrCmp $R4 "." FindNextPL');
    L.push('      StrCmp $R4 ".." FindNextPL');
    L.push('      StrCpy $R2 "1"');
    L.push('      Goto FindDonePL');
    L.push('    FindNextPL:');
    L.push('      FindNext $R3 $R4');
    L.push('      Goto FindLoopPL');
    L.push('    FindDonePL:');
    L.push('    FindClose $R3');
    L.push('    StrCpy $R5 "0" ; 确认为无名杀安装目录（启动器 / 资源 / 卸载器 任一存在）');
    L.push('    ${If} $R2 == "1"');
    L.push('      IfFileExists "$R1\\noname.exe" 0 +2');
    L.push('        StrCpy $R5 "1"');
    L.push('      IfFileExists "$R1\\resources\\app\\index.html" 0 +2');
    L.push('        StrCpy $R5 "1"');
    L.push('      IfFileExists "$R1\\uninst.exe" 0 +2');
    L.push('        StrCpy $R5 "1"');
    L.push('    ${EndIf}');
    L.push('    ${If} $R5 == "1"');
    L.push('      StrCpy $INSTDIR $R1');
    L.push('      StrCpy $UpdateMode "1"');
    L.push('    ${EndIf}');
    L.push('  ${EndIf}');
    L.push('  ${If} $UpdateMode == "1"');
    L.push('    IfSilent update_ready');
    L.push('    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "检测到已安装的无名杀：$\\r$\\n$INSTDIR$\\r$\\n$\\r$\\n将在此目录上覆盖更新（保留现有文件，不删除旧内容）。$\\r$\\n请先退出正在运行的无名杀；如需更换安装目录，请先卸载旧版本。$\\r$\\n$\\r$\\n继续？" IDOK update_ready');
    L.push('    Quit');
    L.push('    update_ready:');
    L.push('  ${Else}');
    L.push('    ; ——— 全新安装：默认首个非系统盘固定盘 \\noname ———');
    L.push('    StrCpy $R0 ""');
    L.push('    StrCpy $R6 "$WINDIR" 1 ; 系统盘符（如 C）');
    L.push('    ${GetDrives} "HDD" "FindFixedDrive"');
    L.push('    ${If} $R0 == ""');
    L.push('      StrCpy $R0 "$WINDIR" 2 ; 无其他固定盘 → 系统盘');
    L.push('    ${EndIf}');
    L.push('    StrCpy $INSTDIR "$R0\\noname"');
    L.push('  ${EndIf}');
    L.push('  init_done:');
    L.push('FunctionEnd');
    L.push('');
    L.push('Function UpdateSkipDirPage');
    L.push('  ${If} $UpdateMode == "1"');
    L.push('    Abort ; 更新模式：自动沿用旧目录，跳过目录选择页');
    L.push('  ${EndIf}');
    L.push('FunctionEnd');
    L.push('');
    L.push('Function FindFixedDrive');
    L.push('  ; $9 = 盘符（如 D:\\）；GetDrives 回调必须 Push 一个值：空串继续 / StopGetDrives 结束');
    L.push('  ${If} $R0 == ""');
    L.push('    StrCpy $R7 "$9" 1');
    L.push('    ${If} $R7 != "$R6"');
    L.push('      StrCpy $R0 $9 -1 ; 去掉尾部反斜杠，得到 D: 形态');
    L.push('      Push "StopGetDrives"');
    L.push('      Return');
    L.push('    ${EndIf}');
    L.push('  ${EndIf}');
    L.push('  Push ""');
    L.push('FunctionEnd');
    L.push('');
    L.push('; 更新=覆写模式：同名文件直接覆盖，不删除旧目录中的其他文件');
    L.push('SetOverwrite on');
    L.push('');
    L.push('Section "无名杀本体（必需）" SecCore');
    L.push('  SectionIn RO');
    L.push('  SetOutPath "$INSTDIR"');
    L.push('  File /r ' + lit(join(payloadRoot, 'core') + '\\*.*'));
    L.push('SectionEnd');
    for (const c of present) {
        L.push('');
        L.push(`Section ${lit(`${c.label}（${mb(c.bytes)}）`)} ${c.id}`);
        L.push('  SetOutPath "$INSTDIR"');
        L.push('  File /r ' + lit(join(payloadRoot, c.key) + '\\*.*'));
        L.push('SectionEnd');
    }
    if (hasLauncher) {
        L.push('');
        L.push('Section "桌面快捷方式" SecDesk');
        L.push('  CreateShortCut "$DESKTOP\\无名杀.lnk" "$INSTDIR\\noname.exe"');
        L.push('SectionEnd');
    }
    L.push('');
    L.push('Section -post');
    if (hasLauncher) {
        L.push('  CreateDirectory "$SMPROGRAMS\\无名杀"');
        L.push('  CreateShortCut "$SMPROGRAMS\\无名杀\\无名杀.lnk" "$INSTDIR\\noname.exe"');
    }
    L.push('  WriteUninstaller "$INSTDIR\\uninst.exe"');
    L.push('  CreateShortCut "$SMPROGRAMS\\无名杀\\卸载 无名杀.lnk" "$INSTDIR\\uninst.exe"');
    L.push('  WriteRegStr HKCU "Software\\无名杀" "InstallDir" "$INSTDIR"');
    L.push(`  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀" "DisplayName" ${lit(displayName)}`);
    if (hasLauncher) L.push('  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀" "DisplayIcon" "$INSTDIR\\noname.exe"');
    L.push('  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀" "UninstallString" "$INSTDIR\\uninst.exe"');
    L.push('  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀" "InstallLocation" "$INSTDIR"');
    L.push('  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀" "Publisher" "崩铁杀（无名杀扩展）"');
    L.push(`  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀" "DisplayVersion" ${lit(ver)}`);
    L.push(`  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀" "EstimatedSize" ${Math.max(1, Math.round(totalBytes / 1024))}`);
    L.push('SectionEnd');
    L.push('');
    L.push('Section "Uninstall"');
    L.push('  Delete "$DESKTOP\\无名杀.lnk"');
    L.push('  Delete "$SMPROGRAMS\\无名杀\\无名杀.lnk"');
    L.push('  Delete "$SMPROGRAMS\\无名杀\\卸载 无名杀.lnk"');
    L.push('  RMDir "$SMPROGRAMS\\无名杀"');
    L.push('  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\无名杀"');
    L.push('  DeleteRegKey HKCU "Software\\无名杀"');
    L.push('  RMDir /r "$INSTDIR"');
    L.push('SectionEnd');
    L.push('');
    L.push('!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN');
    for (const c of present) L.push(`  !insertmacro MUI_DESCRIPTION_TEXT \${${c.id}} ${lit(c.desc)}`);
    if (hasLauncher) L.push('  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesk} "在桌面创建 无名杀 的快捷方式"');
    L.push('!insertmacro MUI_FUNCTION_DESCRIPTION_END');
    const nsiPath = join(tmpRoot, 'setup.nsi');
    writeFileSync(nsiPath, '\ufeff' + L.join('\r\n'), 'utf8');
    return nsiPath;
}

async function runInstallerBuild({ zipPath, baseZip, dryRun, fast }) {
    const info = classifyZip(zipPath);
    if (!['body', 'merged'].includes(info.kind)) throw new Error(`无法识别的本体包：${basename(zipPath)}（既无根 index.html，也非单层 wrapper 合体包）`);
    if (info.kind === 'merged' && baseZip) warn('所选为已合体包，--base 将被忽略');
    let base = info.kind === 'body' ? (baseZip || pickDefaultBase()) : null;
    if (info.kind === 'body') {
        if (!base || !existsSync(base)) throw new Error(`需要电脑基座但未找到可用基座（目录：${CFG.baseDir || '(未配置)'}），可用 --base 指定`);
    }
    const stem = basename(zipPath).replace(/\.zip$/i, '');
    const exeOut = join(CFG.setupDir, `${stem}_安装器.exe`);
    const verGuess = detectGameVersion() || ((stem.match(/(\d+\.\d+(?:\.\d+)*)/) || [])[1] || '0.0');
    const m = stem.match(/^v?(\d+\.\d+(?:\.\d+)*)_(.+)$/);
    const displayName = m ? `无名杀 ${m[1]}（${m[2].split('_').join(' · ')}）` : `无名杀（${stem}）`;
    const ver = m ? m[1] : verGuess;

    const { counts, hasLauncher } = planInstallerPayload({ info, zipPath, baseZip: base });
    const totalBytes = [...counts.values()].reduce((sum, s) => sum + s.bytes, 0);
    const present = COMPONENTS.filter((c) => counts.has(c.key)).map((c) => ({ ...c, ...counts.get(c.key) }));
    const core = counts.get('core') || { files: 0, bytes: 0 };

    say(`安装器计划：${displayName}`);
    say(`  载体包：${basename(zipPath)}（${info.kind === 'merged' ? '含电脑基座' : '不含基座'}）${base ? ` ｜ 补基座：${basename(base)}` : ''}`);
    say(`  核心：${core.files} 文件（${mb(core.bytes)})；总解包 ${mb(totalBytes)}`);
    for (const c of present) say(`  组件[${c.label}]：${c.files} 文件（${mb(c.bytes)}）`);
    const missing = COMPONENTS.filter((c) => !counts.has(c.key)).map((c) => c.label);
    if (missing.length) say(`  包中不存在（不显示）：${missing.join('、')}`);
    if (!hasLauncher) warn('基座中未找到 noname.exe，安装器将不创建快捷方式/启动项');
    if (dryRun) {
        say(`[dry-run] 将输出：${exeOut}`);
        return null;
    }

    const nsis = findMakensis();
    if (!nsis) {
        throw new Error('未找到 NSIS makensis.exe。\n· 可放置到 _others/tools/nsis/<版本>/makensis.exe\n· 或在 dev-config.local.json 的 pack.nsisDir 指定\n· 或安装 NSIS 后重试（本项目已含 _others/tools/nsis/nsis-3.11）');
    }
    mkdirSync(CFG.setupDir, { recursive: true });
    const tmpRoot = join(REPO_ROOT, '_others', '.tmp_installer', stem);
    rmSync(tmpRoot, { recursive: true, force: true });
    const payloadRoot = join(tmpRoot, 'payload');
    mkdirSync(payloadRoot, { recursive: true });
    const t0 = Date.now();
    try {
        const stats = new Map();
        if (base) {
            say(`解包基座 → payload：${basename(base)}`);
            const w = (() => {
                const z = openZip(base);
                try {
                    return wrapperOf(z.entries);
                } finally {
                    z.close();
                }
            })();
            if (!w) throw new Error(`基座缺少单一顶层目录结构：${base}`);
            const c = extractZipToPayload({
                zipPath: base,
                payloadRoot,
                mapEntry: (name) => (name.startsWith(w + '/') ? { section: 'core', destRel: name.slice(w.length + 1) } : null),
            });
            mergeCounts(stats, c);
        }
        say(`解包本体 → payload：${basename(zipPath)}`);
        if (info.kind === 'merged') {
            const baseRef = buildBaseRefSet();
            const c = extractZipToPayload({
                zipPath,
                payloadRoot,
                mapEntry: (name) => {
                    if (!name.startsWith(info.wrapper + '/')) return null;
                    const dest = name.slice(info.wrapper.length + 1);
                    return { section: baseRef.has(dest) ? 'core' : routeGameRel(dest), destRel: dest };
                },
            });
            mergeCounts(stats, c);
        } else {
            const c = extractZipToPayload({
                zipPath,
                payloadRoot,
                mapEntry: (name) => ({ section: routeGameRel('resources/app/' + name), destRel: 'resources/app/' + name }),
            });
            mergeCounts(stats, c);
        }
        const extractSecs = ((Date.now() - t0) / 1000).toFixed(1);
        say(`解包完成（${extractSecs} 秒），生成 NSIS 脚本并编译…`);
        const nsiPath = generateNsi({
            tmpRoot,
            payloadRoot,
            exePath: exeOut,
            displayName,
            ver,
            present,
            hasLauncher,
            fast,
            totalBytes,
        });
        const t1 = Date.now();
        let makensisOut = '';
        try {
            makensisOut = execFileSync(nsis, ['/V2', nsiPath], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
        } catch (err) {
            const lines = String((err && (err.stdout || err.stderr)) || err.message).split(/\r?\n/);
            throw new Error(`makensis 编译失败：\n  ${lines.slice(-12).join('\n  ')}`);
        }
        const compileSecs = ((Date.now() - t1) / 1000).toFixed(1);
        const warnLines = makensisOut.split(/\r?\n/).filter((l) => /warning/i.test(l)).slice(0, 8);
        for (const w2 of warnLines) warn(`makensis: ${w2.trim()}`);
        if (!existsSync(exeOut)) throw new Error(`makensis 完成但未生成：${exeOut}`);
        ok(`安装器输出：${exeOut}（${mb(statSync(exeOut).size)}；编译 ${compileSecs} 秒，压缩=${fast ? 'zlib' : 'lzma'}）`);
        OUTPUTS.push(exeOut);
        return exeOut;
    } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
        say('临时载荷已清理（安装器目录无 zip 残留）');
    }
}

// ─────────────────────────────────────────────────────────────────────────
// 交互菜单
// ─────────────────────────────────────────────────────────────────────────
async function interactiveBody() {
    const v = await menu('本体打包\n请选择类型', [
        { label: '① 完全体：官方扩展 + 全部媒体（发行完整内容）', value: 'full' },
        { label: '② 丐版：无音频/扩展/src/docs/font（保留卡牌图像 image/card）', value: 'slim' },
    ]);
    if (!v) return;
    const withBts = await confirm('是否包含崩铁杀扩展？（将打入扩展并预设启用）', { defaultYes: false });
    const withBase = await confirm('是否包含电脑基座？', { defaultYes: false });
    let baseZip = null;
    if (withBase) {
        const cands = listBaseCandidates();
        if (cands.length) {
            const dflt = pickDefaultBase();
            const pick = await menu(
                '请选择电脑基座包（直接回车＝默认项）',
                [
                    ...cands.map((p) => ({ label: `${basename(p)}（${mb(statSync(p).size)}）${p === dflt ? '（默认）' : ''}`, value: p })),
                    { label: '手动输入路径…', value: '__manual__' },
                ],
                { defaultIndex: Math.max(0, cands.indexOf(dflt)) },
            );
            if (!pick) return;
            baseZip = pick.value === '__manual__' ? await prompt('请输入电脑基座 zip 完整路径: ', { required: true }) : pick.value;
        } else {
            baseZip = await prompt('未找到电脑基座包，请输入完整路径: ', { required: true });
        }
        if (!baseZip || !existsSync(baseZip)) {
            warn('基座路径无效，已跳过合体步骤');
            baseZip = null;
        }
    }
    const bodyZip = await runBodyBuild({ variant: v.value, withBts, dryRun: false });
    if (baseZip && bodyZip) await runBaseMerge({ bodyZip, baseZip, dryRun: false });
}

async function interactiveApk() {
    const cands = scanZipDir(['body']);
    if (!cands.length) {
        warn(`「本体打包」目录没有可用本体包：${CFG.bodyDir}\n请先执行 [1] 本体打包（不要勾选电脑基座）`);
        return;
    }
    const pick = await menu(
        'APK 打包\n请选择本体包（不含电脑基座）',
        cands.map((c) => ({ label: `${c.name}（${mb(c.size)}）`, value: c.path })),
    );
    if (!pick) return;
    await runApkFromBody({ bodyZip: pick.value, dryRun: false, interactive: true });
}

async function interactiveInstaller() {
    const cands = scanZipDir(['body', 'merged']);
    if (!cands.length) {
        warn(`「本体打包」目录没有可用包：${CFG.bodyDir}\n请先执行 [1] 本体打包`);
        return;
    }
    const pick = await menu(
        '安装器打包\n请选择本体包（无基座将自动补）',
        cands.map((c) => ({ label: `${c.name}（${mb(c.size)}）${c.kind === 'merged' ? '（含电脑基座）' : ''}`, value: c.path })),
    );
    if (!pick) return;
    await runInstallerBuild({ zipPath: pick.value, baseZip: null, dryRun: false, fast: false });
}

async function interactiveFlow() {
    const kind = await menu('崩铁杀 · 一键打包\n请选择打包类型', [
        { label: '1. 本体打包（电脑 / 网页 / 后续 APK 与安装器的原料）', value: 'body' },
        { label: '2. APK 打包（安卓；从本体打包目录选包封装）', value: 'apk' },
        { label: '3. 安装器打包（Windows 安装向导 exe）', value: 'installer' },
    ]);
    if (!kind) return;
    if (kind.value === 'body') await interactiveBody();
    else if (kind.value === 'apk') await interactiveApk();
    else if (kind.value === 'installer') await interactiveInstaller();
}

// ─────────────────────────────────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────────────────────────────────
function printUsage() {
    console.log(`崩铁杀 · 一键打包（本体 / APK / 安装器）
用法：
  node scripts/pack.mjs                                       交互菜单（npm run pack）
  node scripts/pack.mjs body --variant full|slim [--with-bts] [--base <基座zip>|--with-base] [--dry-run]
        ① full=完全体 / slim=丐版；--with-bts 含崩铁杀（扩展+预设）；
        --base 指定基座合体；--with-base 自动挑默认基座合体
  node scripts/pack.mjs apk --from <本体包zip> [--rebuild] [--dry-run]
        将所选本体包封装为安卓 APK（--rebuild 先全量重建外壳）
  node scripts/pack.mjs installer --from <zip> [--fast] [--dry-run]
        生成 NSIS 安装向导（--fast 用 zlib 压缩换速度；默认 lzma 更小）
  node scripts/pack.mjs bases                                 列出可用电脑基座包
可选：--out/--build-tree/--desktop-app/--base-dir/--apk-src/--ks-props 覆盖路径（见文件头注释）。
输出：默认写入 <仓库>/_others/打包目录/{本体打包|APK打包|安装器打包}。`);
}

async function main() {
    if (flags.has('--help') || flags.has('-h')) {
        printUsage();
        return;
    }
    if (!SUB) {
        await interactiveFlow();
        return;
    }
    if (SUB === 'bases') {
        const cands = listBaseCandidates();
        if (!cands.length) {
            warn(`未找到电脑基座包（目录：${CFG.baseDir || '(未配置)'}）`);
            return;
        }
        say('可用电脑基座包（默认 = 首个）：');
        const dflt = pickDefaultBase();
        for (const p of cands) console.log(`  ${p}（${mb(statSync(p).size)}）${p === dflt ? '  ← 默认' : ''}`);
        return;
    }
    if (SUB === 'body') {
        const variant = opts['--variant'] || 'full';
        if (!['full', 'slim'].includes(variant)) throw new Error(`未知 --variant：${variant}（full|slim）`);
        const withBts = flags.has('--with-bts');
        let baseZip = opts['--base'] ? resolve(opts['--base']) : null;
        if (flags.has('--with-base') && !baseZip) {
            baseZip = pickDefaultBase();
            if (!baseZip) throw new Error('未找到可用电脑基座包（--base-dir 或 dev-config 未配置）');
        }
        if (baseZip && !existsSync(baseZip)) throw new Error(`基座包不存在：${baseZip}`);
        const bodyZip = await runBodyBuild({ variant, withBts, dryRun: DRY });
        if (baseZip) {
            if (DRY) say(`[dry-run] 将合体：${basename(baseZip)} + ${bodyZip || '(drystub)'}`);
            else await runBaseMerge({ bodyZip, baseZip, dryRun: false });
        }
        return;
    }
    if (SUB === 'apk') {
        if (flags.has('--rebuild')) {
            if (DRY) say('[dry-run] 将执行 pnpm run build:android -- --skip-web-build');
            else runGradleRebuild();
        }
        const from = resolveFrom(opts['--from']);
        if (!from) {
            const cands = scanZipDir(['body']);
            say('可用本体包（--from 传入名称或路径）：');
            for (const c of cands) console.log(`  ${c.name}（${mb(c.size)}）`);
            if (!cands.length) warn(`（目录为空：${CFG.bodyDir}；先执行 node scripts/pack.mjs body …）`);
            throw new Error('缺少 --from <本体包zip>');
        }
        await runApkFromBody({ bodyZip: from, dryRun: DRY, interactive: false });
        return;
    }
    if (SUB === 'installer') {
        const from = resolveFrom(opts['--from']);
        if (!from) {
            const cands = scanZipDir(['body', 'merged']);
            say('可用包（--from 传入名称或路径）：');
            for (const c of cands) console.log(`  ${c.name}（${mb(c.size)}）${c.kind === 'merged' ? '（含电脑基座）' : ''}`);
            if (!cands.length) warn(`（目录为空：${CFG.bodyDir}；先执行 node scripts/pack.mjs body …）`);
            throw new Error('缺少 --from <zip>');
        }
        const baseZip = opts['--base'] ? resolve(opts['--base']) : null;
        if (baseZip && !existsSync(baseZip)) throw new Error(`基座包不存在：${baseZip}`);
        await runInstallerBuild({ zipPath: from, baseZip, dryRun: DRY, fast: flags.has('--fast') });
        return;
    }
    throw new Error(`未知子命令：${SUB}（可用：body | apk | installer | bases）`);
}

main()
    .then(() => {
        if (OUTPUTS.length) {
            console.log('');
            say('本次输出：');
            for (const p of OUTPUTS) console.log(`  ${p}`);
        }
    })
    .catch((err) => {
        fail(err && err.message ? err.message : String(err));
        process.exitCode = 1;
    })
    .finally(() => {
        closeInteractive();
    });
