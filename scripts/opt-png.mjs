#!/usr/bin/env node

/**
 * 崩铁杀 PNG 优化脚本
 *
 * 移植自 _others/microtools/PNGfix.pyw，并扩展：
 * - 默认【无损】模式：剥除元数据块（tEXt/zTXt/iTXt/eXIf/tIME 等），保留色彩关键块，
 *   IDAT 采用「永不变大」重压（解压现有滤波流后以 level 9 重新压缩，取更小者）。
 *   当前素材已是最优压缩，主要收益是剔除未来从 PSD 导出的 Photoshop 元数据。
 * - 可选【有损】模式（--lossy）：仅对 colorType 2 的 RGB 图做 256 色中值切割量化 +
 *   Floyd-Steinberg 抖动，编码为调色板 PNG（colorType 3）。实测单张立绘约省 50-66%，
 *   但会改变画风，须先经 --out 输出副本肉眼验收后再原地应用（git 可还原）。
 *
 * 用法:
 *   node scripts/opt-png.mjs                无损优化 image/ 下全部 PNG
 *   node scripts/opt-png.mjs --dry-run      仅预览可省多少
 *   node scripts/opt-png.mjs --check        校验：存在元数据块或可再压 >1% 则退出 1
 *   node scripts/opt-png.mjs --lossy        有损量化（仅 RGB 图）
 *   node scripts/opt-png.mjs --out <目录>   输出副本到指定目录（验收用，不覆盖原图）
 *   node scripts/opt-png.mjs --dir <目录>   指定扫描目录（默认 image/）
 */

import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { log } from './lib/shared.mjs';
import { menu, prompt, closeInteractive } from './lib/interactive.mjs';
import { crc32 } from './lib/crc32.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SELF_PATH = fileURLToPath(import.meta.url);

const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** 保留下来的色彩关键附属块（其余附属块视为元数据剔除） */
const KEEP_ANCILLARY = new Set([
    'iCCP',
    'gAMA',
    'sRGB',
    'pHYs',
    'bKGD',
    'sBIT',
    'sPLT',
    'hIST',
    'cHRM',
]);

/** 解析 PNG 块 */
function parseChunks(buf) {
    const chunks = [];
    let i = 8;
    while (i + 12 <= buf.length) {
        const len = buf.readUInt32BE(i);
        const type = buf.subarray(i + 4, i + 8).toString('latin1');
        chunks.push({ type, data: buf.subarray(i + 8, i + 8 + len) });
        i += 12 + len;
    }
    return chunks;
}

/** 组装单个 PNG 块（含 CRC32） */
function buildChunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    data.copy(out, 8); // 数据区从偏移 8 开始：len(4) + type(4) + data + crc(4)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}

/** 读取 IHDR 关键字段 */
function readIHDR(chunks) {
    const ihdr = chunks.find((c) => c.type === 'IHDR');
    if (!ihdr || ihdr.data.length < 13) throw new Error('缺少 IHDR');
    const d = ihdr.data;
    return {
        width: d.readUInt32BE(0),
        height: d.readUInt32BE(4),
        bitDepth: d[8],
        colorType: d[9],
        interlace: d[12],
    };
}

/**
 * 无损优化：剥元数据块 + IDAT 永不变大重压
 * 仅在确有收益时重建文件：剔除了元数据块，或 IDAT 重压后更小。
 * 其余情况原样返回（changed=false），保证已是最优的资源不会被无谓改写。
 * @returns {{buf:Buffer, changed:boolean, dropped:string[], recompressible:boolean}}
 */
