// 纯 JS MD5（公有领域算法），供在线更新做完整性校验与媒体变更检测。
// 游戏内无法使用 crypto-js，故内联实现；输出与 Node crypto 的 md5 hex 逐字节一致。
// 输入按 64 字节块就地压缩，不复制整份数据：峰值内存 ≈ 输入 + 128 字节填充块（大媒体文件不再翻倍占用）。

const S = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
	5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
	4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
	6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Int32Array(64);
for (let i = 0; i < 64; i++) {
	K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
}

const rotl = (x, c) => (x << c) | (x >>> (32 - c));

/** 归一化输入为 Uint8Array（支持 ArrayBuffer / Buffer / 任意 TypedArray） */
function toBytes(data) {
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	throw new Error('md5Hex: 不支持的数据类型');
}

/** 就地压缩 bytes 中从 offset 起的 blocks 个 64 字节块；state 为 [a, b, c, d]，原地更新 */
function compress(bytes, offset, blocks, state, M) {
	let a0 = state[0], b0 = state[1], c0 = state[2], d0 = state[3];

	for (let i = 0; i < blocks; i++) {
		const base = offset + i * 64;
		for (let j = 0; j < 16; j++) {
			const o = base + j * 4;
			M[j] = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24);
		}

		let A = a0, B = b0, C = c0, D = d0;
		for (let j = 0; j < 64; j++) {
			let F, g;
			if (j < 16) { F = (B & C) | (~B & D); g = j; }
			else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
			else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
			else { F = C ^ (B | ~D); g = (7 * j) % 16; }
			F = (F + A + K[j] + M[g]) | 0;
			A = D; D = C; C = B;
			B = (B + rotl(F, S[j])) | 0;
		}
		a0 = (a0 + A) | 0;
		b0 = (b0 + B) | 0;
		c0 = (c0 + C) | 0;
		d0 = (d0 + D) | 0;
	}

	state[0] = a0;
	state[1] = b0;
	state[2] = c0;
	state[3] = d0;
}

/** 计算字节数据的 MD5（小写 32 位 hex）；接受 ArrayBuffer / Uint8Array / Buffer */
export function md5Hex(data) {
	const bytes = toBytes(data);
	const n = bytes.length;
	const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
	const M = new Int32Array(16);

	// 完整块直接就地压缩
	const fullBlocks = n >>> 6;
	compress(bytes, 0, fullBlocks, state, M);

	// 尾部 + 填充：余数不足 56 字节补一块，否则补两块（0x80 + 0x00… + 64 位小端长度）
	const rest = n - fullBlocks * 64;
	const tail = new Uint8Array(rest < 56 ? 64 : 128);
	tail.set(bytes.subarray(n - rest, n));
	tail[rest] = 0x80;
	const bitLen = n * 8;
	const bitLenLo = bitLen >>> 0;
	const bitLenHi = Math.floor(bitLen / 4294967296);
	const end = tail.length;
	tail[end - 8] = bitLenLo & 0xff;
	tail[end - 7] = (bitLenLo >>> 8) & 0xff;
	tail[end - 6] = (bitLenLo >>> 16) & 0xff;
	tail[end - 5] = (bitLenLo >>> 24) & 0xff;
	tail[end - 4] = bitLenHi & 0xff;
	tail[end - 3] = (bitLenHi >>> 8) & 0xff;
	tail[end - 2] = (bitLenHi >>> 16) & 0xff;
	tail[end - 1] = (bitLenHi >>> 24) & 0xff;
	compress(tail, 0, end >>> 6, state, M);

	let hex = '';
	for (const w of state) {
		const u = w >>> 0;
		hex += (u & 0xff).toString(16).padStart(2, '0');
		hex += ((u >>> 8) & 0xff).toString(16).padStart(2, '0');
		hex += ((u >>> 16) & 0xff).toString(16).padStart(2, '0');
		hex += ((u >>> 24) & 0xff).toString(16).padStart(2, '0');
	}
	return hex;
}
