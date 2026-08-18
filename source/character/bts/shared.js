// 崩铁杀（bts）唯一角色包 — 共享导入模块。
// 所有角色文件都位于 roles/<阵营>/<角色>.js，并通过本模块取得引擎和文本工具。
// 对齐叁岛规范：技能代码只用全局（lib.bts.*），此处不导出规则 API（bts）。
export { lib, game, ui, get, ai, _status } from '../../../../../noname.js';
export { styleText } from '../../tool/utils/textFormat.js';

import { styleText } from '../../tool/utils/textFormat.js';
export const X = styleText('b', 'X');
export const Y = styleText('p', 'Y');
export const Z = styleText('y', 'Z');

export function B(text) {
    return styleText('b', text);
}