/**
 * 崩铁杀 脚本通用交互式命令行 UI
 *
 * 供各自动化脚本在「无传参」时提供编号菜单 / 自由输入，让用户交互选择，
 * 而非默认执行某一功能。基于 node:readline 的事件队列实现：
 *  - 对真实终端输入、以及 `printf ... | node scripts/xx.mjs` 管道/脚本化输入都稳定
 *  - 与 scripts/lib/git-cli.mjs 各自维护独立的 readline 接口，互不冲突
 *  - 所有交互结束后应调用 closeInteractive() 关闭流，避免进程挂起
 *
 * 用法：
 *   import { menu, prompt, closeInteractive } from './interactive.mjs';
 *   const choice = await menu('请选择操作', ['选项A', '选项B']);
 *   const name = await prompt('请输入名称', { required: true });
 */

import { createInterface } from 'node:readline';

let _rl = null;
let _inputQueue = [];
const _inputWaiters = [];
// 输入流已结束（EOF / 用户 Ctrl+D）。此后任何读取都直接返回 ''（视为取消），
// 避免「无输入管道/CI」下静默挂起或 required 提示无限重问。
let _eof = false;

function _flushWaiters(value) {
    for (const w of _inputWaiters.splice(0)) w(value);
    _inputQueue.length = 0;
}

function _ensureRl() {
    if (_rl) return;
    _rl = createInterface({ input: process.stdin, output: process.stdout });
    _rl.on('line', (line) => {
        const waiter = _inputWaiters.shift();
        if (waiter) waiter(line.trim());
        else _inputQueue.push(line.trim());
    });
    _rl.on('close', () => {
        _eof = true;
        _flushWaiters('');
        _rl = null;
    });
}

/**
 * 行输入（通用），返回去掉首尾空白的答案。
 * @param {string} promptText 提示语（如 `请输入序号（1-4）: `）
 * @param {{required?: boolean}} [opts] required=true 时空输入会重问
 * @returns {Promise<string>} 输入流 EOF 时返回 ''（表示取消）
 */
export async function prompt(promptText, { required = false } = {}) {
    if (_eof) return ''; // 流已结束：不再读取，直接视为取消
    _ensureRl();
    for (;;) {
        process.stdout.write(promptText);
        const value = await new Promise((done) => {
            const pending = _inputQueue.shift();
            if (pending !== undefined) done(pending);
            else _inputWaiters.push(done);
        });
        // required 但空（含 EOF）→ 不重问，返回 ''（交上层取消/报错处理）
        if (!required || value) return value;
        if (_eof) return '';
    }
}

/**
 * 是/否确认（默认否）。供「写盘 / 应用 / 不可逆」类操作做二次确认。
 * @param {string} promptText 提示语（如 `是否将台词写入代码？`）
 * @param {{defaultYes?: boolean}} [opts] defaultYes=true 时空(可用EOF)按“是”处理
 * @returns {Promise<boolean>} 是/否；输入流 EOF 时返回 defaultYes（默认 false=拒绝）
 */
export async function confirm(promptText, { defaultYes = false } = {}) {
    const a = await prompt(
        `\x1b[33m${promptText}\x1b[0m ${defaultYes ? '(Y/n) ' : '(y/N) '}`,
    );
    if (defaultYes) return !/^n|no$/i.test(a);
    return /^y(es)?$/i.test(a);
}

/**
 * 编号菜单：展示 title 下的 choices，用户输入序号返回对应项；非法则重问。
 * @param {string} title      菜单标题（可为多行）
 * @param {Array<string|object>} choices 每项可为字符串，或 {label, value}
 * @param {{cancelLabel?: string, defaultIndex?: number}} [opts]
 * @returns {Promise<string|object|null>} 选中项（原样返回 string 或 {label,value}）；
 *                                         用户取消（Q/空按默认）时返回 null
 */
export async function menu(title, choices, opts = {}) {
    const { cancelLabel = '取消', defaultIndex = null } = opts;
    for (;;) {
        console.log('');
        console.log(title);
        choices.forEach((c, i) => {
            const label = typeof c === 'string' ? c : String(c?.label ?? c);
            const marker = defaultIndex === i ? '（默认）' : '';
            console.log(`  ${i + 1}) ${label}${marker}`);
        });
        console.log(`  0) ${cancelLabel}`);
        const answer = await prompt('请输入序号: ');
        if (answer) {
            const idx = Number(answer);
            if (Number.isInteger(idx) && idx >= 1 && idx <= choices.length)
                return choices[idx - 1];
            if (idx === 0) return null;
            if (/q|quit|cancel$/i.test(answer)) return null;
        } else if (defaultIndex !== null && choices[defaultIndex] !== undefined) {
            return choices[defaultIndex];
        } else {
            return null;
        }
        console.log('\x1b[33m无效输入，请重新选择。\x1b[0m');
    }
}

/** 关闭交互输入（流程结束后调用，避免进程挂起） */
export function closeInteractive() {
    if (_rl) {
        _rl.close();
        _rl = null;
    }
    _flushWaiters('');
    _eof = false;
}