// 纯 JS MD5（公有领域算法），供在线更新做完整性校验与媒体变更检测。
// 游戏内不可用 crypto-js（未暴露给扩展），故内联实现；输出与
// Node `crypto.createHash('md5').update(bytes).digest('hex')` 逐字节一致。

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

/**
 * 计算字节数据的 MD5（小写 32 位 hex）。
 * @param {ArrayBuffer|Uint8Array|Buffer} data
 * @returns {string}
 */
export function md5Hex(data) {
	const bytes = toBytes(data);
	const n = bytes.length;

	// 填充：0x80 + 0x00… + 64 位小端长度，总长 64 字节对齐
	const paddedLen = ((n + 1 + 8 + 63) >>> 6) << 6;
	const padded = new Uint8Array(paddedLen);
	padded.set(bytes);
	padded[n] = 0x80;
	const bitLen = n * 8;
	const bitLenLo = bitLen >>> 0;
	const bitLenHi = Math.floor(bitLen / 4294967296);
	padded[paddedLen - 8] = bitLenLo & 0xff;
	padded[paddedLen - 7] = (bitLenLo >>> 8) & 0xff;
	padded[paddedLen - 6] = (bitLenLo >>> 16) & 0xff;
	padded[paddedLen - 5] = (bitLenLo >>> 24) & 0xff;
	padded[paddedLen - 4] = bitLenHi & 0xff;
	padded[paddedLen - 3] = (bitLenHi >>> 8) & 0xff;
	padded[paddedLen - 2] = (bitLenHi >>> 16) & 0xff;
	padded[paddedLen - 1] = (bitLenHi >>> 24) & 0xff;

	let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
	const M = new Int32Array(16);

	for (let i = 0; i < paddedLen; i += 64) {
		for (let j = 0; j < 16; j++) {
			const o = i + j * 4;
			M[j] = padded[o] | (padded[o + 1] << 8) | (padded[o + 2] << 16) | (padded[o + 3] << 24);
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

	let hex = '';
	for (const w of [a0, b0, c0, d0]) {
		const u = w >>> 0;
		hex += (u & 0xff).toString(16).padStart(2, '0');
		hex += ((u >>> 8) & 0xff).toString(16).padStart(2, '0');
		hex += ((u >>> 16) & 0xff).toString(16).padStart(2, '0');
		hex += ((u >>> 24) & 0xff).toString(16).padStart(2, '0');
	}
	return hex;
}
