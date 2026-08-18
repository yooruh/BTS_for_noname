// 崩铁杀唯一角色包入口。
// 角色源码按 roles/<阵营>/<角色>.js 分目录维护，但所有角色只汇总为一个 bts 包；
// seven factions are characterSort.bts 内的分类，而非可单独开关的角色包。
import { lib, game, ui, get, ai, _status } from '../../../../../noname.js';
import { createRolePack } from '../../tool/pack/rolePack.js';
import { normalizeVoiceKeys } from '../../tool/utils/audioPaths.js';
import { AUDIO_COUNTS } from './audio.js';
import { SKIN_TRANSLATE } from './skins.js';
import { GLOSSARY_TRANSLATE, attachGlossaryDerivations } from './glossary.js';
// 可选皮肤不注册 characterSubstitute：换肤由引擎经 character.skinPath
// （registry.js fillCharacterResources → image/skin/<资源名>/）目录扫描发现；
// characterSubstitute 仅留给技能触发的形态切换（如召唤忆灵），恒为对象。

const PACK_NAME = 'bts';
const connectAllowed = true;
export const connectBanned = [];

// scripts/rebuild.mjs 自动递归扫描 roles/<阵营>/*.js 并更新本数组。
// 每一项是不含 .js 的、相对于本目录的模块路径。
const ROLE_FILES = [
    'roles/erxiangleyuan/busitu',
    'roles/erxiangleyuan/gilgamesh',
    'roles/erxiangleyuan/jizi_qixing',
    'roles/erxiangleyuan/ren_qianye',
    'roles/erxiangleyuan/shajin_xilang',
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
const resourceNames = roles.createResourceNames('bts_');

export const packMeta = {
    resourceNames,
    defaultEnabled: true,
};

// 所有角色共用一个 characterSort.bts，按角色模块的 sort（阵营 key）分组。
export const characterSort = roles.createCharacterSort();
export const characterTitle = roles.collect('title');
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
// 词条不带技能对象（_faq 后缀 + poptip character 类型，见 glossary.js）。
export const skill = roles.merge('skill');

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

import { translate as metaTranslate } from './meta.js';
export const fullTranslate = {
    ...metaTranslate,
    // 角色翻译里的 $bts_<技能>N / ~bts_<角色> 作者语音键 → 引擎 # 字幕键（唯一映射点，见 audioPaths.js）。
    ...normalizeVoiceKeys(roles.merge('translate'), resourceNames),
    // 皮肤名显示翻译（皮肤1/皮肤2/…，skins.js 由 migrate-skins.mjs 生成）。
    ...SKIN_TRANSLATE,
    // 专有名词词条翻译（怒气/护盾/星启/祝福/属性等，见 glossary.js）。
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
