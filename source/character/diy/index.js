// DIY 角色包（群友投稿 DIY 角色）入口。
// 角色源码按 roles/<阵营>/<角色>.js 分目录维护（同角色多份投稿以「<角色>_<投稿人>」后缀命名区分，
// 如 baie_yingxing），但汇总为一个独立包 bts_diy——包名唯一性铁律：无名杀本体已有官方「diy」包，
// 与之撞名会让引擎跳过本包的角色注册（2026-10-09 实机教训）；阵营沿用 bts 八势力，
// 只是 characterSort.bts_diy 内的分类。角色/技能/标记键统一 bts_diy_ 前缀（《标记系统规范》§一 规则 7）。
// 公共机制（势力/属性/护盾/怒气/词条）与 bts 包共用同一份 rules 层；全局 buff/标记技能此处一并烘焙
//（bts 包启用时同键先注册者胜、本包副本被静默跳过），故单独启用本包时公共机制仍完整。
// 应急插入点：临时 buff/标记/翻译可在 markEntries/mergedTranslate 内联，再交 buildMarkSkill。
import { lib, game, ui, get, ai, _status } from '../../../../../noname.js';
import { createRolePack } from '../../tool/pack/rolePack.js';
import { buildDerivationRules, attachGlossaryDerivations } from '../../tool/pack/skillDerivations.js';
import { normalizeVoiceKeys } from '../../tool/utils/audioPaths.js';
import { buildMarkSkill } from '../../rules/markRegistry.js';
import { buffSkills as GLOBAL_BUFFS, translate as GLOBAL_BUFFS_TRANSLATE } from '../../rules/globalBuffs.js';
import { marks as GLOBAL_MARKS, translate as GLOBAL_MARKS_TRANSLATE } from '../../rules/globalMarks.js';
import { translate as factionsTranslate } from '../bts/factions.js';
import { translate as naturesTranslate } from '../../rules/natures.js';
import { renderTitle } from '../../tool/ui/title.js';
import { AUDIO_COUNTS } from './audio.js';
import { glossary as GLOBAL_GLOSSARY } from '../../rules/globalrules.js';

// 包名翻译（势力名翻译见 bts/factions.js；包管理菜单读 `translate[bts_diy]`，与 bts 包「崩铁杀」同源）。
const metaTranslate = { bts_diy: '崩铁杀DIY' };
// 通用机制键翻译（非标记/非技能——如额外回合标签 bts_extra_turn：引擎额外回合日志走
// `【get.translation(skill)】`，无翻译会漏出原始键）。
const rulesTranslate = { bts_extra_turn: '额外回合' };
const PACK_NAME = 'bts_diy'; // 唯一包名（勿用 'diy'：与本体官方 diy 包撞名，loadCharacter 会跳过角色注册）
const connectAllowed = true;
export const connectBanned = [];

// scripts/rebuild.mjs 自动递归扫描 roles/<阵营>/*.js 并更新本数组。
// 每一项是不含 .js 的、相对于本目录的模块路径。
const ROLE_FILES = [
    'roles/huangjinyi/baie_yingxing',
];
const modules = await Promise.all(
    ROLE_FILES.map((fileName) => import(`./${fileName}.js`)),
);
const roles = createRolePack(ROLE_FILES, modules, PACK_NAME);
const resourceNames = roles.createResourceNames('bts_diy_ch_');

// 包管理菜单显示名走 `translate[bts_diy]`（「崩铁杀DIY」，与 bts 包同一取法），不设 displayName 覆写。
// defaultEnabled: false——导入时**不自动加入已启用包列表**（DIY 包默认关闭；玩家可在武将管理手动开启。
// 一次性标记 `<包名>_character_pack` 机制见 tool/pack/registry.js 的 enablePack，手动开关不被覆盖；
// bts 主体包保持默认开启）。
export const packMeta = {
    resourceNames,
    defaultEnabled: false,
};

// 所有角色共用一个 characterSort.bts_diy，按角色模块的 sort（阵营 key）分组。
export const characterSort = roles.createCharacterSort();
// 称号 `属性·命途·昵称` 渲染成「属性图标 + 命途图标 + 昵称」HTML（tool/ui/title.js）。
export const characterTitle = Object.fromEntries(
    Object.entries(roles.collect('title')).map(([id, title]) => [
        id,
        renderTitle(title),
    ]),
);
export const characterIntro = roles.collect('intro');

