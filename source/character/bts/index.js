// 崩铁杀唯一角色包入口。
// 角色源码按 roles/<阵营>/<角色>.js 分目录维护，但所有角色只汇总为一个 bts 包；
// seven factions are characterSort.bts 内的分类，而非可单独开关的角色包。
// 合并点（应急插入）：新增临时 buff/标记/翻译可在此处 markEntries/mergedTranslate 内联，再交 buildMarkSkill。
import { lib, game, ui, get, ai, _status } from '../../../../../noname.js';
import { createRolePack } from '../../tool/pack/rolePack.js';
import { normalizeVoiceKeys } from '../../tool/utils/audioPaths.js';
import { buildMarkSkill } from '../../rules/markRegistry.js';
import { buffSkills as GLOBAL_BUFFS, translate as GLOBAL_BUFFS_TRANSLATE } from '../../rules/globalBuffs.js';
import { marks as GLOBAL_MARKS, translate as GLOBAL_MARKS_TRANSLATE } from '../../rules/globalMarks.js';
import { translate as factionsTranslate } from './factions.js';
import { translate as naturesTranslate } from '../../rules/natures.js';
import { renderTitle } from '../../tool/ui/title.js';
import { AUDIO_COUNTS } from './audio.js';
import { glossary as GLOBAL_GLOSSARY } from '../../rules/globalrules.js';
// 可选皮肤不注册 characterSubstitute：换肤由引擎经 character.skinPath
// （registry.js fillCharacterResources → image/skin/<资源名>/）目录扫描发现；
// characterSubstitute 仅留给技能触发的形态切换（如召唤忆灵），恒为对象。
// 可选皮肤显示名（bts_<角色>_skinN）自 skins.js 拆分归位后随各角色文件 translate
// 经 roles.merge('translate') 进 fullTranslate（scripts/migrate.mjs --skins 维护）。

// 包名翻译（原 meta.js 内容，TODO 任务2 内联于此；势力名翻译见 factions.js）。
const metaTranslate = { bts: '崩铁杀' };
// 通用机制键翻译（非标记/非技能——如额外回合标签 bts_extra_turn：
// 引擎额外回合日志走 `【get.translation(skill)】`，无翻译会漏出原始键）。
const rulesTranslate = { bts_extra_turn: '额外回合' };
const PACK_NAME = 'bts';
const connectAllowed = true;
export const connectBanned = [];

