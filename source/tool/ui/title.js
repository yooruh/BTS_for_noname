// 崩铁杀角色称号渲染：`属性·命途·昵称` → 属性图标 + 命途图标 + 昵称。
// 角色模块导出 `title` 原文（源版格式，如 '雷·丰饶·衔药龙女'），本模块在
// character/bts/index.js 收集时统一转成 HTML，不改动角色文件。
//
// 图标以引擎原生 <noname-poptip> 承载（词条经 tool/ui/poptips.js 于 content 阶段注册；
// 元素 textContent 即中文名，点击自动弹解释窗，故正文无需命途中文名文字）。
// 背景图**内联**在元素 style（勿用 CSS 变量：实测 var() 内相对 URL 按样式表目录解析
// 会指到 style/css/... → 404；内联相对 URL 按文档基准解析、与 setBackgroundImage
//（markimage 同款）一致，URL 拼 lib.assetURL 前缀）；中文名 transparent +
// text-shadow:none + overflow:hidden 隐藏（text-shadow 必须显式清掉：app/index.css 的
// html{text-shadow} 会继承，color:transparent 只透明字面、黑色字影仍会画出黑字）。
//
// 可塞 <noname-poptip> 的依据：称号渲染点均走 innerHTML（ui/click/index.js 选将详情
// `.character-title`、get/index.js uiintro），渲染前仅经 get.colorspan()（非 '#' 开头
// 原样返回、不转义）；纯文本消费（get.characterTitle 默认 plainText）走 get.plainText()，
// 提取 poptip 名称文字、其余标签剥离，安全。
//
// 素材：属性 → image/mark/bts_n_<nature>.png（与属性标记同套图）；命途 →
// image/path/bts_path_<pinyin>.png。无 `·` 前缀的称号（如「狂欢企划」）原样返回、不包装。
import { lib } from '../../../../../noname.js';
import { extensionPath } from '../utils/paths.js';
import { NATURES, NATURE_CONFIG } from '../../rules/natures.js';

// 属性官方名（称号沿崩铁官方名 物理/火/冰/雷/风/量子/虚数；与 NATURE_CONFIG.translation
// 的改名 火→炎、冰→霜、雷→电 不同），同时是属性 poptip 的中文名（poptips.js 消费）。
export const NATURE_OFFICIAL_NAME = Object.fromEntries(
    NATURES.map((key) => [key, NATURE_CONFIG[key].translation]),
);
Object.assign(NATURE_OFFICIAL_NAME, { flame: '火', frost: '冰', elec: '雷' });

// 属性中文名 → 属性键。官方名 + 改名两套名都接受。
const NATURE_BY_NAME = Object.fromEntries(
    Object.entries(NATURE_OFFICIAL_NAME).map(([key, name]) => [name, key]),
);

// 命途名 → 素材基名（image/path/bts_path_<key>.png）。
// 15 命途素材齐备，其中 9 个为现役称号在用（其余待实装，素材先就位）。
export const PATH_BY_NAME = {
    丰饶: 'fengrao',
    同谐: 'tongxie',
    均衡: 'junheng',
    存护: 'cunhu',
    巡猎: 'xunlie',
    开拓: 'kaituo',
    智识: 'zhishi',
    欢愉: 'huanyu',
    毁灭: 'huimie',
    神秘: 'shenmi',
    秩序: 'zhixu',
    繁育: 'fanyu',
    虚无: 'xuwu',
    记忆: 'jiyi',
    贪饕: 'tantao',
};

/** 称号分段（`属性·命途·昵称`）；不足两段或前两段非已知属性/命途时返回 null。 */
export function parseTitle(title) {
    if (typeof title !== 'string') return null;
    const [natureName, pathName, ...rest] = title.split('·');
    const nature = NATURE_BY_NAME[natureName];
    const path = PATH_BY_NAME[pathName];
    if (!nature || !path) return null;
    return { nature, natureName, path, pathName, name: rest.join('·') };
}

/**
 * 称号 → 显示串（`属性·命途·昵称` 转图标版；其余原样返回，保证漏配素材时仍可显示）。
 * 图标为 <noname-poptip>（content 阶段注册），点击弹中文名解释窗；命途中文名被图标替换。
 */
export function renderTitle(title) {
    const parsed = parseTitle(title);
    if (!parsed) return title;
    // 图标 URL = lib.assetURL + extensionPath + 素材相对路径（setBackgroundImage 约定）。
    const natureUrl = `${lib.assetURL}${extensionPath}/image/mark/bts_n_${parsed.nature}.png`;
    const pathUrl = `${lib.assetURL}${extensionPath}/image/path/bts_path_${parsed.path}.png`;
    return [
        `<noname-poptip poptip="bts_nature_${parsed.nature}" class="bts-title-icon bts-title-nature" style="background-image:url('${natureUrl}')"></noname-poptip>`,
        `<noname-poptip poptip="bts_path_${parsed.path}" class="bts-title-icon bts-title-path" style="background-image:url('${pathUrl}')"></noname-poptip>`,
        parsed.name,
    ]
        .filter((seg) => seg !== '')
        .join(' ');
}
