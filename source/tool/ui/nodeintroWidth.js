// 技能详情弹窗（#nodeintro）宽度加倍。
// 该弹窗宽度由布局 CSS 决定（#window > .dialog.popped { width: 220px }），内联样式
// 只写 height/left/top。包装 lib.placePoppedDialog（popped 弹窗摆放唯一入口，调用时
// 弹窗已在 DOM、offsetWidth 可用）：开启时摆放前读 offsetWidth ×2 写入（不写死像素，
// 换布局/换本体都保持「当前宽度×2」；先改宽再摆放，left 已按加倍后宽度居中）。
// 关闭时清除内联宽度与标记、回落布局 CSS 宽度。
import { lib, game } from '../../../../../noname.js';

const CONFIG_KEY = 'bts_nodeintro_wide';
const WIDE_FLAG = 'btsNodeintroWide'; // dataset 键，标记已按本功能加倍，防重复 ×2

function isEnabled() {
    return !!game.getExtensionConfig('崩铁杀', CONFIG_KEY);
}

/** 将单个 #nodeintro 按当前 CSS 宽度加倍（幂等：已标记/无宽度时跳过）。 */
function widen(node) {
    if (!node || node.dataset[WIDE_FLAG]) return;
    const base = node.offsetWidth;
    if (!base) return;
    node.style.width = base * 2 + 'px';
    node.dataset[WIDE_FLAG] = '1';
}

/** 还原单个 #nodeintro：清除内联宽度与加倍标记，回落到布局 CSS 宽度。 */
function restore(node) {
    if (!node) return;
    delete node.dataset[WIDE_FLAG];
    node.style.width = '';
}

/**
 * 配置切换即时生效/还原已显示的弹窗（开启→立即加倍；关闭→立即还原）；
 * 此后新弹窗由包装后的 placePoppedDialog 处理。
 */
export function applyNodeintroWide() {
    const node = document.getElementById('nodeintro');
    if (!node) return;
    if (isEnabled()) {
        widen(node);
    } else {
        restore(node);
    }
}

/** 安装：包装 lib.placePoppedDialog，摆放 #nodeintro 前按其当前宽度加倍。 */
export function installNodeintroWide() {
    const orig = lib.placePoppedDialog;
    if (typeof orig !== 'function' || orig.__btsNodeintroWide) return;
    const wrapped = function (dialog, e) {
        if (dialog && dialog.id === 'nodeintro' && isEnabled()) {
            widen(dialog);
        }
        return orig.apply(this, arguments);
    };
    wrapped.__btsNodeintroWide = true;
    lib.placePoppedDialog = wrapped;
}

export const nodeintroWide = {
    key: CONFIG_KEY,
    isEnabled,
    apply: applyNodeintroWide,
};
