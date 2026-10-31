/**
 * 生成文档的页首渲染（生成器共用；结构契约见 `文档/如何写文档.md` §二）。
 * 生成器标识供 `scripts/docs-audit.mjs` 校验索引「维护」列与该文档页首一致。
 */
export const GENERATOR_MARK = '> 生成器：';

/**
 * @param {object} spec
 * @param {string} spec.title 一级标题
 * @param {string} spec.purpose 用途
 * @param {string} spec.applies 适用
 * @param {string[]} [spec.related] 相关文档
 * @param {string} [spec.generator] 生成器路径（仓库根相对）
 * @param {string} [spec.generatorNote] 生成器补充说明（末尾不加句号）
 * @param {string[]} [spec.notes] 补充说明行（不含 `> `）
 * @param {string[]} [spec.commands] 命令行（不含 `> `）
 * @returns {string[]} 页首行，含标题后的空行
 */
export function renderHeader({
    title,
    purpose,
    applies,
    related = [],
    generator,
    generatorNote,
    notes = [],
    commands = [],
}) {
    const lines = [`# ${title}`, '', `> 用途：${purpose}`, `> 适用：${applies}`];
    if (related.length) lines.push(`> 相关：${related.join('；')}`);
    if (generator) lines.push(`${GENERATOR_MARK}${generator}${generatorNote ? `；${generatorNote}` : ''}。`);
    for (const note of notes) lines.push(`> ${note}`);
    for (const command of commands) lines.push(`> ${command}`);
    return lines;
}