function losslessOptimize(buf) {
    const chunks = parseChunks(buf);
    const dropped = [];
    const kept = [];
    const idatParts = [];
    for (const c of chunks) {
        if (c.type === 'IDAT') {
            idatParts.push(c.data);
        } else if (c.type === 'IEND') {
            continue;
        } else if (/^[a-z]/.test(c.type) && !KEEP_ANCILLARY.has(c.type)) {
            dropped.push(c.type); // 附属元数据块
        } else {
            kept.push(c);
        }
    }

    // 有元数据块：重建文件，IDAT 原样保留，仅剔除元数据
    if (dropped.length > 0) {
        const parts = [PNG_SIGNATURE];
        for (const c of kept)
            parts.push(buildChunk(c.type, Buffer.from(c.data)));
        for (const d of idatParts)
            parts.push(buildChunk('IDAT', Buffer.from(d)));
        parts.push(buildChunk('IEND', Buffer.alloc(0)));
        return {
            buf: Buffer.concat(parts),
            changed: true,
            dropped,
            recompressible: false,
        };
    }

    // 无元数据：尝试 IDAT 永不变大重压（取更小者，否则原样返回）
    const origIdat = Buffer.concat(idatParts);
    let recompressible = false;
    try {
        const recomp = deflateSync(inflateSync(origIdat), { level: 9 });
        if (recomp.length < origIdat.length) recompressible = true;
    } catch {
        // 无法解压则保持原样
    }
    if (!recompressible)
        return { buf, changed: false, dropped, recompressible };

    const parts = [PNG_SIGNATURE];
    for (const c of kept) parts.push(buildChunk(c.type, Buffer.from(c.data)));
    parts.push(
        buildChunk('IDAT', deflateSync(inflateSync(origIdat), { level: 9 })),
    );
    parts.push(buildChunk('IEND', Buffer.alloc(0)));
    return {
        buf: Buffer.concat(parts),
        changed: true,
        dropped,
        recompressible,
    };
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

/** 解包 IDAT 为逐行原始像素 */
function decodeRows(raw, width, height, bpp) {
    const rowLen = width * bpp;
    const rows = [];
    const prev = new Uint8Array(rowLen);
    let off = 0;
    for (let y = 0; y < height; y++) {
        const f = raw[off++];
        const row = new Uint8Array(rowLen);
        for (let i = 0; i < rowLen; i++) {
            let x = raw[off + i];
            const a = i >= bpp ? row[i - bpp] : 0;
            const b = prev[i];
            const c = i >= bpp ? prev[i - bpp] : 0;
            if (f === 1) x = (x + a) & 0xff;
            else if (f === 2) x = (x + b) & 0xff;
            else if (f === 3) x = (x + ((a + b) >> 1)) & 0xff;
            else if (f === 4) x = (x + paeth(a, b, c)) & 0xff;
            row[i] = x;
        }
        rows.push(row);
        prev.set(row);
        off += rowLen;
    }
    return rows;
}

/** 加权中值切割，得到 n 色调色板（返回 [r,g,b] 数组） */
function medianCut(pixels, target) {
    const split = (box) => {
        let minR = 255,
            minG = 255,
            minB = 255,
            maxR = 0,
            maxG = 0,
            maxB = 0,
            sum = 0;
        for (const p of box) {
            sum += p.w;
            if (p.r < minR) minR = p.r;
            if (p.g < minG) minG = p.g;
            if (p.b < minB) minB = p.b;
            if (p.r > maxR) maxR = p.r;
            if (p.g > maxG) maxG = p.g;
            if (p.b > maxB) maxB = p.b;
        }
        const span = Math.max(maxR - minR, maxG - minG, maxB - minB);
        const axis =
            maxR - minR >= maxG - minG && maxR - minR >= maxB - minB
                ? 0
                : maxG - minG >= maxB - minB
                  ? 1
                  : 2;
        return { box, score: span * sum, axis };
    };

    const scored = [split(pixels)];
    while (scored.length < target) {
        let bi = -1,
            bs = -1;
        for (let i = 0; i < scored.length; i++) {
            if (scored[i].score > bs) {
                bs = scored[i].score;
                bi = i;
            }
        }
        if (bi < 0 || bs <= 0) break;
        const { box, axis } = scored.splice(bi, 1)[0];
        if (box.length < 2) {
            scored.push({ box, score: 0, axis });
            continue;
        }
        box.sort(
            (p, q) =>
                p[axis === 0 ? 'r' : axis === 1 ? 'g' : 'b'] -
                q[axis === 0 ? 'r' : axis === 1 ? 'g' : 'b'],
        );
        let total = 0;
        for (const p of box) total += p.w;
        let sum = 0,
            mid = 0;
        for (; mid < box.length; mid++) {
            sum += box[mid].w;
            if (sum >= total / 2) break;
        }
        mid = Math.max(1, Math.min(box.length - 1, mid));
        scored.push(split(box.slice(0, mid)), split(box.slice(mid)));
    }

    return scored.map(({ box }) => {
        let r = 0,
            g = 0,
            bl = 0,
            sum = 0;
        for (const p of box) {
            r += p.r * p.w;
            g += p.g * p.w;
            bl += p.b * p.w;
            sum += p.w;
        }
        if (!sum) sum = 1;
        return [Math.round(r / sum), Math.round(g / sum), Math.round(bl / sum)];
    });
}

/** 构建 5-5-5 色立方 → 调色板索引 的最近色查找表（32768 项） */
function buildNearestMap(palette) {
    const map = new Uint16Array(32768);
    for (let r = 0; r < 32; r++) {
        for (let g = 0; g < 32; g++) {
            for (let b = 0; b < 32; b++) {
                const rv = (r << 3) + 4,
                    gv = (g << 3) + 4,
                    bv = (b << 3) + 4;
                let best = 0,
                    bd = Infinity;
                for (let i = 0; i < palette.length; i++) {
                    const dr = palette[i][0] - rv,
                        dg = palette[i][1] - gv,
                        db = palette[i][2] - bv;
                    const d = dr * dr + dg * dg + db * db;
                    if (d < bd) {
                        bd = d;
                        best = i;
                    }
                }
                map[(r << 10) | (g << 5) | b] = best;
            }
        }
    }
    return map;
}

/** 量化 + Floyd-Steinberg 抖动，返回索引数组 */
function quantizeRows(rows, width, height, bpp, palette, nearestMap) {
    const data = rows.map((r) => Uint8Array.from(r));
    const indices = new Uint8Array(width * height);
    const addErr = (row, off, er, eg, eb) => {
        row[off] = Math.max(0, Math.min(255, Math.round(row[off] + er)));
        row[off + 1] = Math.max(
            0,
            Math.min(255, Math.round(row[off + 1] + eg)),
        );
        row[off + 2] = Math.max(
            0,
            Math.min(255, Math.round(row[off + 2] + eb)),
        );
    };
    for (let y = 0; y < height; y++) {
        const row = data[y];
        for (let x = 0; x < width; x++) {
            const o = x * bpp;
            const r = row[o],
                g = row[o + 1],
                b = row[o + 2];
            const idx =
                nearestMap[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
            indices[y * width + x] = idx;
            const pr = palette[idx][0],
                pg = palette[idx][1],
                pb = palette[idx][2];
            const er = r - pr,
                eg = g - pg,
                eb = b - pb;
            if (x + 1 < width)
                addErr(
                    row,
                    o + bpp,
                    (er * 7) / 16,
                    (eg * 7) / 16,
                    (eb * 7) / 16,
                );
            if (y + 1 < height) {
                if (x - 1 >= 0)
                    addErr(
                        data[y + 1],
                        (x - 1) * bpp,
                        (er * 3) / 16,
                        (eg * 3) / 16,
                        (eb * 3) / 16,
                    );
                addErr(
                    data[y + 1],
                    x * bpp,
                    (er * 5) / 16,
                    (eg * 5) / 16,
                    (eb * 5) / 16,
                );
                if (x + 1 < width)
                    addErr(
                        data[y + 1],
                        (x + 1) * bpp,
                        er / 16,
                        eg / 16,
                        eb / 16,
                    );
            }
        }
    }
    return indices;
}

/** 编码为调色板 PNG（colorType 3, bit 8） */
function encodePalettePng(width, height, palette, indices) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 3;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const plte = Buffer.alloc(palette.length * 3);
    palette.forEach((c, i) => {
        plte[i * 3] = c[0];
        plte[i * 3 + 1] = c[1];
        plte[i * 3 + 2] = c[2];
    });
    const raw = Buffer.alloc((width + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width + 1)] = 0;
        raw.set(
            indices.subarray(y * width, (y + 1) * width),
            y * (width + 1) + 1,
        );
    }
    const idat = deflateSync(raw, { level: 9 });
    return Buffer.concat([
        PNG_SIGNATURE,
        buildChunk('IHDR', ihdr),
        buildChunk('PLTE', plte),
        buildChunk('IDAT', idat),
        buildChunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * 有损优化：仅支持 colorType 2、8bit、非隔行 RGB 图
 * @returns {{buf:Buffer, changed:boolean, paletteColors:number}|{skip:string}}
 */
function lossyOptimize(buf) {
    const chunks = parseChunks(buf);
    const ihdr = readIHDR(chunks);
    if (ihdr.colorType !== 2)
        return { skip: `colorType ${ihdr.colorType} 不支持，跳过` };
    if (ihdr.bitDepth !== 8)
        return { skip: `bitDepth ${ihdr.bitDepth} 不支持，跳过` };
    if (ihdr.interlace !== 0) return { skip: '隔行图不支持，跳过' };

    const idat = Buffer.concat(
        chunks.filter((c) => c.type === 'IDAT').map((c) => c.data),
    );
    const rows = decodeRows(inflateSync(idat), ihdr.width, ihdr.height, 3);

    // 颜色直方图（中值切割输入）
    const hist = new Map();
    for (const row of rows) {
        for (let i = 0; i < row.length; i += 3) {
            const key = (row[i] << 16) | (row[i + 1] << 8) | row[i + 2];
            hist.set(key, (hist.get(key) || 0) + 1);
        }
    }
    const pixels = [];
    for (const [key, w] of hist) {
        pixels.push({
            r: (key >> 16) & 0xff,
            g: (key >> 8) & 0xff,
            b: key & 0xff,
            w,
        });
    }
    if (pixels.length === 0) return { skip: '无像素' };

    const palette = medianCut(pixels, 256);
    const nearestMap = buildNearestMap(palette);
    const indices = quantizeRows(
        rows,
        ihdr.width,
        ihdr.height,
        3,
        palette,
        nearestMap,
    );
    const out = encodePalettePng(ihdr.width, ihdr.height, palette, indices);
    return {
        buf: out,
        changed: !out.equals(buf),
        paletteColors: palette.length,
    };
}

/** 递归收集 .png 文件 */
function walkPngs(dir) {
    const out = [];
    const walk = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.isFile() && /\.png$/i.test(e.name)) out.push(p);
        }
    };
    walk(dir);
    return out.sort();
}