// scripts/rebuild.mjs 自动递归扫描 roles/<阵营>/*.js 并更新本数组。
// 每一项是不含 .js 的、相对于本目录的模块路径。
const ROLE_FILES = [
    'roles/erxiangleyuan/aha',
    'roles/erxiangleyuan/busitu',
    'roles/erxiangleyuan/gilgamesh',
    'roles/erxiangleyuan/huohua',
    'roles/erxiangleyuan/jizi_qixing',
    'roles/erxiangleyuan/ren_qianye',
    'roles/erxiangleyuan/shajin_xilang',
    'roles/erxiangleyuan/yinlang_lv999',
    'roles/erxiangleyuan/yuanbanlin',
    'roles/erxiangleyuan/zhigengniao_qingge',
    'roles/heitakongjianzhan/aisida',
    'roles/heitakongjianzhan/alan',
    'roles/heitakongjianzhan/daheita',
    'roles/heitakongjianzhan/heita',
    'roles/heitakongjianzhan/ruanmei',
    'roles/heitakongjianzhan/zhenliyisheng',
    'roles/huangjinyi/agelaiya',
    'roles/huangjinyi/baie',
    'roles/huangjinyi/changyeyue',
    'roles/huangjinyi/danheng_tenghuang',
    'roles/huangjinyi/fengjin',
    'roles/huangjinyi/haiseyin',
    'roles/huangjinyi/kelvdela',
    'roles/huangjinyi/nakexia',
    'roles/huangjinyi/saifeier',
    'roles/huangjinyi/tibao',
    'roles/huangjinyi/wandi',
    'roles/huangjinyi/xiadie',
    'roles/huangjinyi/xilian',
    'roles/pinuokangni/archer',
    'roles/pinuokangni/botiou',
    'roles/pinuokangni/dalihua',
    'roles/pinuokangni/feicui',
    'roles/pinuokangni/heitiane',
    'roles/pinuokangni/huahuo',
    'roles/pinuokangni/huangquan',
    'roles/pinuokangni/jialahe',
    'roles/pinuokangni/luanpo',
    'roles/pinuokangni/misha',
    'roles/pinuokangni/saber',
    'roles/pinuokangni/shajin',
    'roles/pinuokangni/tuopa',
    'roles/pinuokangni/xingqiri',
    'roles/pinuokangni/yinzhi',
    'roles/pinuokangni/zhigengniao',
    'roles/xianzhou/bailu',
    'roles/xianzhou/danheng_yinyue',
    'roles/xianzhou/feixiao',
    'roles/xianzhou/fuxuan',
    'roles/xianzhou/guinaifen',
    'roles/xianzhou/hanya',
    'roles/xianzhou/huohuo',
    'roles/xianzhou/jiaoqiu',
    'roles/xianzhou/jingliu',
    'roles/xianzhou/jingyuan',
    'roles/xianzhou/lingsha',
    'roles/xianzhou/luocha',
    'roles/xianzhou/moze',
    'roles/xianzhou/qingque',
    'roles/xianzhou/sushang',
    'roles/xianzhou/tingyun',
    'roles/xianzhou/tingyun_wangguiren',
    'roles/xianzhou/xueyi',
    'roles/xianzhou/yanqing',
    'roles/xianzhou/yukong',
    'roles/xianzhou/yunli',
    'roles/xinghelieshou/kafuka',
    'roles/xinghelieshou/liuying',
    'roles/xinghelieshou/ren',
    'roles/xinghelieshou/yinlang',
    'roles/xingqionglieche/danheng',
    'roles/xingqionglieche/himiko',
    'roles/xingqionglieche/kaituozhe',
    'roles/xingqionglieche/sanyueqi',
    'roles/xingqionglieche/welt',
    'roles/yaliluo/buluoniya',
    'roles/yaliluo/huke',
    'roles/yaliluo/jiepade',
    'roles/yaliluo/kelala',
    'roles/yaliluo/lingke',
    'roles/yaliluo/luka',
    'roles/yaliluo/natasha',
    'roles/yaliluo/peila',
    'roles/yaliluo/sangbo',
    'roles/yaliluo/xier',
    'roles/yaliluo/xiluwa',
];
const modules = await Promise.all(
    ROLE_FILES.map((fileName) => import(`./${fileName}.js`)),
);
const roles = createRolePack(ROLE_FILES, modules, PACK_NAME);
const resourceNames = roles.createResourceNames('bts_ch_');

export const packMeta = {
    resourceNames,
    defaultEnabled: true,
};

// 所有角色共用一个 characterSort.bts，按角色模块的 sort（阵营 key）分组。
export const characterSort = roles.createCharacterSort();
// 称号 `属性·命途·昵称` 渲染成「属性图标 + 命途图标 + 昵称」HTML（tool/ui/title.js）。
// 图标为 <noname-poptip>（content 阶段注册属性/命途词条 poptip），点击看中文名；
// 命途中文名被命途图标直接替换。未配素材/无前缀的称号原样透传。
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
export const characterReplace = roles.merge('characterReplace');
export const characterFilter = roles.merge('characterFilter');
// 可选皮肤不再经 characterSubstitute 注册（见文件头注释），
// 本表仅承载技能触发的形态切换（如召唤忆灵）。
export const characterSubstitute = roles.merge('characterSubstitute');
export const perfectPair = roles.collect('perfectPair');