export const character = {
    ...roles.merge('character'),
    // 替代形态不进入 ROLE_FILES，但需要注册到 lib.character 供 bts.changeHero/reinit 切换。
    ...roles.merge('transformCharacter'),
};
// 本表仅承载技能触发的形态切换；皮肤注册见 bts/index.js 文件头注释。
export const characterSubstitute = roles.merge('characterSubstitute');
export const perfectPair = roles.collect('perfectPair');

// ── 专有名词词条 ────────────────────────────────────────────────────────
// 正文由属主文件导出：通用机制 → rules/globalrules.js glossary；角色专属 → 角色文件 glossary
//（rolePack.gather 数组合并）。显示名/解释平铺并入 fullTranslate；
// get.poptip('词条id') 悬浮点击见 tool/ui/poptips.js（按包 translate 前缀扫描）。
const GLOSSARY = [...GLOBAL_GLOSSARY, ...roles.gather('glossary')];
const GLOSSARY_TRANSLATE = Object.fromEntries(
    GLOSSARY.flatMap((g) => [
        [g.id, g.name],
        [`${g.id}_info`, g.info],
    ]),
);

// ── 标记/buff 技能合并 ─────────────────────────────────────────────────
// 全局 buff/标记（globalBuffs.js / globalMarks.js）与角色特有条目（角色文件
// buffSkills/marks）并列合并为 markEntries，经 buildMarkSkill 按类型烘焙
//（image/text → markIntro，none → hiddenMark）后并入 skill 注册进 lib.skill。
// 应急插入缝：临时新增 buff/标记可在此展开内联对象（带 markKind 标签）。
const markEntries = {
    ...GLOBAL_BUFFS,
    ...roles.merge('buffSkills'),
    ...GLOBAL_MARKS,
    ...roles.merge('marks'),
};
// 标记显示名/悬浮说明的统一查表（translate[id] + translate[id+'_info']；词条名经 glossaryId）。
const mergedTranslate = {
    ...metaTranslate,
    ...rulesTranslate,
    ...factionsTranslate,
    ...naturesTranslate,
    ...roles.merge('translate'),
    ...GLOBAL_BUFFS_TRANSLATE,
    ...GLOBAL_MARKS_TRANSLATE,
};
export const skill = {
    ...roles.merge('skill'),
    ...Object.fromEntries(
        Object.entries(markEntries).map(([name, def]) => [
            name,
            buildMarkSkill(name, def, mergedTranslate),
        ]),
    ),
};

// 专有名词词条 derivation：按技能特征自动挂载（如护盾技能 → 护盾词条），
// 详情页显示关联词条；不覆盖技能已有的 derivation（tool/pack/skillDerivations.js）。
attachGlossaryDerivations(skill, buildDerivationRules(GLOSSARY));

// 对齐叁岛 registry 的预设：仅对显式 audio 数值转换路径。
// 本表由素材生成脚本写入，避免运行时读取扩展文件系统；角色手写的 audio 优先。
for (const [skillId, count] of Object.entries(AUDIO_COUNTS)) {
    if (skill[skillId] && skill[skillId].audio == null)
        skill[skillId].audio = count;
}

export const fullTranslate = {
    ...metaTranslate,
    ...rulesTranslate,
    // 势力名/属性名（bts/factions.js、rules/natures.js 单一来源，与 bts 包共用）。
    ...factionsTranslate,
    ...naturesTranslate,
    // 角色翻译里的 $bts_diy_<技能>N / ~bts_diy_<角色> 作者语音键 → 引擎 # 字幕键。
    ...normalizeVoiceKeys(roles.merge('translate'), resourceNames),
    // 全局 buff/标记 补充翻译（名字 + _info 悬浮说明）。
    ...GLOBAL_BUFFS_TRANSLATE,
    ...GLOBAL_MARKS_TRANSLATE,
    // 专有名词词条翻译（护盾/怒气/属性等通用 + 本包角色专属）。
    ...GLOSSARY_TRANSLATE,
};
export const simpleTranslate = {
    ...fullTranslate,
    ...roles.merge('simpleTranslate'),
};
export const dynamicTranslate = roles.merge('dynamicTranslate');
export const pinyins = roles.merge('pinyins');

for (const [key, infoText] of Object.entries(simpleTranslate)) {
    if (!key.endsWith('_info')) continue;
    dynamicTranslate[key.slice(0, -5)] ??= () => infoText;
}

export const info = {
    name: PACK_NAME,
    connect: connectAllowed,
    connectBanned,
    character,
    characterSort,
    characterTitle,
    characterIntro,
    characterSubstitute,
    perfectPair,
    skill,
    translate: fullTranslate,
    dynamicTranslate,
    pinyins,
};
