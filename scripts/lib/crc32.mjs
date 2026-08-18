// 标准 ZIP CRC-32（IEEE 802.3），避免引入第三方 ZIP 依赖。
const table = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
}

export function crc32(buffer) {
    let value = 0xffffffff;
    for (const byte of buffer)
        value = (value >>> 8) ^ table[(value ^ byte) & 0xff];
    return (value ^ 0xffffffff) >>> 0;
}
