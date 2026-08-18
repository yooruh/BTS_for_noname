// 崩铁杀标记机制（阶段2 瘦身：内容层已迁出）。
// 本文件只承载「标记注册机制/工具链」：
//   - MARKS 命名助手 / GOD_MARK / SOURCE_TRACK（星启来源追踪）
//   - MARK_TYPES / normalizeMarkType 显示类型（image/text/none 三分）
//   - markIntro / hiddenMark 构建器 + buildMarkSkill（自旧 rules/buffs.js 迁入）
//   - RULE_TRANSLATE / MARK_GLOSSARY 内部回填表（buildMarkSkill 由 mergedTranslate/glossaryId 填充）
// 内容层落位：势力 → character/bts/factions.js；属性 → rules/natures.js；
// 全局标记 → rules/globalMarks.js；全局 buff → rules/globalBuffs.js；
// 角色标记/buff → 角色文件 buffSkills/marks；派生表 → source/generated/buffRegistry.js。
import { lib, game, get } from '../../../../noname.js';
import { extensionPath } from '../tool/utils/paths.js';

export const MARKS = {
    // 本扩展注册到 lib.translate/lib.skill 的标记键一律 bts_ 前缀（命名空间规则，见《标记系统规范》§一）。
    // angry/shield 亦非本体认领（本体全量翻译表无这些键），故一并 bts_，避免与其它包/本体撞名。
    ANGRY: 'bts_mk_angry',
    SHIELD: 'bts_shield',
    CURSE: 'bts_curse',
    EXTRA_MAX: 'bts_mk_extra_max',
    DAMAGE_LINK_PREFIX: 'bts_damage_link_',
    RECOVER_LINK_PREFIX: 'bts_recover_link_',
    // 家族键构建器。默认 `bts_` 前缀；规则 7：非崩铁杀包可传包码 pkg（如 qy → bts_qy_abnormal_x）。
    // pkg 省略时行为与旧签名完全一致，现有调用无需改动。
    nature: (nature, pkg) => `bts_${pkg ? `${pkg}_` : ''}n_${nature}`,
    abnormal: (name, pkg) => `bts_${pkg ? `${pkg}_` : ''}abnormal_${name}`,
    bless: (name, pkg) => `bts_${pkg ? `${pkg}_` : ''}bless_${name}`,
    pet: (name, pkg) => `bts_${pkg ? `${pkg}_` : ''}pet_${name}`,
};

// 统一「星启」显示标记与其来源维护：
// 无论主公星启（身份派生 isZhu）还是技能星启（星尘/天阙给予的星启祝福层数），
// 都显示同一个「星启」标记（GOD_MARK）；来源列表记在全局维护技能 storage 上。
// GOD_MARK 用 bts_ 前缀命名空间化：裸名 'xingqi' 会与无名杀本体内建标记技能
// （时计包 shiji 的备/誓）撞名，导致 registerRules 的 lib.skill[id] ??= 静默跳过本
// 扩展注册、游戏内 addSkill('xingqi') 挂上本体技能而非本扩展统一星启标记。
export const GOD_MARK = 'bts_mk_xingqi'; // 统一星启显示标记（mark: true，由来源同步挂摘）

// 来源维护全局技能名（兼 storage 键）。单一全局技能为所有标记统一维护「当前来源」：
// storage[SOURCE_TRACK][<标记名>] = { source: ['来源id', ...] }。markIntro 据此渲染
// 悬浮「当前来源」行；其它标记要启用来源展示只需在 SOURCE_TRACKABLE_MARKS 注册并在
// markIntro 传 trackSource:true。
export const SOURCE_TRACK = 'bts_mk_source_track';

// 主公星启（isZhu 分支）是否按 config 启用（config.js bts_god_condition）：
// all 均启用 / bts_present 仅崩铁角色在场 / bts_zhu 仅崩铁角色为主公 / off 不启用。
// 仅门控「主公星启」；技能星启（bless_god 层数）不受影响。
// 供 utils.js god() 与下方 SOURCE_TRACKABLE_MARKS 共用（避免 rules 间循环依赖）。
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

// 来源可追踪标记注册表：标记名 → (player) => 当前来源 id 数组。
// 全库仅需为「来源会并集/可变」的标记注册（现为星启：zhu=主公星启 / skill=星启祝福层）。
export const SOURCE_TRACKABLE_MARKS = {
    [GOD_MARK]: (player) => {
        const src = [];
        if (player.isZhu === true && isLordGodEnabled()) src.push('zhu');
        if (player.countMark(MARKS.bless('god')) > 0) src.push('skill');
        return src;
    },
};

