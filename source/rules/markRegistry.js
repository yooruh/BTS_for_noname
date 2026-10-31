// 崩铁杀标记机制（只承载「标记注册机制/工具链」）：MARKS 命名助手 / GOD_MARK / SOURCE_TRACK（星启来源追踪）、
// MARK_TYPES / normalizeMarkType 显示类型（image/text/none）、markIntro / hiddenMark / buildMarkSkill 构建器、
// RULE_TRANSLATE / MARK_GLOSSARY 内部回填表。内容层落位：势力 → character/bts/factions.js；属性 → rules/natures.js；
// 全局标记 → rules/globalMarks.js；全局 buff → rules/globalBuffs.js；角色标记/buff → 角色文件；派生表 → source/generated/buffRegistry.js。
import { lib, game, get } from '../../../../noname.js';
import { extensionPath } from '../tool/utils/paths.js';

export const MARKS = {
    // 注册到 lib.translate/lib.skill 的标记键一律 bts_ 前缀（见《标记系统规范》§一；angry/shield 本体
    // 翻译表无此键，一并 bts_ 防撞名）。
    ANGRY: 'bts_mk_angry',
    SHIELD: 'bts_shield',
    CURSE: 'bts_curse',
    EXTRA_MAX: 'bts_mk_extra_max',
    DAMAGE_LINK_PREFIX: 'bts_damage_link_',
    RECOVER_LINK_PREFIX: 'bts_recover_link_',
    // 家族键构建器：默认 bts_ 前缀；规则 7 允许传包码 pkg（如 qy → bts_qy_abnormal_x）。
    nature: (nature, pkg) => `bts_${pkg ? `${pkg}_` : ''}n_${nature}`,
    abnormal: (name, pkg) => `bts_${pkg ? `${pkg}_` : ''}abnormal_${name}`,
    bless: (name, pkg) => `bts_${pkg ? `${pkg}_` : ''}bless_${name}`,
    pet: (name, pkg) => `bts_${pkg ? `${pkg}_` : ''}pet_${name}`,
};

// 统一「星启」显示标记：主公星启（isZhu 派生）与技能星启（祝福层数）共用，来源列表记在全局
// 维护技能 storage。须 bts_ 前缀：裸名 'xingqi' 与本体内建（时计包 shiji）撞名时 ??= 会静默跳过注册。
export const GOD_MARK = 'bts_mk_xingqi'; // 统一星启显示标记（mark: true，由来源同步挂摘）

// 来源维护全局技能名（兼 storage 键）：storage[SOURCE_TRACK][<标记名>] = { source: [...] }。
// markIntro 据此渲染「当前来源」行；启用只需在 SOURCE_TRACKABLE_MARKS 注册并传 trackSource:true。
export const SOURCE_TRACK = 'bts_mk_source_track';

// 主公星启（isZhu 分支）是否按 config 启用（bts_god_condition）：all 均启用 / bts_present 仅崩铁
// 角色在场 / bts_zhu 仅崩铁角色为主公 / off 不启用。仅门控主公星启；供 utils.js god() 与
// SOURCE_TRACKABLE_MARKS 共用（避免循环依赖）。
export function isLordGodEnabled() {
    const condition =
        game.getExtensionConfig?.('崩铁杀', 'bts_god_condition') ?? 'all';
    if (condition === 'all') return true;
    if (condition === 'off') return false;
    if (condition === 'bts_present')
        return game.hasPlayer(
            (player) => (player.name1 || '').startsWith('bts_'),
        );
    if (condition === 'bts_zhu')
        return (game.zhu?.name1 || '').startsWith('bts_');
    return true;
}

// 来源可追踪标记注册表：标记名 → (player) => 当前来源 id 数组；仅「来源并集/可变」的需注册
//（现为星启：zhu=主公 / skill=技能祝福层）。
export const SOURCE_TRACKABLE_MARKS = {
    [GOD_MARK]: (player) => {
        const src = [];
        if (player.isZhu === true && isLordGodEnabled()) src.push('zhu');
        if (player.countMark(MARKS.bless('god')) > 0) src.push('skill');
        return src;
    },
};

/**
 * 统一的标记来源同步：重算 SOURCE_TRACKABLE_MARKS 各标记的来源列表写入 storage[SOURCE_TRACK][mark]，
 * 再按「来源驱动显示」挂摘标记（来源空 → 移除；有来源 → 挂载，主公星启 0 层也显示）。
 */
export function syncMarkSources(player) {
    if (!player || typeof player.countMark !== 'function') return;
    if (!player.storage[SOURCE_TRACK]) player.storage[SOURCE_TRACK] = {};
    for (const [mark, getSource] of Object.entries(SOURCE_TRACKABLE_MARKS)) {
        const source = getSource(player);
        player.storage[SOURCE_TRACK][mark] = { source };
        if (mark === GOD_MARK) {
            if (source.length) {
                if (!player.hasSkill(GOD_MARK)) player.addSkill(GOD_MARK);
            } else if (player.hasSkill(GOD_MARK)) {
                player.removeSkill(GOD_MARK);
            }
        }
        // 其余来源可追踪标记的显示仍由「层数>0 → addSkill」的生命周期承载，
        // 此处只维护来源列表供悬浮展示，不重复挂摘。
    }
}

