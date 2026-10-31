// 势力图标 `image/kingdom/icon/<势力 id>.png`（正方形透底 PNG）。
// 载入对齐属性/命途图标（tool/ui/title.js）：路径只在本文件由势力 id 推出，注册点
// （rules/index.js registerKingdoms 的 config.image）与点击解释共用，不在各处手拼字符串。
//
// 点击解释：资料卡里的这张图由引擎 ui/click/index.js 的 charactercard 直接
// `new Image()` 插入 `.character-group`（读 lib.card.group_<id>.image），扩展拿不到 HTML
// 钩子，故不生成 <noname-poptip> 元素；改为在 document 捕获阶段识别图标所属势力，
// 复用引擎同一套 lib.poptip（词条见 tool/ui/poptips.js registerKingdomPoptips）与
// get.poptipIntro 弹窗。识别判据见 kingdomFromImage。
// 必须走捕获阶段：charactercard 在冒泡阶段监听点击关闭弹窗，先于它处理才能做到「点图标
// 看词条、资料卡不关」。
// 监听目标是 document 而非 ui.window：content 阶段引擎 UI 尚未创建（ui.window 在 boot
// 之后才由 ui.create 建出），此时读 ui.window 会拿到 undefined。
import { lib, game, get } from '../../../../../noname.js';
import { extensionPath } from '../utils/paths.js';
import { KINGDOMS } from '../../character/bts/factions.js';

const ICON_DIR = 'image/kingdom/icon';

/** 势力 id → 图标相对路径。引擎侧自行拼 lib.assetURL（game.addGroup 的 config.image）。 */
export function kingdomIconPath(id) {
    return `${extensionPath}/${ICON_DIR}/${id}.png`;
}

/** 势力图标的 poptip id（登记见 tool/ui/poptips.js）。 */
export function kingdomPoptipId(id) {
    return `bts_kingdom_${id}`;
}

/**
 * 复刻引擎 charactercard 的取址：`lib.card.group_<id>.image` → img.src
 * （ui/click/index.js：`db:` 走数据库图片，`ext:` 换成 extension/，其余直接拼 lib.assetURL）。
 * 本扩展图标走最后一条。返回 null 表示该取址方式无法用 URL 比对（数据库图片）。
 */
function groupImageUrl(image) {
    if (typeof image !== 'string' || !image) return null;
    if (image.startsWith('db:')) return null;
    if (image.startsWith('ext:'))
        return `${lib.assetURL}${image.replace(/^ext:/, 'extension/')}`;
    return `${lib.assetURL}${image}`;
}

/** 相对地址按文档基准补全（中文字符等由 URL 解析统一编码，与浏览器写回 img.src 的值同法序列化）。 */
function absoluteUrl(url) {
    try {
        return new URL(url, document.baseURI).href;
    } catch (error) {
        return url;
    }
}

/**
 * 资料卡图标 → 势力 id（不属于本扩展注册的势力图标则 null）。
 *
 * 判据取「与注册值相等」而不是「路径长得像」：对 12 个势力逐个取
 * `lib.card.group_<id>.image`，用与引擎完全相同的拼法（见 groupImageUrl）解出绝对 URL，
 * 再与目标 img.src 比对。只有本扩展 addGroup 注册的那张图才可能相等——
 * 别的扩展即使把图标放进同名目录、用同名 id 也不认；本体势力（image/card/group_*.png）、
 * 性别图标更不认。附带效果：若某个势力图被外部改成别的地址，这里自动不再命中（宁可无解释，
 * 也不张冠李戴）。
 */
function kingdomFromImage(img) {
    const src = img.src;
    if (!src) return null;
    for (const [id] of KINGDOMS) {
        const image = groupImageUrl(lib.card?.[`group_${id}`]?.image);
        if (image && absoluteUrl(image) === src) return id;
    }
    return null;
}

/**
 * 弹窗定位入参：触屏的 touchend 不带 clientX/clientY（lib.placePoppedDialog 只认这两个
 * 字段，读不到会算出 NaNpx），取触点重定向。
 */
function poptipAnchor(event) {
    return event.touches?.[0] || event.changedTouches?.[0] || event;
}

/** 资料卡势力图标点击：展示该势力的中文名（词条正文即 `势力：<显示名>`）。 */
function showKingdomPoptip(event) {
    const target = event.target;
    if (!target || target.tagName !== 'IMG') return;
    const holder = target.parentNode;
    if (!holder || !holder.classList?.contains('character-group')) return;
    const id = kingdomFromImage(target);
    if (!id) return;
    event.stopPropagation();
    game.closePoptipDialog();
    const poptip = kingdomPoptipId(id);
    get.poptipIntro(lib.poptip.getInfo(poptip), poptip, poptipAnchor(event));
}

let installed = false;

/** 安装资料卡势力图标点击解释（幂等；content 阶段调用一次）。 */
export function installKingdomIconPoptip() {
    if (installed) return;
    installed = true;
    // 与引擎资料卡的关闭监听同一事件类型：触屏用 touchend，其余用 click。
    document.addEventListener(
        lib.config.touchscreen ? 'touchend' : 'click',
        showKingdomPoptip,
        true,
    );
}
