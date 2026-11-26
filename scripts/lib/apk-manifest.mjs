/**
 * APK 二进制清单（AndroidManifest.xml）版本号读写：仅用 Node.js 内置模块。
 *
 * 用途：外壳 APK 由构建树产出，`versionCode` / `versionName` 在 `build.gradle.kts` 里是写死的
 * （1 / "1.0"），跟着源码走不会随崩铁杀发布递增。打包时把崩铁杀版本写进清单，安卓才能把新包
 * 认成升级（覆盖安装），玩家在系统里看到的版本也不再一直是「1.0」。
 *
 * 格式要点（AXML）：
 * - 文件头 `ResXMLTree_header`（type 0x0003 + headerSize + size），其后是一串 chunk；
 * - 首个 chunk 是字符串池（0x0001），manifest 元素的属性用字符串池下标 + 资源表下标表示；
 * - 元素 `versionCode` 是资源 id 0x0101021b 的整数属性（就地改 4 字节即可）；
 * - 元素 `versionName` 是资源 id 0x0101021c 的字符串属性（改字符串池第 N 项，需整体重排字符串池）。
 *
 * 因为要改字符串长度，versionName 的写入会重建字符串池并顺移后续 chunk 的偏移；元素 chunk 内部
 * 用的是字符串下标而不是字节偏移，所以除池子外的 chunk 可以原样沿用，只有总长度需要回写。
 * 改写后的 APK 必须重新签名（pack.mjs 的 zipalign + apksigner 流程已覆盖）。
 */

const RES_XML_TYPE = 0x0003;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;
const RES_XML_START_ELEMENT_TYPE = 0x0102;

/** android:versionCode / android:versionName 的资源 id */
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;

const TYPE_STRING = 0x03;

/** 属性结构内各字段的相对偏移（共 20 字节） */
const ATTR_NAME = 4;
const ATTR_RAW_VALUE = 8;
const ATTR_DATA_TYPE = 15;
const ATTR_DATA = 16;

function walkChunks(buf, start) {
    const chunks = [];
    let off = start;
    while (off + 8 <= buf.length) {
        const type = buf.readUInt16LE(off);
        const headerSize = buf.readUInt16LE(off + 2);
        const size = buf.readUInt32LE(off + 4);
        if (size < 8 || off + size > buf.length) break;
        chunks.push({ off, type, headerSize, size });
        off += size;
    }
    return chunks;
}

function decodeString(buf, at, utf8) {
    let q = at;
    if (utf8) {
        let len16 = buf.readUInt8(q++);
        if (len16 & 0x80) len16 = ((len16 & 0x7f) << 8) | buf.readUInt8(q++);
        let len8 = buf.readUInt8(q++);
        if (len8 & 0x80) len8 = ((len8 & 0x7f) << 8) | buf.readUInt8(q++);
        return buf.subarray(q, q + len8).toString('utf8');
    }
    let len = buf.readUInt16LE(q);
    q += 2;
    if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | buf.readUInt16LE(q);
        q += 2;
    }
    return buf.subarray(q, q + len * 2).toString('utf16le');
}

function encodeString(text, utf8) {
    if (utf8) {
        const bytes = Buffer.from(text, 'utf8');
        const units = text.length; // UTF-16 码元数，AXML 的 u16 长度就是它
        const head = [];
        if (units > 0x7f) head.push(0x80 | ((units >> 8) & 0x7f), units & 0xff);
        else head.push(units);
        if (bytes.length > 0x7f) head.push(0x80 | ((bytes.length >> 8) & 0x7f), bytes.length & 0xff);
        else head.push(bytes.length);
        return Buffer.concat([Buffer.from(head), bytes, Buffer.from([0])]);
    }
    const bytes = Buffer.from(text, 'utf16le');
    const units = bytes.length / 2;
    let head;
    if (units > 0x7fff) {
        head = Buffer.alloc(4);
        head.writeUInt16LE(0x8000 | ((units >>> 16) & 0x7fff), 0);
        head.writeUInt16LE(units & 0xffff, 2);
    } else {
        head = Buffer.alloc(2);
        head.writeUInt16LE(units, 0);
    }
    return Buffer.concat([head, bytes, Buffer.from([0, 0])]);
}