/**
 * 统一的标记来源同步：重算 SOURCE_TRACKABLE_MARKS 里每个标记的当前来源列表并写入
 * storage[SOURCE_TRACK][mark]，再按「来源驱动显示」规则挂摘标记。
 * - 来源空 → 移除标记（如星启祝福耗尽且非主公）；
 * - 有来源 → 挂载标记（星启即便 0 层祝福，主公也显示）。
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

// ── 标记显示类型（markType）：图像 / 文字 / 仅记录 三分 ─────────────────────
// 由标记定义对象显式声明（角色文件 / globalMarks / globalBuffs 的 marks|buffSkills）：
//   'image' —— 有图标素材，渲染图标角标（默认）；
//   'text'  —— 无图标素材，仅渲染文字角标（取 translate 首字）；
//   'none'  —— 仅记录层数，不显示任何标记 UI（内部计数 / 阶段键 / 已沉底的祝福）。
// 图标一律解析为 image/mark/<image || 标记键>.png：**文件名即键名**（改名方案，
// 见《标记系统规范》§三），故无需回映表；定义对象可用 image 字段指定其它基名（复用图标）。
// 兼容旧写法：mark:false 或 markKind:'record' 视为 'none'。
export const MARK_TYPES = ['image', 'text', 'none'];

/** 归一标记显示类型：markType 优先，其次兼容 mark:false / markKind:'record'。 */
export function normalizeMarkType(def = {}) {
    if (def.markType) return def.markType;
    if (def.mark === false || def.markKind === 'record') return 'none';
    return 'image';
}

// ── 标记变更 log 策略（2026-09-26 用户定夺；当日勘误）───────────────
// 仅记录类标记（markType:'none' / markKind:'record' / mark:false——不显示任何标记 UI 的
// 内部簿记，如燔世系列 bts_mk_fanshi_active/used/gain/counter/ending/…）**不写**变更 log：
// 它们仅用于内部计数，UI 都不显示，放进战斗 log 只会冗长；
// 其余标记一律**保留**变更 log——资源（怒气/火种/残梦/飞黄…）的积累与消耗、
// 祝福/异常等特殊效果都是玩家需要的信息，不得删除。
// 单个标记可显式覆盖：标记定义加 `markLog: true | false`
//（如“不可叠层、且已有技能 log 的效果标记”可设 false 避免双份信息）；
// 策略由 rules/index.js 的 addMark/removeMark 生命周期包装统一执行（覆盖全部触点）。

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

// ── 内部回填表（buildMarkSkill 填充；非内容表，勿手工维护）───────────────────
// markIntro 的 marktext/intro.name 在模块加载期即时求值，需要名字；
// 显示名/悬浮说明的最终来源是 lib.translate（包 fullTranslate，游戏内惰性读取）。
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
            // 「当前有X点」行只在有层数时显示；仅有来源（如纯主公星启，星启祝福层=0）
            // 时省略该行。层数默认取本标记计数 storage，依托另一标记计数的（如星启依托
            // 星启祝福层数）经 opts.layersFrom 指定。来源列表由全局维护技能写入
            // storage[SOURCE_TRACK][name].source（player 参数、按标记读取）。
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
                // 「当前来源」只对启用来源追踪的标记显示（opts.trackSource），
                // 避免把来源串进未启用的标记悬浮内容。按标记读取 storage[SOURCE_TRACK][name]。
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
 * 标记技能构建器（自旧 rules/buffs.js 迁入；markIntro/hiddenMark 基座分派）。
 * buff/mark 定义对象字段：markKind（类别）、markType（image/text/none 显示类型）、
 * image（图标基名覆盖）、permanent（常驻）、glossaryId（词条）、
 * layersFrom/trackSource（markIntro 机制参数）、mark:false（旧写法，等同 markType:'none'）、
 * 其余为引擎效果字段。显示名/悬浮说明在 translateMap（translate[id] / translate[id+'_info']）。
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
    // 回填内部表（markIntro 的 marktext/intro.name 即时求值需要）
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
    // 图标：仅 image 类型挂 markimage，基名即键名（或 image 字段指定的复用基名）。
    // 引擎对 skill.markimage 仅做 `lib.assetURL + 值`（setBackgroundImage，游戏根解析），
    // 扩展素材须带 extensionPath 前缀（同 char.img/skinPath/audio/kingdom icon 约定），
    // 否则会落到游戏根 image/mark/（不存在）而无法渲染。
    if (type === 'image' && !effect.markimage) {
        skill.markimage = `${extensionPath}/image/mark/${image || name}.png`;
    }
    return skill;
}