/**
 * 优化主流程
 * @returns {{fileCount:number, changed:number, skipped:string[], saved:number,
 *            totalBefore:number, totalAfter:number, issues:string[], results:object[]}}
 */
export function optimizePngs(options = {}) {
    const {
        dir = resolve(ROOT, 'image'),
        lossy = false,
        checkOnly = false,
        dryRun = false,
        outDir = null,
        silent = false,
    } = options;

    const files = existsSync(dir) ? walkPngs(dir) : [];
    const results = [];
    const issues = [];
    let totalBefore = 0;
    let totalAfter = 0;

    for (const abs of files) {
        const rel = relative(ROOT, abs);
        let buf;
        try {
            buf = readFileSync(abs);
        } catch {
            continue;
        }
        const before = buf.length;
        const res = lossy ? lossyOptimize(buf) : losslessOptimize(buf);

        if (res.skip) {
            results.push({
                file: rel,
                changed: false,
                before,
                after: before,
                saved: 0,
                dropped: [],
                skip: res.skip,
            });
            if (!silent) log.warn(`⧗ ${rel} — ${res.skip}`);
            continue;
        }

        const after = res.buf.length;
        const saved = before - after;
        totalBefore += before;
        totalAfter += after;

        // --check 语义：无损检查是否存在元数据块或可再压 >1%
        if (checkOnly && !lossy) {
            if (res.dropped.length > 0) {
                issues.push(`${rel} 含元数据块: ${res.dropped.join(', ')}`);
            } else if (res.recompressible && saved / before > 0.01) {
                issues.push(
                    `${rel} 可再压 ${((saved / before) * 100).toFixed(1)}%`,
                );
            }
        }

        const shouldWrite =
            !dryRun && !checkOnly && res.changed && !outDir && !res.skip;
        if (shouldWrite) writeFileSync(abs, res.buf);
        else if (!dryRun && !checkOnly && res.changed && outDir) {
            const target = resolve(outDir, rel);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, res.buf);
        }

        if (res.changed) {
            const pct =
                before > 0 ? ((saved / before) * 100).toFixed(1) : '0.0';
            if (!silent) {
                if (outDir && !dryRun)
                    log.info(
                        `▸ ${rel} — ${fmt(before)} → ${fmt(after)} (${pct}%) [副本 ${resolve(outDir, rel)}]`,
                    );
                else
                    log.ok(
                        `${rel} — ${fmt(before)} → ${fmt(after)} (${pct}%)${lossy ? ` [${res.paletteColors ?? 0} 色]` : ''}`,
                    );
            }
        } else if (!silent) {
            log.info(
                `— ${rel} 已是最优${lossy ? '' : res.dropped.length ? `（剔除 ${res.dropped.join(', ')} 后字节未变）` : ''}`,
            );
        }
        results.push({
            file: rel,
            changed: res.changed,
            before,
            after,
            saved,
            dropped: res.dropped || [],
            skip: null,
        });
    }

    const changedCount = results.filter((r) => r.changed).length;
    const skipped = results.filter((r) => r.skip).map((r) => r.skip);
    if (!silent) {
        console.log('');
        log.info(
            `扫描: ${results.length} 个 PNG（${lossy ? '有损模式' : '无损模式'}）`,
        );
        if (skipped.length) log.info(`跳过: ${skipped.length} 个`);
        log.info(
            `变更: ${changedCount} 个，节省 ${fmt(totalBefore - totalAfter)}（${totalBefore ? (((totalBefore - totalAfter) / totalBefore) * 100).toFixed(2) : 0}%）`,
        );
        if (checkOnly) {
            if (issues.length) {
                log.error('校验发现问题：');
                issues.forEach((i) => log.error(`  ✗ ${i}`));
            } else {
                log.ok('校验通过：无元数据块，无可再压图片');
            }
        }
        if (dryRun) console.log('\x1b[33m（预览模式，未写入任何文件）\x1b[0m');
    }

    return {
        fileCount: results.length,
        changed: changedCount,
        skipped,
        saved: totalBefore - totalAfter,
        totalBefore,
        totalAfter,
        issues,
        results,
    };
}