function parsePool(buf, chunk) {
    const stringCount = buf.readUInt32LE(chunk.off + 8);
    const styleCount = buf.readUInt32LE(chunk.off + 12);
    const flags = buf.readUInt32LE(chunk.off + 16);
    const stringsStart = buf.readUInt32LE(chunk.off + 20);
    const stylesStart = buf.readUInt32LE(chunk.off + 24);
    const utf8 = (flags & 0x100) !== 0;
    const base = chunk.off + chunk.headerSize;
    const strings = [];
    for (let i = 0; i < stringCount; i++) {
        const rel = buf.readUInt32LE(base + i * 4);
        strings.push(decodeString(buf, chunk.off + stringsStart + rel, utf8));
    }
    const styles =
        styleCount && stylesStart ? buf.subarray(chunk.off + stylesStart, chunk.off + chunk.size) : Buffer.alloc(0);
    return { strings, utf8, styleCount, styles };
}

function encodePool(pool) {
    const parts = pool.strings.map((s) => encodeString(s, pool.utf8));
    let data = Buffer.concat(parts);
    const pad = (4 - (data.length % 4)) % 4;
    if (pad) data = Buffer.concat([data, Buffer.alloc(pad)]);
    const headerSize = 0x1c;
    const stringsStart = headerSize + pool.strings.length * 4;
    const stylesBytes = pool.styleCount ? pool.styles : Buffer.alloc(0);
    const size = stringsStart + data.length + stylesBytes.length;
    const out = Buffer.alloc(size);
    out.writeUInt16LE(RES_STRING_POOL_TYPE, 0);
    out.writeUInt16LE(headerSize, 2);
    out.writeUInt32LE(size, 4);
    out.writeUInt32LE(pool.strings.length, 8);
    out.writeUInt32LE(pool.styleCount, 12);
    out.writeUInt32LE(pool.utf8 ? 0x100 : 0, 16);
    out.writeUInt32LE(stringsStart, 20);
    out.writeUInt32LE(pool.styleCount ? stringsStart + data.length : 0, 24);
    let rel = 0;
    for (let i = 0; i < parts.length; i++) {
        out.writeUInt32LE(rel, headerSize + i * 4);
        rel += parts[i].length;
    }
    data.copy(out, stringsStart);
    if (stylesBytes.length) stylesBytes.copy(out, stringsStart + data.length);
    return out;
}

/** 定位 manifest 元素及其版本号属性 */
function locate(buf) {
    const outerHeaderSize = buf.readUInt16LE(2);
    const chunks = walkChunks(buf, outerHeaderSize);
    const poolChunk = chunks.find((c) => c.type === RES_STRING_POOL_TYPE);
    if (!poolChunk) return { error: '清单缺少字符串池' };
    const pool = parsePool(buf, poolChunk);
    const resMap = chunks.find((c) => c.type === RES_XML_RESOURCE_MAP_TYPE);
    const resIds = [];
    if (resMap) {
        const n = Math.floor((resMap.size - resMap.headerSize) / 4);
        for (let i = 0; i < n; i++) resIds.push(buf.readUInt32LE(resMap.off + resMap.headerSize + i * 4));
    }
    for (const c of chunks) {
        if (c.type !== RES_XML_START_ELEMENT_TYPE) continue;
        const nameIndex = buf.readUInt32LE(c.off + c.headerSize + 4);
        if (pool.strings[nameIndex] !== 'manifest') continue;
        const attrStart = buf.readUInt16LE(c.off + c.headerSize + 8);
        const attrSize = buf.readUInt16LE(c.off + c.headerSize + 10);
        const attrCount = buf.readUInt16LE(c.off + c.headerSize + 12);
        const attrs = [];
        for (let i = 0; i < attrCount; i++) {
            const at = c.off + c.headerSize + attrStart + i * attrSize;
            const nameIdx = buf.readUInt32LE(at + ATTR_NAME);
            attrs.push({
                at,
                name: pool.strings[nameIdx],
                resId: resIds[nameIdx] || 0,
                rawValue: buf.readUInt32LE(at + ATTR_RAW_VALUE),
                dataType: buf.readUInt8(at + ATTR_DATA_TYPE),
                data: buf.readUInt32LE(at + ATTR_DATA),
            });
        }
        return { poolChunk, pool, element: c, attrs };
    }
    return { error: '清单中未找到 <manifest> 元素' };
}