// ── 专有名词词条（TODO 任务3 自 glossary.js 拆分归位）────────────────────────
// 词条正文由属主文件导出：通用机制词条 → rules/globalrules.js 的 glossary；
// 角色专属词条 → 各角色文件的 glossary（经 rolePack.gather 数组合并，非覆盖）。
// 显示名/解释以 id/id_info 平铺并入 fullTranslate（词条数据无技能对象），
// get.poptip('词条id') 悬浮点击见 tool/ui/poptips.js（按包 translate 前缀扫描）。
const GLOSSARY = [...GLOBAL_GLOSSARY, ...roles.gather('glossary')];
const GLOSSARY_TRANSLATE = Object.fromEntries(
    GLOSSARY.flatMap((g) => [
        [g.id, g.name],
        [`${g.id}_info`, g.info],
    ]),
);

// ── 技能 → 词条 derivation 自动挂载规则（自 glossary.js 迁入，全文照搬）──────
// test(id, src, info)：src 为技能 id + 各函数/字符串字段的源码文本；第三参 info 为技能对象。
const DERIVATION_RULES = [
    // 2026-09-28 修复：原查 id.startsWith('bts_st_') 恒 false（旧前缀）——必杀技统一以
    // bts_bisha 标签判定（同 zaixian/军功等 bts_bisha 判定范式）。
    { id: 'bts_glossary_bisha_faq', test: (id, src, info) => info?.bts_bisha === true },
    {
        id: 'bts_glossary_nuqi_faq',
        test: (id, src) =>
            /(?:getAngry|loseAngry|addAngry|'angry'|"angry"|'bts_mk_angry'|"bts_mk_angry")/.test(
                src,
            ),
    },
    {
        id: 'bts_glossary_hudun_faq',
        test: (id, src) =>
            /hudun|'shield'|"shield"|'bts_shield'|"bts_shield"/.test(src),
    },
    {
        id: 'bts_glossary_xingqi_faq',
        test: (id, src) => /bts\.god\(|bless_god|'god'/.test(src),
    },
    {
        id: 'bts_glossary_bless_faq',
        test: (id, src) => /addBless|removeBless|getBless/.test(src),
    },
    { id: 'bts_glossary_canmeng_faq', test: (id, src) => /canmeng/.test(src) },
    {
        id: 'bts_glossary_feihuang_faq',
        test: (id, src) => /feihuang/.test(src),
    },
    {
        id: 'bts_glossary_zhongdu_faq',
        test: (id, src) => /poison|zhongdu/.test(src),
    },
    { id: 'bts_glossary_mabi_faq', test: (id, src) => /numb|mabi/.test(src) },
    {
        id: 'bts_glossary_guantong_faq',
        test: (id, src) => /'through'/.test(src),
    },
    {
        id: 'bts_glossary_nature_dark_faq',
        test: (id, src) => /nature\s*:\s*'dark'/.test(src),
    },
    {
        id: 'bts_glossary_nature_light_faq',
        test: (id, src) => /nature\s*:\s*'light'/.test(src),
    },
    {
        id: 'bts_glossary_nature_flame_faq',
        test: (id, src) => /nature\s*:\s*'flame'/.test(src),
    },
    {
        id: 'bts_glossary_nature_wind_faq',
        test: (id, src) => /nature\s*:\s*'wind'/.test(src),
    },
    {
        id: 'bts_glossary_nature_frost_faq',
        test: (id, src) => /nature\s*:\s*'frost'/.test(src),
    },
    {
        id: 'bts_glossary_nature_elec_faq',
        test: (id, src) => /nature\s*:\s*'elec'/.test(src),
    },
];

// 具体祝福词条自动规则：技能源码含 '<blessKey>'（如 'zhiyu'、'dark'）→
// 挂载对应祝福词条（bts_glossary_bless_<key>_faq），而非仅总「祝福」词条。
for (const glossary of GLOSSARY) {
    const m = /^bts_glossary_bless_([a-z]+)_faq$/.exec(glossary.id);
    if (!m) continue;
    const blessKey = m[1];
    DERIVATION_RULES.push({
        id: glossary.id,
        test: (id, src) => src.includes(`'${blessKey}'`),
    });
}

/** 收集技能对象的可检查源码文本（函数取 toString，字符串字段原样）。 */
function collectSkillSource(id, info) {
    const parts = [id];
    for (const value of Object.values(info)) {
        if (typeof value === 'function') parts.push(String(value));
        else if (typeof value === 'string') parts.push(value);
    }
    return parts.join('\n');
}

/**
 * 为角色包技能自动挂载词条 derivation（追加，不覆盖已有 derivation）。
 * 在 skill 合并后调用（见下）。
 */
function attachGlossaryDerivations(skillMap) {
    for (const [id, info] of Object.entries(skillMap || {})) {
        if (!info || typeof info !== 'object') continue;
        if (id.startsWith('bts_glossary_')) continue; // 词条技能不挂载，避免自引用
        const deps = new Set(
            Array.isArray(info.derivation)
                ? info.derivation
                : info.derivation
                    ? [info.derivation]
                    : [],
        );
        const src = collectSkillSource(id, info);
        for (const rule of DERIVATION_RULES) {
            if (rule.test(id, src, info)) deps.add(rule.id);
        }
        if (deps.size) {
            info.derivation = deps.size === 1 ? [...deps][0] : [...deps];
        }
    }
}

// ── 标记/buff 技能合并（阶段2 标签化，2026-09-04）────────────────────────────
// 全局 buff（globalBuffs.js）与角色特有 buff（角色文件 buffSkills）并列合并，全局
// 标记（globalMarks.js）与角色主题标记（角色文件 marks）并列合并为单一 markEntries；
// 全部经 rules/markRegistry.js buildMarkSkill 按 markKind 分派烘焙
//（bless/abnormal/... → markIntro 基座，record → hiddenMark），并入 skill 随
// info.skill 注册进 lib.skill——installBuffSkillLifecycle 的 addMark→addSkill
// 生命周期（content.js）据此照常挂摘。
export const buffSkills = { ...GLOBAL_BUFFS, ...roles.merge('buffSkills') };
// 应急插入缝：临时新增 buff/标记可在此展开内联对象（带 markKind 标签），最终并入 skill。
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

// 专有名词词条 derivation：按技能特征自动挂载（如怒气技能 → 怒气词条），
// 详情页显示关联词条；不覆盖技能已有的 derivation。
attachGlossaryDerivations(skill);

// ── 触发技 content 归正（2026-08-24）────────────────────────────────────────
// 已移除旧的「绑定兼容层」（曾把触发技 content 首参/二参对调注册，制造非标准
// 「首参=触发事件」约定）。现按引擎标准书写：content(event, trigger, player) 中
// event=技能事件（含自选 .cards/.targets/.cost_data 与 .triggername）、
// trigger=触发事件（读其 .player/.source/.num/.getl 等，判变体用 event.triggername）；
// filter(event, player, triggername) 第 3 参 triggername 为带 Before/After 后缀完整触发名。

// 对齐叁岛 registry 的预设：仅对显式 audio 数值转换路径。
// 本表由素材生成脚本写入，避免运行时读取扩展文件系统；角色手写的 audio 优先。
for (const [skillId, count] of Object.entries(AUDIO_COUNTS)) {
    if (skill[skillId] && skill[skillId].audio == null)
        skill[skillId].audio = count;
}

export const fullTranslate = {
    ...metaTranslate,
    ...rulesTranslate,
    // 势力名/属性名（factions.js/natures.js 单一来源）。
    ...factionsTranslate,
    ...naturesTranslate,
    // 角色翻译里的 $bts_<技能>N / ~bts_<角色> 作者语音键 → 引擎 # 字幕键（唯一映射点，见 audioPaths.js）。
    ...normalizeVoiceKeys(roles.merge('translate'), resourceNames),
    // 全局 buff/标记 补充翻译（名字 + _info 悬浮说明）。
    ...GLOBAL_BUFFS_TRANSLATE,
    ...GLOBAL_MARKS_TRANSLATE,
    // 专有名词词条翻译（怒气/护盾/星启/祝福/属性等；自 glossary.js 归位，见上方聚合）。
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
    characterReplace,
    characterFilter,
    characterSubstitute,
    perfectPair,
    skill,
    translate: fullTranslate,
    dynamicTranslate,
    pinyins,
};