function fmt(n) {
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
}

function printUsage() {
    console.log(`用法:
  node scripts/opt-png.mjs                无损优化 image/ 下全部 PNG
  node scripts/opt-png.mjs --dry-run      仅预览可省多少
  node scripts/opt-png.mjs --check        校验（存在元数据块或可再压 >1% 则退出 1）
  node scripts/opt-png.mjs --lossy        有损量化（仅 RGB 图，须先 --out 验收）
  node scripts/opt-png.mjs --out <目录>   输出副本到指定目录（不覆盖原图）
  node scripts/opt-png.mjs --dir <目录>   指定扫描目录（默认 image/）`);
}

async function runInteractive() {
    let dir = resolve(ROOT, 'image');
    let outDir = null;
    try {
        for (;;) {
            const choice = await menu('请选择 PNG 优化方式:', [
                { label: '无损优化全部 PNG', value: 'lossless' },
                { label: '有损量化（--lossy，仅 RGB 图，改变画风）', value: 'lossy' },
                { label: '校验（--check：有元数据块或可再压 >1% 则退出 1）', value: 'check' },
                { label: '预览可省多少（--dry-run，不写入）', value: 'dry' },
                { label: `指定扫描目录（--dir；当前 ${dir}）`, value: 'dir' },
                { label: `指定输出副本目录（--out，验收不覆盖原图；当前 ${outDir || '无（原地）'}）`, value: 'out' },
            ]);
            if (!choice) {
                log.warn('已取消');
                return;
            }
            if (choice.value === 'dir') {
                const d = await prompt('扫描目录（绝对路径，回车不变）: ');
                if (d) dir = resolve(process.cwd(), d);
                continue;
            }
            if (choice.value === 'out') {
                const o = await prompt('输出副本目录（绝对路径，回车＝原地不覆盖）: ');
                if (o) outDir = resolve(process.cwd(), o);
                continue;
            }
            const opts = {
                dir,
                lossy: choice.value === 'lossy',
                checkOnly: choice.value === 'check',
                dryRun: choice.value === 'dry',
                outDir,
                silent: false,
            };
            if (opts.lossy && outDir)
                console.warn('\x1b[33m提示: 有损 + --out = 仅写出副本，不覆盖原图；请先肉眼验收。\x1b[0m');
            const result = optimizePngs(opts);
            if (opts.checkOnly && result.issues.length > 0) process.exit(1);
            return;
        }
    } finally {
        closeInteractive();
    }
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) return printUsage();
    // 无任何参数：交互选择（不默认执行某一功能）
    if (args.length === 0) {
        runInteractive().catch((error) => {
            log.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        });
        return;
    }
    const lossy = args.includes('--lossy');
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    const checkOnly = args.includes('--check');
    const outIndex = args.indexOf('--out');
    const outDir =
        outIndex >= 0 && args[outIndex + 1]
            ? resolve(process.cwd(), args[outIndex + 1])
            : null;
    const dirIndex = args.indexOf('--dir');
    const dir =
        dirIndex >= 0 && args[dirIndex + 1]
            ? resolve(process.cwd(), args[dirIndex + 1])
            : resolve(ROOT, 'image');

    try {
        if (lossy && outDir) {
            console.log(
                '\n\x1b[33m提示: --lossy 与 --out 同时使用，仅写出副本，不覆盖原图。请先肉眼验收再原地应用。\x1b[0m\n',
            );
        }
        const result = optimizePngs({
            dir,
            lossy,
            checkOnly,
            dryRun,
            outDir,
            silent: false,
        });
        if (checkOnly && result.issues.length > 0) process.exit(1);
    } catch (error) {
        log.error(error instanceof Error ? error.message : String(error));
        printUsage();
        process.exit(1);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) {
    main();
}