/** 读 APK 清单里的版本号（供打包后复核） */
export function readManifestVersion(buf) {
    const info = locate(buf);
    if (info.error) return { error: info.error };
    const codeAttr = info.attrs.find((a) => a.resId === ATTR_VERSION_CODE);
    const nameAttr = info.attrs.find((a) => a.resId === ATTR_VERSION_NAME);
    return {
        versionCode: codeAttr && codeAttr.dataType !== 0x03 ? codeAttr.data : null,
        versionName:
            nameAttr && nameAttr.dataType === TYPE_STRING ? info.pool.strings[nameAttr.data] : null,
    };
}

/**
 * 把崩铁杀版本号写进清单。
 * @param {Buffer} buf 解压后的 AndroidManifest.xml
 * @param {{ versionCode?: number, versionName?: string }} want
 * @returns {{ buffer: Buffer, changed: string[], notes: string[] }}
 */
export function patchManifestVersion(buf, { versionCode, versionName } = {}) {
    const notes = [];
    const changed = [];
    let info = locate(buf);
    if (info.error) return { buffer: buf, changed, notes: [info.error] };

    const nameAttr = info.attrs.find((a) => a.resId === ATTR_VERSION_NAME);
    const canRename = typeof versionName === 'string' && versionName.length > 0;
    if (canRename && !nameAttr) notes.push('清单无 versionName 属性，未写入');
    else if (canRename && nameAttr.dataType !== TYPE_STRING) notes.push('versionName 非字符串属性，未写入');
    else if (canRename && info.pool.strings[nameAttr.data] !== versionName) {
        if (info.pool.styleCount) {
            notes.push('字符串池带样式表，versionName 未写入（只写 versionCode）');
        } else {
            const strings = info.pool.strings.slice();
            strings[nameAttr.data] = versionName;
            const newPool = encodePool({ ...info.pool, strings });
            const head = Buffer.from(buf.subarray(0, info.poolChunk.off));
            const tail = buf.subarray(info.poolChunk.off + info.poolChunk.size);
            const out = Buffer.concat([head, newPool, tail]);
            out.writeUInt32LE(out.length, 4);
            buf = out;
            changed.push('versionName');
            info = locate(buf); // 偏移已变，重新定位
            if (info.error) return { buffer: buf, changed, notes: [...notes, info.error] };
        }
    }

    if (typeof versionCode === 'number' && Number.isFinite(versionCode)) {
        const codeAttr = info.attrs.find((a) => a.resId === ATTR_VERSION_CODE);
        if (!codeAttr) notes.push('清单无 versionCode 属性，未写入');
        else if (codeAttr.dataType === TYPE_STRING) notes.push('versionCode 非整数属性，未写入');
        else if (codeAttr.data !== versionCode) {
            buf.writeUInt32LE(versionCode >>> 0, codeAttr.at + ATTR_DATA);
            changed.push('versionCode');
        }
    }
    return { buffer: buf, changed, notes };
}

/**
 * 崩铁杀版本 → 安卓 versionCode：主*1e6 + 次*1e4 + 修订*1e2 + 构建，保证同向递增且落在 int32 内。
 * 例：26.11.1.0 → 26110100。版本号解析失败时返回 null（保留外壳原值）。
 */
export function apkVersionCode(version) {
    const nums = String(version)
        .replace(/^v/i, '')
        .split('.')
        .map((x) => Number.parseInt(x, 10));
    if (!nums.length || nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = nums;
    const code = a * 1000000 + b * 10000 + c * 100 + d;
    return code > 0 ? Math.min(code, 2100000000) : null;
}