// ── 标记显示类型（markType）：image / text / none 三分，由定义对象显式声明 ──
// 'image' 有图标（默认，解析 image/mark/<image||键名>.png，文件名即键名，见《标记系统规范》§三）；
// 'text' 无图标仅文字角标（取 translate 首字）；'none' 仅记录层数不显示 UI。
// 兼容旧写法：mark:false / markKind:'record' 视为 'none'。
export const MARK_TYPES = ['image', 'text', 'none'];

/** 归一标记显示类型：markType 优先，其次兼容 mark:false / markKind:'record'。 */
export function normalizeMarkType(def = {}) {
    if (def.markType) return def.markType;
    if (def.mark === false || def.markKind === 'record') return 'none';
    return 'image';
}

// ── 标记变更 log 策略（定夺）───────
// 仅记录类（none/record/不显示 UI 的内部簿记，如燔世系列）**不写**变更 log；其余一律**保留**
//（资源积累与消耗、祝福/异常都是玩家需要的信息）。单个标记可显式覆盖 markLog: true|false；
// 策略由 rules/index.js 的 addMark/removeMark 包装统一执行。

/** 标记变更是否写 log（未显式传 log 参数时生效）。 */
export function shouldLogMark(mark) {
    const def = lib.skill[mark];
    if (typeof def?.markLog === 'boolean') return def.markLog;
    if (def && normalizeMarkType(def) === 'none') return false;
    return true;
}
// 来源列表 → 显示文本（intro「当前来源」行）。仅带来源追踪的标记会命中。
const formatSources = (source) => {
    const map = { zhu: '主公星启', skill: '技能来源（星尘/天阙）' };
    return source.map((s) => map[s] || s).join('、');
};

// ── 内部回填表（buildMarkSkill 填充；勿手工维护）───────────────
// marktext/intro.name 模块加载期即时求值需名字；最终显示来源是 lib.translate（fullTranslate，惰性读取）。
const RULE_TRANSLATE = {};
const MARK_GLOSSARY = {};

/** 纯展示类标记基座：mark: true 由引擎渲染标记，悬浮名取 translate[id]（中文）。 */
export const markIntro = (name, opts = {}) => {
    const skill = {
        hiddenSkill: true,
        locked: true,
        mark: true,
        marktext: (RULE_TRANSLATE[name] || name).slice(0, 1),
        intro: {
            name: RULE_TRANSLATE[name] || name,
            // 「当前有X点」仅在有层数时显示；层数默认取本标记 storage，依托其它标记的经
            // opts.layersFrom 指定；来源列表读 storage[SOURCE_TRACK][name].source。
            content: (storage, player) => {
                const title = lib.translate[name] || RULE_TRANSLATE[name] || name;
                const info = lib.translate[`${name}_info`] || '';
                const glossaryInfo = lib.translate[`${MARK_GLOSSARY[name]}_info`] || '';
                const layers =
                    opts.layersFrom && player?.countMark
                        ? player.countMark(opts.layersFrom)
                        : storage;
                const parts = [];
                if (layers > 0) parts.push(`当前有${layers}点${title}`);
                // 「当前来源」仅对启用来源追踪（opts.trackSource）的标记显示。
                const src = opts.trackSource
                    ? player?.getStorage(SOURCE_TRACK)?.[name]?.source
                    : undefined;
                if (Array.isArray(src) && src.length)
                    parts.push(`<li>当前来源：${formatSources(src)}</li>`);
                if (info) parts.push(`<li>${info}</li>`);
                if (glossaryInfo) parts.push(`<li>${title}：${glossaryInfo}</li>`);
                return parts.join('');
            },
        },
    };
    return skill;
};

/** 仅记录类标记基座：mark: false，不显示标记 UI（addSkill 时引擎跳过 markSkill）。 */
const hiddenMark = () => ({ mark: false });

/**
 * 标记技能构建器（markIntro / hiddenMark 基座分派）。定义对象字段：markKind、markType、
 * image、permanent、glossaryId、layersFrom/trackSource（markIntro 参数）、mark:false(=none)，
 * 其余为引擎效果字段；显示名/悬浮说明在 translateMap。
 */
export function buildMarkSkill(name, def = {}, translateMap = {}) {
    const {
        markKind,
        markType,
        permanent,
        glossaryId,
        layersFrom,
        trackSource,
        image,
        mark,
        name: displayName,
        markContent,
        ...effect
    } = def;
    // 回填内部表（marktext/intro.name 模块加载期即时求值需要）
    if (displayName) RULE_TRANSLATE[name] = displayName;
    else if (!RULE_TRANSLATE[name]) RULE_TRANSLATE[name] = translateMap[name] || name;
    if (glossaryId) MARK_GLOSSARY[name] = glossaryId;
    const type = normalizeMarkType({ markType, markKind, mark });
    // 基座分派：none → hiddenMark（仅记录，不挂显示技能）；image/text → 显示角标
    const base =
        type === 'none'
            ? hiddenMark()
            : markIntro(name, { layersFrom, trackSource });
    const skill = { ...base, ...effect };
    // 图标：仅 image 类型挂 markimage（基名即键名，或 image 字段的复用基名）。
    // 引擎对 markimage 只做 `lib.assetURL + 值`，扩展素材须带 extensionPath 前缀
    //（同 char.img/skinPath/audio 约定），否则落到游戏根 image/mark/ 无法渲染。
    if (type === 'image' && !effect.markimage) {
        skill.markimage = `${extensionPath}/image/mark/${image || name}.png`;
    }
    return skill;
}
