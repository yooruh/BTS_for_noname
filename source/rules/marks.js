// 崩铁杀规则常量与翻译。所有规则/角色模块均从这里取标记名，避免散落字符串。
import { lib, game, get } from '../../../../noname.js';
import { extensionPath } from '../tool/utils/paths.js';

// [id, 显示名（addGroup short → lib.translate[id]，选将分组/资料卡/日志显示）, 全名（translate[id+'2']）]
// 显示名取完整势力名，样式见 style/css/extension.css（选将 tab 等固定宽度位置自适应）。
export const KINGDOMS = [
    ['xingqionglieche', '星穹列车', '星穹列车'],
    ['xinghelieshou', '星核猎手', '星核猎手'],
    ['heitakongjianzhan', '黑塔空间站', '黑塔空间站'],
    ['yaliluo', '贝洛伯格', '贝洛伯格'],
    ['pinuokangni', '匹诺康尼', '匹诺康尼'],
    ['xianzhou', '仙舟', '仙舟'],
    ['huangjinyi', '黄金裔', '黄金裔'],
    ['erxiangleyuan', '二相乐园', '二相乐园'],
];

export const KINGDOM_COLORS = {
    xingqionglieche: '#547998',
    xinghelieshou: '#a52442',
    heitakongjianzhan: '#96943d',
    yaliluo: '#4fa8c9',
    pinuokangni: '#c9a86a',
    xianzhou: '#d0796c',
    huangjinyi: '#7097df',
    erxiangleyuan: '#8b6bbf', // 占位色，待项目组确认
};

export const NATURES = ['earth', 'flame', 'frost', 'elec', 'wind', 'dark', 'light'];
export const ABNORMALS = [
    'numb',
    'burn',
    'poison',
    'freeze',
    'fossilize',
    'sleep',
    'confuse',
    'scary',
    'shenghua',
    'lieyang',
    'shahuo',
    'diyu',
    'duanjian',
    'zhanfang',
    'luandie',
    'mingding',
    'fuzhai',
    'jielu',
    'baixie',
    'dingzhen',
    'chunzui',
];
export const BLESSES = [
    'fatal',
    'through',
    'critical',
    'busi',
    'maxhp',
    'god',
    'yingzi',
    'shengxi',
    'fullburn',
    'xuneng',
    'canmei',
    'xianwaiyin',
    'zhiyu',
    'zhisheng',
    'zengfu',
    'shengge',
    'jieyin',
    'gongwu',
    'cifu',
    'shenjun',
    'dark',
    'rangming',
    'kanpo',
    'huqi',
    'yuguotianqing',
    'haiqu',
    'haiyao',
    'zhianzhimi',
    'qiyu',
    'reyi',
    'zhigaozhizi',
];

export const MARKS = {
    // 本扩展注册到 lib.translate/lib.skill 的标记键一律 bts_ 前缀（命名空间规则，见《代码与机制规范》）。
    // angry/shield 亦非本体认领（本体全量翻译表无这些键），故一并 bts_，避免与其它包/本体撞名。
    ANGRY: 'bts_angry',
    SHIELD: 'bts_shield',
    CURSE: 'bts_curse',
    EXTRA_MAX: 'bts_extra_max',
    DAMAGE_LINK_PREFIX: 'bts_damage_link_',
    RECOVER_LINK_PREFIX: 'bts_recover_link_',
    nature: (nature) => `bts_n_${nature}`,
    abnormal: (name) => `bts_abnormal_${name}`,
    bless: (name) => `bts_bless_${name}`,
    pet: (name) => `bts_pet_${name}`,
};

// 统一「星启」显示标记与其来源维护：
// 无论主公星启（身份派生 isZhu）还是技能星启（星尘/天阙给予的星启祝福层数），
// 都显示同一个「星启」标记（GOD_MARK）；来源列表记在全局维护技能 storage 上。
// GOD_MARK 用 bts_ 前缀命名空间化：裸名 'xingqi' 会与无名杀本体内建标记技能
// （时计包 shiji 的备/誓）撞名，导致 registerRules 的 lib.skill[id] ??= 静默跳过本
// 扩展注册、游戏内 addSkill('xingqi') 挂上本体技能而非本扩展统一星启标记。
export const GOD_MARK = 'bts_xingqi'; // 统一星启显示标记（mark: true，由来源同步挂摘）

// 来源维护全局技能名（兼 storage 键）。单一全局技能为所有标记统一维护「当前来源」：
// storage[SOURCE_TRACK][<标记名>] = { source: ['来源id', ...] }。markIntro 据此渲染
// 悬浮「当前来源」行；其它标记要启用来源展示只需在 SOURCE_TRACKABLE_MARKS 注册并在
// markIntro 传 trackSource:true。
export const SOURCE_TRACK = 'bts_st_source_track';

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

// 标记注册：显示类（mark 中文名 + marktext 取中文首字，如「怒气」→ 怒）
// 与仅记录类（mark: false，不创建标记 UI，仅供 addMark/countMark 记录）。
// RULE_TRANSLATE 提供中文显示名（定义于下方，构建 RULE_MARKS 时已就绪）。

// 标记 → 专有名词词条映射（有具体含义的标记显示词条说明；无词条的用默认 'mark'）。
const MARK_GLOSSARY = {
    bts_angry: 'bts_glossary_nuqi_faq',
    bts_shield: 'bts_glossary_hudun_faq',
    bts_n_dark: 'bts_glossary_nature_dark_faq',
    bts_n_light: 'bts_glossary_nature_guang_faq',
    bts_n_flame: 'bts_glossary_nature_yan_faq',
    bts_n_wind: 'bts_glossary_nature_feng_faq',
    bts_abnormal_numb: 'bts_glossary_mabi_faq',
    bts_abnormal_poison: 'bts_glossary_zhongdu_faq',
    bts_bless_fatal: 'bts_glossary_bless_fatal_faq',
    bts_bless_through: 'bts_glossary_bless_through_faq',
    bts_bless_critical: 'bts_glossary_bless_critical_faq',
    bts_bless_busi: 'bts_glossary_bless_busi_faq',
    bts_bless_maxhp: 'bts_glossary_bless_maxhp_faq',
    bts_bless_god: 'bts_glossary_bless_god_faq',
    bts_xingqi: 'bts_glossary_xingqi_faq',
    bts_bless_yingzi: 'bts_glossary_bless_yingzi_faq',
    bts_bless_shengxi: 'bts_glossary_bless_shengxi_faq',
    bts_bless_fullburn: 'bts_glossary_bless_fullburn_faq',
    bts_bless_xuneng: 'bts_glossary_bless_xuneng_faq',
    bts_bless_canmei: 'bts_glossary_bless_canmei_faq',
    bts_bless_xianwaiyin: 'bts_glossary_bless_xianwaiyin_faq',
    bts_bless_zhiyu: 'bts_glossary_bless_zhiyu_faq',
    bts_bless_zhisheng: 'bts_glossary_bless_zhisheng_faq',
    bts_bless_zengfu: 'bts_glossary_bless_zengfu_faq',
    bts_bless_shengge: 'bts_glossary_bless_shengge_faq',
    bts_bless_jieyin: 'bts_glossary_bless_jieyin_faq',
    bts_bless_gongwu: 'bts_glossary_bless_gongwu_faq',
    bts_bless_cifu: 'bts_glossary_bless_cifu_faq',
    bts_bless_shenjun: 'bts_glossary_bless_shenjun_faq',
    bts_bless_dark: 'bts_glossary_bless_dark_faq',
    bts_bless_rangming: 'bts_glossary_bless_rangming_faq',
    bts_bless_kanpo: 'bts_glossary_bless_kanpo_faq',
    bts_bless_huqi: 'bts_glossary_bless_huqi_faq',
    bts_bless_yuguotianqing: 'bts_glossary_bless_yuguotianqing_faq',
    bts_bless_haiqu: 'bts_glossary_bless_haiqu_faq',
    bts_bless_haiyao: 'bts_glossary_bless_haiyao_faq',
    bts_bless_zhianzhimi: 'bts_glossary_bless_zhianzhimi_faq',
    bts_bless_qiyu: 'bts_glossary_bless_qiyu_faq',
    bts_bless_reyi: 'bts_glossary_bless_reyi_faq',
    bts_bless_zhigaozhizi: 'bts_glossary_bless_zhigaozhizi_faq',
    bts_canmeng: 'bts_glossary_canmeng_faq',
    bts_feihuang: 'bts_glossary_feihuang_faq',
    bts_duzhu: 'bts_glossary_duzhu_faq',
    bts_shuowang: 'bts_glossary_shuowang_faq',
    bts_yingyue: 'bts_glossary_bless_yingyue_faq',
    bts_xuechou: 'bts_glossary_xuechou_faq',
    moze_dark_assault: 'bts_glossary_moze_dark_assault_faq',
    bts_fuyuan: 'bts_glossary_fuyuan_faq',
    bts_st_zhankan: 'bts_glossary_st_zhankan_faq',
    bts_st_piji: 'bts_glossary_st_piji_faq',
    bts_ebao: 'bts_glossary_ebao_faq',
    bts_koudai: 'bts_glossary_koudai_faq',
    bts_st_mengchong: 'bts_glossary_st_mengchong_faq',
    bts_xinrui: 'bts_glossary_xinrui_faq',
    bts_midi: 'bts_glossary_midi_faq',
    bts_linggan: 'bts_glossary_linggan_faq',
    bts_baihua: 'bts_glossary_baihua_faq',
    bts_st_zhulu: 'bts_glossary_bailu_zhulu_faq',
    bts_extra_max: 'bts_glossary_extra_st_faq',
    bts_n_frost: 'bts_glossary_nature_frost_faq',
    bts_n_elec: 'bts_glossary_nature_elec_faq',
    bts_n_earth: 'bts_glossary_nature_earth_faq',
    bts_abnormal_burn: 'bts_glossary_abnormal_burn_faq',
    bts_abnormal_freeze: 'bts_glossary_abnormal_freeze_faq',
    bts_abnormal_fossilize: 'bts_glossary_abnormal_fossilize_faq',
    bts_abnormal_sleep: 'bts_glossary_abnormal_sleep_faq',
    bts_abnormal_confuse: 'bts_glossary_abnormal_confuse_faq',
    bts_abnormal_scary: 'bts_glossary_abnormal_scary_faq',
    bts_abnormal_shenghua: 'bts_glossary_abnormal_shenghua_faq',
    bts_abnormal_lieyang: 'bts_glossary_abnormal_lieyang_faq',
    bts_abnormal_shahuo: 'bts_glossary_abnormal_shahuo_faq',
    bts_abnormal_diyu: 'bts_glossary_abnormal_diyu_faq',
    bts_abnormal_duanjian: 'bts_glossary_abnormal_duanjian_faq',
    bts_abnormal_zhanfang: 'bts_glossary_abnormal_zhanfang_faq',
    bts_abnormal_luandie: 'bts_glossary_abnormal_luandie_faq',
    bts_abnormal_mingding: 'bts_glossary_abnormal_mingding_faq',
    bts_abnormal_fuzhai: 'bts_glossary_abnormal_fuzhai_faq',
    bts_abnormal_jielu: 'bts_glossary_abnormal_jielu_faq',
    bts_abnormal_baixie: 'bts_glossary_abnormal_baixie_faq',
    bts_abnormal_dingzhen: 'bts_glossary_abnormal_dingzhen_faq',
    bts_abnormal_chunzui: 'bts_glossary_abnormal_chunzui_faq',
    bts_zhugu: 'bts_glossary_zhugu_faq',
    bts_qizha: 'bts_glossary_qizha_faq',
    bts_huozhong: 'bts_glossary_huozhong_faq',
    bts_fanshi_active: 'bts_glossary_bts_fanshi_active_faq',
    bts_shengbian: 'bts_glossary_shengbian_faq',
    bts_yizhi: 'bts_glossary_yizhi_faq',
    bts_jiyi: 'bts_glossary_jiyi_faq',
    bts_st_letu_active: 'bts_glossary_bts_st_letu_active_faq',
    bts_lanhan: 'bts_glossary_lanhan_faq',
    magic_diamond: 'bts_glossary_magic_diamond_faq',
    bts_xingzhi: 'bts_glossary_xingzhi_faq',
    bts_qifen: 'bts_glossary_qifen_faq',
    bts_duzhu: 'bts_glossary_duzhu_faq',
    bts_shuowang: 'bts_glossary_shuowang_faq',
};

// 标记的来源与用途说明（悬浮 content 用；无条目的标记仅显示层数与词条说明）。
// source：标记如何获得；use：达到多少数量可以干什么/有什么效果。
const MARK_CONTENT = {
    bts_angry: {
        source: '受到伤害或技能效果获得（致命伤害不回复）',
        use: '消耗怒气发动必杀技与怒气类技能',
    },
    bts_shield: {
        source: '技能赋予',
        use: '每点护盾抵挡1点伤害；贯通伤害无视护盾',
    },
    bts_curse: {
        source: '技能赋予',
        use: '受到伤害时先承受等量诅咒伤害',
    },
    bts_duzhu: { source: '勋爵、宾果赋予', use: '宾果：满7发动群杀' },
    bts_shuowang: { source: '天河、无罅赋予', use: '映月：满2进入' },
    bts_canmeng: { source: '赤鬼、飞渡赋予', use: '残梦：满9发动' },
    bts_feihuang: { source: '雷狩、钺贯赋予', use: '凿荒：满6发动' },
    bts_yingyue: { source: '天河（星启）赋予', use: '映月：伤害视为暴击' },
    bts_xingzhi: { source: '财宝、允许赋予', use: '承认：改摸牌、解锁王技' },
    bts_qifen: { source: '巡游赋予', use: '和声：满12翻面爆发' },
    bts_xuechou: { source: '诛天、血仇赋予', use: '登神：满体力上限' },
    moze_dark_assault: { source: '掠袭赋予', use: '掠袭：猎物受杀后追击' },
    bts_fuyuan: { source: '浮元赋予', use: '浮元：3次后失去' },
    bts_st_zhankan: { source: '斩勘赋予', use: '斩勘：防重复触发' },
    bts_st_piji: { source: '否极赋予', use: '天律：清空发动' },
    bts_ebao: { source: '业报赋予', use: '业报：满9暗杀' },
    bts_koudai: { source: '炽烁赋予', use: '装填：决斗伤弃敌牌' },
    bts_st_mengchong: { source: '机纵、服务赋予', use: '传冲：必杀多冲几发' },
    bts_xinrui: { source: '荒芜赋予', use: '亡哮：满7召唤死龙' },
    bts_midi: { source: '视界赋予', use: '魔法、格局：必杀更强' },
    bts_linggan: { source: '魔法赋予', use: '格局：弃1令受伤者弃牌' },
    bts_baihua: { source: '归葬、白花赋予', use: '轮转：满2治疗并清空' },
    bts_st_zhulu: { source: '珠露赋予', use: '珠露：治疗被奶角色后充留，可被二次随机补奶选中' },
    bts_st_zhongyuan_used: { source: '众愿（弃杀）赋予', use: '乐土标记为临时，于下个自己的回合结束时回收' },
    // ── 祝福：来源=赋予技能（写全），作用=全局结算或触发技能 ──
    bts_bless_fatal: { source: '魔术、同行、赞颂、天河、贯云赋予', use: '伤害视为致命（不回怒气）' },
    bts_bless_through: { source: '摇缎、辟世、礼物、圣剑、寸强、行曲赋予', use: '伤害无视护盾' },
    bts_bless_critical: { source: '赞颂、贯云、礼物赋予', use: '伤害视为暴击' },
    bts_bless_busi: { source: '解禁、无悔、倏忽赋予', use: '防止濒死' },
    bts_bless_maxhp: { source: '血仇、愈世、晨昏赋予', use: '增加体力上限' },
    bts_bless_god: { source: '天阙、星尘赋予', use: '常驻星启强化' },
    bts_xingqi: { source: '主公身份、天阙、星尘赋予', use: '进入星启状态，部分技能获得额外效果' },
    bts_bless_yingzi: { source: '胜局赋予', use: '额定摸牌+1' },
    bts_bless_shengxi: { source: '雷音赋予', use: '受伤/移除后回复1' },
    bts_bless_fullburn: { source: '火萤赋予', use: '无牌角色火伤后失去体力' },
    bts_bless_xuneng: { source: '星座赋予', use: '造伤后令目标附加火属性' },
    bts_bless_canmei: { source: '摇缎赋予', use: '贯通者摸牌+1；分型读取' },
    bts_bless_xianwaiyin: { source: '慢捻赋予', use: '弃他人剩1张时追击弃牌' },
    bts_bless_zhiyu: { source: '经验、新生、救护赋予', use: '准备阶段回复1' },
    bts_bless_zhisheng: { source: '制胜、四溅赋予', use: '杀当决斗、锁目标手牌' },
    bts_bless_zengfu: { source: '悦王、乱蝶、再现赋予', use: '必杀伤害+1，用后摸牌' },
    bts_bless_shengge: { source: '公正、崇高赋予', use: '移除后仍≥10层回复怒气' },
    bts_bless_jieyin: { source: '天流赋予', use: '决斗伤转弃牌/失体力' },
    bts_bless_gongwu: { source: '舔舐赋予', use: '属性伤弃敌牌、置牌' },
    bts_bless_shenjun: { source: '吾身、震曜赋予', use: '神君：连发光杀，攒多更强' },
    bts_bless_dark: { source: '掠袭赋予', use: '无属性伤害→量子、掠袭追击' },
    bts_bless_rangming: { source: '灵符赋予', use: '必杀/准备阶段回复并清异常' },
    bts_bless_kanpo: { source: '天宗赋予', use: '无牌杀结算后接决斗' },
    bts_bless_huqi: { source: '摇风赋予', use: '属性伤后目标弃一张' },
    bts_bless_cifu: { source: '七札、和韵赋予', use: '无属性杀→虚数' },
    bts_bless_yuguotianqing: { source: '晨昏赋予', use: '体力上限祝福翻倍；走开读取' },
    bts_bless_haiqu: { source: '海曲、泛音赋予', use: '造/受伤后清全场异常' },
    bts_bless_zhianzhimi: { source: '无眠赋予', use: '同行：扣血忆质×6' },
    bts_bless_qiyu: { source: '领航赋予', use: '清除远征标记' },
    bts_bless_reyi: { source: '胜局、热砂赋予', use: '非暗/睡眠造伤时全体+层' },
    bts_bless_zhigaozhizi: { source: '共舞赋予', use: '杀当决斗、光伤后+层' },
};

/** 显示类标记：mark: true 由引擎渲染标记，悬浮名取 translate[id]（中文）。
 * 技能带 hiddenSkill（不显示在技能列表）与 locked（不可弃置），
 * 由 player.addMark/removeMark 钩子（content.js）负责 addSkill/removeSkill
 * 生命周期：有层数即挂技能，归零即删技能（叁岛 buff 技能同款模式）。 */

// 标记图标素材：由太阳神三国杀 image/mark 迁移而来（去 @ 前缀）。
// 部分标记源文件名与崩铁杀 key 不一致（如血仇→st_xuechou）或源版无独立图标（不设 markimage）。
// 无名杀 markimage 路径相对扩展目录，渲染逻辑见 player.js markSkill（node.setBackgroundImage）。
const MARK_IMAGE_RENAME = {
    bts_xuechou: 'st_xuechou',
    bts_shengbian: 'st_shengbian',
    // 星启统一标记沿用原星启祝福图标（bless_god 现已沉为仅记录，不复显示自身）。
    bts_xingqi: 'bless_god',
};
// 标记键改为 bts_ 前缀后，图片文件名仍沿用源前缀（abnormal_x.png / bless_x.png /
// n_x.png / angry.png…），故 bts_ 键须回映到源文件名，避免解到不存在的 image/mark/bts_*.png。
const MARK_IMAGE_LEGACY = {
    ...Object.fromEntries(
        ABNORMALS.map((name) => [`bts_abnormal_${name}`, `abnormal_${name}`]),
    ),
    ...Object.fromEntries(
        BLESSES.map((name) => [`bts_bless_${name}`, `bless_${name}`]),
    ),
    ...Object.fromEntries(
        NATURES.map((name) => [`bts_n_${name}`, `n_${name}`]),
    ),
    bts_angry: 'angry',
    bts_shield: 'shield',
    bts_curse: 'curse',
    bts_extra_max: 'extra_max',
};
const MARK_IMAGE_OMIT = new Set([
    // 源版（太阳神）无对应 image/mark 素材的标记，不设 markimage 以免空图。
    'bts_fanshi_active',
    'bts_st_letu_active',
    'bts_lanhan',
    'bts_yingyue',
    'moze_dark_assault',
    'bts_st_zhulu',
    'bts_abnormal_baixie',
    'bts_bless_gongwu',
    'bts_bless_huqi',
    'bts_skip_turn',
]);
// 来源列表 → 显示文本（intro「当前来源」行）。仅带来源追踪的标记会命中。
const formatSources = (source) => {
    const map = { zhu: '主公星启', skill: '技能来源（星尘/天阙）' };
    return source.map((s) => map[s] || s).join('、');
};
const markIntro = (name, opts = {}) => {
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
                const title = RULE_TRANSLATE[name] || name;
                const info = lib.translate[`${MARK_GLOSSARY[name]}_info`] || '';
                const detail = MARK_CONTENT[name];
                const layers =
                    opts.layersFrom && player?.countMark
                        ? player.countMark(opts.layersFrom)
                        : storage;
                const parts = [];
                if (layers > 0) parts.push(`当前有${layers}点${title}`);
                // 「当前来源」只对启用来源追踪的标记显示（opts.trackSource），
                // 避免把来源串进未启用的标记悬浮内容。按标记 read storage[SOURCE_TRACK][name]。
                const src = opts.trackSource
                    ? player?.getStorage(SOURCE_TRACK)?.[name]?.source
                    : undefined;
                if (Array.isArray(src) && src.length)
                    parts.push(`<li>当前来源：${formatSources(src)}</li>`);
                if (detail?.source) parts.push(`<li>来源：${detail.source}</li>`);
                if (detail?.use) parts.push(`<li>${detail.use}</li>`);
                if (info) parts.push(`<li>${title}：${info}</li>`);
                return parts.join('');
            },
        },
    };
    if (!MARK_IMAGE_OMIT.has(name)) {
        // 引擎对 skill.markimage 仅做 `lib.assetURL + 值`（setBackgroundImage，游戏根解析），
        // 扩展素材须带 extensionPath 前缀（同 char.img/skinPath/audio/kingdom icon 约定），
        // 否则会落到游戏根 image/mark/（不存在）而无法渲染。
        skill.markimage =
            `${extensionPath}/image/mark/` +
            (MARK_IMAGE_RENAME[name] || MARK_IMAGE_LEGACY[name] || name) +
            '.png';
    }
    return skill;
};
/** 仅记录类标记：mark: false，不显示标记 UI（addSkill 时引擎跳过 markSkill）。 */
const hiddenMark = () => ({ mark: false });

// RULE_MARKS 定义于文件末尾（需在 RULE_TRANSLATE 就绪后构建，marktext 取中文首字）。

export const RULE_TRANSLATE = {
    xingqionglieche: '星穹列车',
    xinghelieshou: '星核猎手',
    heitakongjianzhan: '黑塔空间站',
    yaliluo: '贝洛伯格',
    pinuokangni: '匹诺康尼',
    xianzhou: '仙舟',
    huangjinyi: '黄金裔',
    erxiangleyuan: '二相乐园',
    // 属性显示名部分与无名杀已有属性重合，故改名（崩铁官方名→改名）：火→炎、冰→霜、雷→电
    earth: '物理',
    flame: '炎',
    frost: '霜',
    elec: '电',
    wind: '风',
    dark: '量子',
    light: '虚数',
    bts_n_earth: '物理附加',
    bts_n_flame: '炎附加',
    bts_n_frost: '霜附加',
    bts_n_elec: '电附加',
    bts_n_wind: '风附加',
    bts_n_dark: '量子附加',
    bts_n_light: '虚数附加',
    bts_angry: '怒气',
    bts_shield: '护盾',
    bts_curse: '诅咒',
    bts_extra_max: '怒气豁免',
    bts_bless_fatal: '致命祝福',
    bts_bless_through: '贯通祝福',
    bts_bless_critical: '暴击祝福',
    bts_bless_busi: '不死祝福',
    bts_bless_maxhp: '体力上限祝福',
    bts_bless_god: '星启祝福',
    bts_xingqi: '星启',
    bts_bless_yingzi: '契约祝福',
    bts_bless_shengxi: '生息祝福',
    bts_bless_fullburn: '完全燃烧祝福',
    bts_bless_xuneng: '蓄能祝福',
    bts_bless_canmei: '残梅祝福',
    bts_bless_xianwaiyin: '弦外音祝福',
    bts_bless_zhiyu: '治愈祝福',
    bts_bless_zhisheng: '制胜祝福',
    bts_bless_zengfu: '增幅祝福',
    bts_abnormal_numb: '麻痹',
    bts_abnormal_burn: '烧伤',
    bts_abnormal_poison: '中毒',
    bts_abnormal_freeze: '冻结',
    bts_abnormal_fossilize: '石化',
    bts_abnormal_sleep: '睡眠',
    bts_abnormal_confuse: '混乱',
    bts_abnormal_scary: '恐惧',
    bts_abnormal_shenghua: '升华',
    bts_abnormal_lieyang: '烈阳',
    bts_abnormal_shahuo: '煞火',
    bts_abnormal_diyu: '地狱',
    bts_abnormal_duanjian: '短见',
    bts_abnormal_zhanfang: '绽放',
    bts_abnormal_luandie: '乱蝶',
    bts_abnormal_mingding: '酩酊',
    bts_abnormal_fuzhai: '负债',
    bts_abnormal_jielu: '揭露',
    bts_abnormal_baixie: '败谢',
    bts_abnormal_dingzhen: '鼎阵',
    bts_abnormal_chunzui: '沉醉',
    bts_bless_shengge: '升格祝福',
    bts_bless_jieyin: '结印祝福',
    bts_bless_gongwu: '共舞祝福',
    bts_bless_cifu: '赐福祝福',
    bts_bless_shenjun: '神君祝福',
    bts_bless_dark: '暗之祝福',
    bts_bless_rangming: '禳命祝福',
    bts_bless_kanpo: '看破祝福',
    bts_bless_huqi: '狐祈祝福',
    bts_bless_yuguotianqing: '雨过天晴祝福',
    bts_bless_haiqu: '绝海祝福',
    bts_bless_zhianzhimi: '至暗之谜祝福',
    bts_bless_qiyu: '旗语祝福',
    bts_bless_reyi: '热意祝福',
    bts_canmeng: '残梦',
    bts_duzhu: '赌注',
    bts_koudai: '口袋',
    bts_st_mengchong: '传冲',
    bts_ebao: '恶报',
    bts_liewu: '猎物',
    moze_dark_assault: '暗袭',
    bts_st_zhulu: '珠露',
    bts_st_jishi_used: '济世',
    bts_baihua: '白花',
    bts_shuowang: '朔望',
    bts_yingyue: '映月',
    bts_st_piji: '否极',
    bts_st_zhankan: '斩勘',
    bts_fuyuan: '浮元',
    bts_feihuang: '飞黄',
    liubu: '流布',
    bts_xinrui: '新蕊',
    bts_xuechou: '血仇',
    zhigaozhizi: '至高之姿',
    dengshen: '登神',
    bts_midi: '谜底',
    bts_linggan: '灵感',
    bts_pet_silong: '死龙',
    bts_pet_xiaoyika: '小伊卡',
    bts_zhugu: '主顾',
    bts_qizha: '七札',
    'bts_st_reqing-clear': '热情追击已用',
    bts_huozhong: '火种',
    bts_st_fanshi_used: '燔世已发动',
    bts_fanshi_active: '燔世状态',
    'fanshi_duel-play': '血棘已用',
    'fanshi_draw-play': '天裁强化',
    bts_shengbian: '升变',
    bts_yizhi: '忆质',
    bts_jiyi: '记忆',
    bts_st_haiyao_lose: '海妖失效',
    bts_st_haiyao_used: '海妖已用',
    bts_st_jungong_owner: '军功来源',
    bts_st_letu_active: '乐土状态',
    bts_st_zhongyuan_used: '众愿·临时乐土',
    bts_pet_changye: '长夜',
    bts_lanhan: '婪酣',
    magic_diamond: '宝石',
    bts_xingzhi: '兴致',
    bts_qifen: '气氛',
    bts_st_yuanzheng_used: '远征已用',
    bts_st_paozhu_funny_used: '抛注已用',
    bts_pet_qingkongyueshou: '晴空乐手',
    bts_skip_turn: '跳过回合',
};

// ── 标记注册（需 RULE_TRANSLATE 就绪后构建）──────────────────────────────────
export const RULE_MARKS = Object.fromEntries([
    // 显示类：怒气/护盾/诅咒/豁免、属性元素、异常状态、祝福层数、关键状态。
    // mark: true 渲染标记，marktext 取中文显示名首字（如「怒气」→ 怒）。
    ...[
        MARKS.ANGRY,
        MARKS.SHIELD,
        MARKS.CURSE,
        MARKS.EXTRA_MAX,
        ...NATURES.map(MARKS.nature),
        ...ABNORMALS.map(MARKS.abnormal),
        // 星启单独以统一标记显示（见下方 GOD_MARK 覆写），bless_god 沉为仅记录标记。
        ...BLESSES.filter((bless) => bless !== 'god').map(MARKS.bless),
        'bts_zhugu',
        'bts_qizha',
        'bts_huozhong',
        'bts_fanshi_active',
        'bts_shengbian',
        'bts_yizhi',
        'bts_jiyi',
        'bts_st_letu_active',
        'bts_lanhan',
        'magic_diamond',
        'bts_xingzhi',
        'bts_qifen',
        'bts_canmeng',
        'bts_feihuang',
        'bts_duzhu',
        'bts_shuowang',
        'bts_yingyue',
        'bts_xuechou',
        'moze_dark_assault',
        'bts_fuyuan',
        'bts_st_zhankan',
        'bts_st_piji',
        'bts_ebao',
        'bts_koudai',
        'bts_st_mengchong',
        'bts_xinrui',
        'bts_midi',
        'bts_linggan',
        'bts_baihua',
        'bts_st_zhulu',
    ].map((name) => [name, markIntro(name)]),
    // 仅记录类：已用/来源/失效等内部状态，mark: false 不显示标记 UI。
    ...[
        // 星启祝福层数改为仅记录（不再单独显示，统一由「星启」标记 GOD_MARK 呈现）。
        'bts_bless_god',
        'bts_st_reqing-clear',
        'bts_st_fanshi_used',
        'fanshi_duel-play',
        'fanshi_draw-play',
        'bts_st_haiyao_lose',
        'bts_st_haiyao_used',
        'bts_st_jungong_owner',
        'bts_st_yuanzheng_used',
        'bts_st_paozhu_funny_used',
        'bts_st_zhongyuan_used',
    ].map((name) => [name, hiddenMark()]),
]);

// 星启统一显示标记：层数依托星启祝福（bless_god）层数，挂摘与来源维护由通用
// syncMarkSources（全局技能 installMarkSourceTrack → lib.bts.api.godSync）负责——
// 主公星启（isZhu）即便星启祝福为 0 层也显示。
RULE_MARKS[GOD_MARK] = markIntro(GOD_MARK, {
    layersFrom: MARKS.bless('god'),
    trackSource: true,
});

// ── 标记技能携带的效果（严格复刻源 AddAbnormal/AddBless 内联的挂载技能）────────
// 源版对 @abnormal_diyu 附加时 acquireSkill("#ab_diyu")（FilterSkill：手牌当【决斗】）、
// 对 @bless_jieyin 附加时 acquireSkill("#bless_jieyin")（FilterSkill：手牌【杀】当【决斗】）。
// 标记技能经 installBuffSkillLifecycle 有层数即挂载、归零即卸载，天然等价于动态挂摘。
RULE_MARKS['bts_abnormal_diyu'] = {
    ...RULE_MARKS['bts_abnormal_diyu'],
    // 源 #ab_diyu（animal.lua L2627-2641）：手牌视为【决斗】。
    enable: 'phaseUse',
    viewAs: { name: 'juedou', isCard: true },
    filterCard: () => true,
    selectCard: 1,
    position: 'h',
    prompt: '地狱：将一张手牌当【决斗】使用',
    ai: { order: 1, result: { player: 1 } },
};
RULE_MARKS['bts_bless_jieyin'] = {
    ...RULE_MARKS['bts_bless_jieyin'],
    // 源 #bless_jieyin（animal.lua L5297-5310）：手牌【杀】视为【决斗】，
    // 同时通过 cardEnabled 禁止直接使用手牌【杀】（FilterSkill 的等价强制）。
    enable: 'phaseUse',
    viewAs: { name: 'juedou', isCard: true },
    filterCard: (card) => get.name(card) === 'sha',
    selectCard: 1,
    position: 'h',
    prompt: '结印祝福：将一张手牌【杀】当【决斗】使用',
    mod: {
        cardEnabled(card, player) {
            if (
                player.countMark('bts_bless_jieyin') > 0 &&
                get.name(card) === 'sha' &&
                get.position(card) === 'h'
            )
                return false;
        },
    },
    ai: { order: 2, result: { target: -1 } },
};
// 标记技能效果的说明文本（视图按钮/词条展示；标记名带 | |，祝福为特殊名称无标点，与词条渲染一致）。
RULE_TRANSLATE['bts_abnormal_diyu_info'] =
    '|地狱|：你的手牌视为【决斗】；当你使用【决斗】时，失去1点体力。';
RULE_TRANSLATE['bts_bless_jieyin_info'] =
    '结印祝福：你的手牌【杀】视为【决斗】；当你使用【决斗】对其他角色造成伤害时，若其手牌数大于1，防止此伤害并弃置其两张手牌，否则其弃置一张牌并失去1点体力。';

// ── 负面异常效果（2026-09-02 TODO 拆分：从 bts_gamerule_pro / bts_gamerule_ex 搬入各自标记技能）──
// 每个异常标记技能自带效果（mod/trigger），层数>0 由 installBuffSkillLifecycle 自动挂、归零自动卸，
// 替代原集中式 bts_gamerule_pro（使用限制）与 bts_gamerule_ex HANDLERS（阶段事件）里的内联判断，
// 达到「按标记分解维护」。mod 内保留 getAbnor 守卫（返回 undefined 不拦截，供无层数时兜底）。

// 冻结：禁装备（源 gamerule_pro）+ 冻结者造成的伤害基数-1（源 DamageCaused L1145-1148）。
RULE_MARKS['bts_abnormal_freeze'] = {
    ...RULE_MARKS['bts_abnormal_freeze'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.source === player && event.num > 0;
    },
    async content(event, trigger, player) {
        trigger.num -= 1; // 源 DamageCaused L1145-1148：冻结者造成的伤害基数-1
    },
    mod: {
        cardEnabled(card, player) {
            if (
                lib.bts.api.getAbnor(player, 'freeze') &&
                get.type(card, player) === 'equip'
            )
                return false;
        },
    },
};

// 石化：禁锦囊（源 gamerule_pro）+ 石化者受到的伤害视为暴击（源 gamerule_ex damageBegin2）。
RULE_MARKS['bts_abnormal_fossilize'] = {
    ...RULE_MARKS['bts_abnormal_fossilize'],
    trigger: { player: 'damageBegin2' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player && event.num > 0;
    },
    content(event, trigger, player) {
        lib.bts.api.markDamage(trigger, '_critical'); // 石化者受到的伤害视为暴击
    },
    mod: {
        cardEnabled(card, player) {
            if (
                lib.bts.api.getAbnor(player, 'fossilize') &&
                get.type(card, player) === 'trick'
            )
                return false;
        },
    },
};

// 睡眠：禁基本（源 gamerule_pro；「其他角色与你距离-1」仍在 bts_gamerule_dis，后续批再拆）。
RULE_MARKS['bts_abnormal_sleep'] = {
    ...RULE_MARKS['bts_abnormal_sleep'],
    mod: {
        cardEnabled(card, player) {
            if (
                lib.bts.api.getAbnor(player, 'sleep') &&
                get.type(card, player) === 'basic'
            )
                return false;
        },
    },
};

// 恐惧：不能弃置牌（源 AddAbnormal L490-492 setPlayerCardLimitation "discard"）。
RULE_MARKS['bts_abnormal_scary'] = {
    ...RULE_MARKS['bts_abnormal_scary'],
    mod: {
        cardDiscardable(card, player) {
            if (lib.bts.api.getAbnor(player, 'scary')) return false;
        },
    },
};

// 烧伤：出牌阶段开始时受到1点无来源伤害（源 gamerule_ex phaseUseBegin）。
RULE_MARKS['bts_abnormal_burn'] = {
    ...RULE_MARKS['bts_abnormal_burn'],
    trigger: { player: 'phaseUseBegin' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player;
    },
    async content(event, trigger, player) {
        const damage = player.damage(1, 'nosource');
        damage.reason = 'bts_abnormal_burn';
        await damage;
    },
};

// 麻痹：摸牌阶段开始时受到1点无来源伤害 + 额定摸牌数-1（源 gamerule_ex phaseDrawBegin/phaseDrawBegin2；
// 揭露+中毒组合仍留在 resolver phaseDrawBegin2，见该处 !numb 守卫）。
RULE_MARKS['bts_abnormal_numb'] = {
    ...RULE_MARKS['bts_abnormal_numb'],
    trigger: { player: ['phaseDrawBegin', 'phaseDrawBegin2'] },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player;
    },
    async content(event, trigger, player) {
        if (event.triggername === 'phaseDrawBegin') {
            const damage = player.damage(1, 'nosource');
            damage.reason = 'bts_abnormal_numb';
            await damage;
            return;
        }
        trigger.num = Math.max(0, trigger.num - 1); // 源 DrawNCards L1473-1476
    },
};

// 中毒：弃牌阶段开始时失去1点体力（源 gamerule_ex phaseDiscardBegin L1577-1587；
// 惊喜 st_jingxi 使失去量+1 的逻辑一并随迁；揭露+烧伤/麻痹组合仍留在 resolver，见该处 !poison 守卫）。
RULE_MARKS['bts_abnormal_poison'] = {
    ...RULE_MARKS['bts_abnormal_poison'],
    trigger: { player: 'phaseDiscardBegin' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player;
    },
    content(event, trigger, player) {
        let n = 1;
        if (player.countMark('bts_st_jingxi') > 0) {
            n = 2; // 惊喜标记：改为失去2点并移除（源 L1581-1584）
            player.removeMark('bts_st_jingxi', player.countMark('bts_st_jingxi'));
        }
        player.loseHp(n);
    },
};

// ── 批2：其余异常 + 通用标记效果（2026-09-02 TODO 拆分；从 bts_gamerule_ex HANDLERS 搬入）──

// 混乱：造成的伤害无效（源 DamageCaused L1196-1199 经 GetBless 判定，残梦封锁期间 GetBless 失效，
// 故混乱不阻止伤害）。
RULE_MARKS['bts_abnormal_confuse'] = {
    ...RULE_MARKS['bts_abnormal_confuse'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            !lib.skill['bts_st_canmeng'].util.canmengActive()
        );
    },
    async content(event, trigger, player) {
        game.log(player, '因混乱，此次伤害无效');
        trigger.cancel();
    },
};

// 乱蝶：受到伤害后附加等量乱蝶（源 Damaged L1317-1319）。
RULE_MARKS['bts_abnormal_luandie'] = {
    ...RULE_MARKS['bts_abnormal_luandie'],
    trigger: { player: 'damageEnd' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player && event.num > 0;
    },
    content(event, trigger, player) {
        lib.bts.api.addAbnormal(player, 'luandie', trigger.num);
    },
};

// 酩酊：受到伤害后令伤害来源回复1点体力（源 Damaged）。
RULE_MARKS['bts_abnormal_mingding'] = {
    ...RULE_MARKS['bts_abnormal_mingding'],
    trigger: { player: 'damageEnd' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.player === player &&
            event.num > 0 &&
            event.source?.isAlive()
        );
    },
    async content(event, trigger, player) {
        await trigger.source.recover(player);
    },
};

// 负债：受到无牌【杀】伤害后附加1层负债（源 Damaged）。
RULE_MARKS['bts_abnormal_fuzhai'] = {
    ...RULE_MARKS['bts_abnormal_fuzhai'],
    trigger: { player: 'damageEnd' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.player === player &&
            event.num > 0 &&
            event.card?.name === 'sha' &&
            !event.card.cards?.length
        );
    },
    content(event, trigger, player) {
        lib.bts.api.addAbnormal(player, 'fuzhai');
    },
};

// 短见：受到伤害时，伤害来源摸1张牌（源 animal.lua L1226）。
RULE_MARKS['bts_abnormal_duanjian'] = {
    ...RULE_MARKS['bts_abnormal_duanjian'],
    trigger: { player: 'damageEnd' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player && event.num > 0 && !!event.source;
    },
    content(event, trigger, player) {
        trigger.source.draw(player, 1);
    },
};

// 沉醉：从手牌弃牌后，若剩余手牌数不大于层数，弃置所有手牌（源 CardsMoveOneTime L1667-1670）。
RULE_MARKS['bts_abnormal_chunzui'] = {
    ...RULE_MARKS['bts_abnormal_chunzui'],
    trigger: { global: 'discard' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.player === player &&
            event.cards?.some((card) => card.original === 'h') &&
            lib.bts.api.getAbnor(player, 'chunzui') &&
            player.countCards('h') > 0 &&
            player.countCards('h') <= lib.bts.api.getAbnor(player, 'chunzui', -1)
        );
    },
    async content(event, trigger, player) {
        game.log(player, '触发了沉醉，弃置所有手牌');
        await player.discard(player.getCards('h'));
    },
};

// 绽放：进入摸牌阶段前跳过（源 EventPhaseChanging L1653-1658）。
RULE_MARKS['bts_abnormal_zhanfang'] = {
    ...RULE_MARKS['bts_abnormal_zhanfang'],
    trigger: { player: 'phaseChange' },
    forced: true,
    silent: true,
    filter(event, player) {
        const next = String(event.phaseList?.[event.num] || '')
            .split('|')[0]
            .split('-')[0];
        return event.player === player && next === 'phaseDraw';
    },
    content(event, trigger, player) {
        player.skip('phaseDraw');
    },
};

// 败谢：受到属性伤害时弃置一张手牌（源 gamerule_ex damageBegin2）。
RULE_MARKS['bts_abnormal_baixie'] = {
    ...RULE_MARKS['bts_abnormal_baixie'],
    trigger: { player: 'damageBegin2' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.player === player &&
            event.num > 0 &&
            lib.bts.api.getNature(event) &&
            player.countCards('h') > 0
        );
    },
    async content(event, trigger, player) {
        await player.chooseToDiscard('败谢：弃置一张手牌', 'h', 1, true);
    },
};

// 诅咒：受到伤害时先承受等量诅咒伤害（源 gamerule_ex damageBegin2）。
RULE_MARKS['bts_curse'] = {
    ...RULE_MARKS['bts_curse'],
    trigger: { player: 'damageBegin2' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player && event.num > 0;
    },
    content(event, trigger, player) {
        const curse = lib.bts.api.getCurse(player);
        if (curse > 0) {
            trigger.num += curse;
            lib.bts.api.removeCurse(player, curse);
        }
    },
};

// 护盾：优先抵消伤害（贯通伤害无视，源 gamerule_ex damageBegin2）。
RULE_MARKS['bts_shield'] = {
    ...RULE_MARKS['bts_shield'],
    trigger: { player: 'damageBegin2' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.player === player &&
            event.num > 0 &&
            !lib.bts.api.isSpecialDamage(event, '_through')
        );
    },
    content(event, trigger, player) {
        const shield = lib.bts.api.getShield(player);
        if (shield > 0) {
            const absorbed = Math.min(shield, trigger.num);
            trigger.num -= absorbed;
            lib.bts.api.removeShield(player, absorbed);
        }
    },
};

// 跳过回合（拟洞，瓦尔特·断界授予）：准备阶段开始时移除并跳过本回合其余阶段
//（源 gamerule_ex L1508）。本期由「仅记录」升格为显示标记，自带效果随层数挂摘。
RULE_MARKS['bts_skip_turn'] = {
    ...markIntro('bts_skip_turn'),
    trigger: { player: 'phaseZhunbeiBegin' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player && player.countMark('bts_skip_turn') > 0;
    },
    content(event, trigger, player) {
        player.removeMark('bts_skip_turn', player.countMark('bts_skip_turn'));
        player.skip('phaseJudge');
        player.skip('phaseDraw');
        player.skip('phaseUse');
        player.skip('phaseDiscard');
        player.skip('phaseJieshu');
        game.log(player, '因【拟洞】跳过了本回合');
    },
};

// ── 批3：祝福类效果（2026-09-02 TODO 拆分；从 bts_gamerule_ex HANDLERS 搬入各自标记技能）──
// 仅搬「按持有者本人事件触发、各持有者独立生效」的祝福；跨角色聚合类（残梅/禳命/热意）
// 与 useCard 交织类（至高之姿·杀当决斗 / 制胜 / 看破）仍留在 resolver。

// 海妖祝福：防止对他者造成的伤害，改为附加1层随机异常（源 ConfirmedDamage L1189-1193）。
RULE_MARKS['bts_bless_haiyao'] = {
    ...RULE_MARKS['bts_bless_haiyao'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            !!event.player &&
            event.player !== player
        );
    },
    async content(event, trigger, player) {
        trigger.cancel();
        const abnormal =
            ['numb', 'burn', 'poison'][Math.floor(Math.random() * 3)];
        await lib.bts.api.addAbnormal(trigger.player, abnormal);
    },
};

// 结印祝福：决斗伤害转为弃牌/失去体力并防止伤害（源 DamageCaused L1177-1190）。
RULE_MARKS['bts_bless_jieyin'] = {
    ...RULE_MARKS['bts_bless_jieyin'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            event.card?.name === 'juedou' &&
            event.player?.isAlive()
        );
    },
    async content(event, trigger, player) {
        const target = trigger.player;
        trigger.cancel();
        if (target.countCards('h') > 1) {
            if (target.countCards('h'))
                await target.chooseToDiscard(
                    '结印祝福：弃置两张手牌',
                    'h',
                    [2, 2],
                    true,
                );
        } else {
            if (target.countCards('he'))
                await target.chooseToDiscard(
                    '结印祝福：弃置一张牌',
                    'he',
                    [1, 1],
                    true,
                );
            await target.loseHp(1);
        }
    },
};

// 共舞祝福：属性伤害令目标弃置1张手牌，其余手牌于伤害结算前置于其武将牌上（源 DamageCaused L1200-1209）。
RULE_MARKS['bts_bless_gongwu'] = {
    ...RULE_MARKS['bts_bless_gongwu'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        const gongwuHand = event.player?.getCards('h') || [];
        return (
            event.source === player &&
            event.num > 0 &&
            lib.bts.api.getNature(event) &&
            gongwuHand.length &&
            lib.filter.cardDiscardable(gongwuHand[0], event.player)
        );
    },
    async content(event, trigger, player) {
        game.log(player, '触发了共舞祝福');
        await trigger.player.chooseToDiscard(
            '共舞祝福：弃置一张手牌',
            'h',
            1,
            true,
        );
        const rest = trigger.player.getCards('h');
        if (rest.length) await trigger.player.addToExpansion(rest, 'give');
    },
};

// 贯通祝福：伤害视为贯通（无视护盾，源 gamerule_ex damageBegin1）。
RULE_MARKS['bts_bless_through'] = {
    ...RULE_MARKS['bts_bless_through'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            !event.reason?.includes('_common')
        );
    },
    content(event, trigger, player) {
        lib.bts.api.markDamage(trigger, '_through');
    },
};

// 致命祝福：伤害视为致命（无法回怒气，源 gamerule_ex damageBegin1）。
RULE_MARKS['bts_bless_fatal'] = {
    ...RULE_MARKS['bts_bless_fatal'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            !event.reason?.includes('_common')
        );
    },
    content(event, trigger, player) {
        lib.bts.api.markDamage(trigger, '_fatal');
    },
};

// 暴击祝福：伤害视为暴击（源 gamerule_ex damageBegin1；映月状态部分仍留在 resolver）。
RULE_MARKS['bts_bless_critical'] = {
    ...RULE_MARKS['bts_bless_critical'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            !event.reason?.includes('_common')
        );
    },
    content(event, trigger, player) {
        lib.bts.api.markDamage(trigger, '_critical');
    },
};

// 暗之祝福：无属性伤害视为量子属性（源 L1127-1129）。
// priority 10 高于 resolver damageBegin1（9）：须先于 resolver 的 煞火/元素相克 读取伤害属性
//（原实现同 handler 内暗之先于煞火判定）。
RULE_MARKS['bts_bless_dark'] = {
    ...RULE_MARKS['bts_bless_dark'],
    priority: 10,
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            !event.reason?.includes('_common') &&
            !lib.bts.api.getNature(event)
        );
    },
    content(event, trigger, player) {
        game.log(player, '触发了暗之祝福');
        lib.bts.api.setDamageNature(trigger, 'dark');
    },
};

// 赐福祝福：持有者使用【杀】造成的无属性伤害视为虚数属性（源 L1131-1133）。
// priority 10 同 bts_bless_dark（先于 resolver 的煞火/元素相克读取伤害属性）。
RULE_MARKS['bts_bless_cifu'] = {
    ...RULE_MARKS['bts_bless_cifu'],
    priority: 10,
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            !event.reason?.includes('_common') &&
            event.card?.name === 'sha' &&
            !lib.bts.api.getNature(event)
        );
    },
    content(event, trigger, player) {
        game.log(player, '触发了赐福祝福');
        lib.bts.api.setDamageNature(trigger, 'light');
    },
};

// 狐祈祝福：属性伤害后目标弃置一张手牌（源 L1138-1140）。
RULE_MARKS['bts_bless_huqi'] = {
    ...RULE_MARKS['bts_bless_huqi'],
    trigger: { source: 'damageBegin1' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            !event.reason?.includes('_common') &&
            lib.bts.api.getNature(event) &&
            event.player.countCards('h') > 0
        );
    },
    async content(event, trigger, player) {
        game.log(player, '触发了狐祈祝福');
        await trigger.player.chooseToDiscard(
            '狐祈祝福：请弃置一张手牌',
            'h',
            1,
            true,
        );
    },
};

// 增幅祝福：必杀技伤害+1（damageBegin1）+ 用必杀技后摸(层数-1)张牌（useSkillAfter，源 L1085-1086）。
RULE_MARKS['bts_bless_zengfu'] = {
    ...RULE_MARKS['bts_bless_zengfu'],
    trigger: { source: 'damageBegin1', player: 'useSkillAfter' },
    forced: true,
    silent: true,
    filter(event, player, triggername) {
        if (triggername === 'useSkillAfter') {
            // 源 L1085-1086：使用 SkillCard 且技能名含 "max_"（必杀技）；
            // 无名杀以 bts_bisha 标签判定（勿用 includes('st_')，命中所有 bts_st_* 技能）
            return (
                event.player === player &&
                lib.skill[event.skill]?.bts_bisha === true
            );
        }
        // 源 L1103：damage.reason 含 "max_"（必杀技，含 _common 通常伤害如乖离）；
        // 无名杀以 isBishaReason 判定（已修正：原 `_common` 排除误伤乖离类必杀技）
        return (
            event.source === player &&
            event.num > 0 &&
            lib.bts.api.isBishaReason(event.reason)
        );
    },
    async content(event, trigger, player) {
        if (event.triggername === 'useSkillAfter') {
            if (!lib.bts.api.getBless(player, 'zengfu', 2)) return;
            await player.draw(player, lib.bts.api.getBless(player, 'zengfu', -1) - 1);
            return;
        }
        trigger.num += 1; // 增幅祝福：必杀技伤害+1
    },
};

// 生息祝福：受伤后/被移除时若已受伤，移除1层并回复1点（源 Damaged L1328-1332 / MarkChanged L1694-1704，
// 逐层级联，耗尽为止）。
RULE_MARKS['bts_bless_shengxi'] = {
    ...RULE_MARKS['bts_bless_shengxi'],
    // removeMark 用 global（全库角色技能一致约定；player: 未必派发该事件）
    trigger: { player: 'damageEnd', global: 'removeMark' },
    forced: true,
    silent: true,
    filter(event, player, triggername) {
        if (triggername === 'removeMark')
            return (
                event.player === player &&
                event.markName === 'bts_bless_shengxi' &&
                player.isDamaged()
            );
        return event.player === player && event.num > 0 && player.isDamaged();
    },
    async content(event, trigger, player) {
        await lib.bts.api.removeBless(player, 'shengxi', 1);
        await player.recover(player);
    },
};

// 完全燃烧祝福：对无手牌角色造成炎属性伤害后，其失去1点体力（源 animal.lua L1289）。
RULE_MARKS['bts_bless_fullburn'] = {
    ...RULE_MARKS['bts_bless_fullburn'],
    trigger: { source: 'damageEnd' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            event.player &&
            event.player.countCards('h') === 0 &&
            lib.bts.api.getNature(event) === 'flame'
        );
    },
    content(event, trigger, player) {
        trigger.player.loseHp();
    },
};

// 蓄能祝福：造成伤害后移除3层，令目标附加火属性（源 animal.lua L1292-1296）。
RULE_MARKS['bts_bless_xuneng'] = {
    ...RULE_MARKS['bts_bless_xuneng'],
    trigger: { source: 'damageEnd' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.source === player && event.num > 0 && !!event.player;
    },
    async content(event, trigger, player) {
        if (!lib.bts.api.getBless(player, 'xuneng', 3)) return;
        if (player.countMark('bts_st_xingkong-clear') === 0)
            await lib.bts.api.removeBless(player, 'xuneng', 3);
        await lib.bts.api.addNature(trigger.player, 'flame');
    },
};

// 至高之姿祝福：造成光属性伤害后附加1层（源 Damage L1300-1302；
// 「杀当决斗」仍留在 resolver useCard，与制胜/地狱交织）。
RULE_MARKS['bts_bless_zhigaozhizi'] = {
    ...RULE_MARKS['bts_bless_zhigaozhizi'],
    trigger: { source: 'damageEnd' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.source === player &&
            event.num > 0 &&
            lib.bts.api.getNature(event) === 'light'
        );
    },
    async content(event, trigger, player) {
        await lib.bts.api.addBless(player, 'zhigaozhizi', 1, player);
    },
};

// 契约祝福：额定摸牌+1（源 gamerule_draw）。
RULE_MARKS['bts_bless_yingzi'] = {
    ...RULE_MARKS['bts_bless_yingzi'],
    trigger: { player: 'phaseDrawBegin2' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player && event.num > 0;
    },
    content(event, trigger, player) {
        trigger.num += 1;
    },
};

// 治愈祝福：准备阶段开始时回复体力；体力≤1时每有1名存活且拥有生机的角色回复量+1（源 Start L1532-1543）。
RULE_MARKS['bts_bless_zhiyu'] = {
    ...RULE_MARKS['bts_bless_zhiyu'],
    trigger: { player: 'phaseZhunbeiBegin' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player;
    },
    async content(event, trigger, player) {
        let n = 1;
        if (player.hp <= 1)
            n += game.filterPlayer((p) => p.hasSkill('bts_st_shengji')).length;
        await player.recover(player, n);
    },
};

// 旗语祝福：准备阶段开始时清除远征标记（源 gamerule_ex phaseZhunbeiBegin）。
RULE_MARKS['bts_bless_qiyu'] = {
    ...RULE_MARKS['bts_bless_qiyu'],
    trigger: { player: 'phaseZhunbeiBegin' },
    forced: true,
    silent: true,
    filter(event, player) {
        return event.player === player;
    },
    content(event, trigger, player) {
        player.removeMark(
            'bts_st_yuanzheng_used',
            player.countMark('bts_st_yuanzheng_used'),
        );
    },
};

// 弦外音祝福：你弃置其他角色手牌后，若其手牌数为1，其弃置一张手牌（源 animal.lua L1663-1665）。
RULE_MARKS['bts_bless_xianwaiyin'] = {
    ...RULE_MARKS['bts_bless_xianwaiyin'],
    trigger: { global: 'discard' },
    forced: true,
    silent: true,
    filter(event, player) {
        const from = event.discarder;
        return (
            lib.bts.api.getBless(player, 'xianwaiyin') &&
            !!from &&
            from === player &&
            from.isAlive() &&
            event.player !== player &&
            event.cards?.some((card) => card.original === 'h') &&
            event.player.countCards('h') === 1
        );
    },
    async content(event, trigger, player) {
        game.log(player, '触发了弦外音祝福，', trigger.player, '须弃置一张手牌');
        await trigger.player.chooseToDiscard(
            '弦外音祝福：请弃置一张手牌',
            'h',
            1,
            true,
        );
    },
};

// 不死祝福：防止进入濒死（dying，不消耗层数）；移除到0且体力≤0时立即进入濒死（removeMark，源 L563）。
RULE_MARKS['bts_bless_busi'] = {
    ...RULE_MARKS['bts_bless_busi'],
    trigger: { player: 'dying', global: 'removeMark' },
    forced: true,
    silent: true,
    filter(event, player, triggername) {
        if (triggername === 'removeMark')
            return (
                event.player === player &&
                event.markName === 'bts_bless_busi' &&
                !lib.bts.api.getBless(player, 'busi') &&
                player.hp < 1
            );
        return event.player === player && player.hp < 1;
    },
    async content(event, trigger, player) {
        if (event.triggername === 'removeMark') {
            await player.dying(); // 不死祝福移除到0且体力≤0 → 立即进入濒死
            return;
        }
        trigger.cancel(); // 阻止濒死
    },
};

// 升格祝福：移除后仍拥有至少10层时，移除10层并回复1点怒气（源 L1700-1704）。
RULE_MARKS['bts_bless_shengge'] = {
    ...RULE_MARKS['bts_bless_shengge'],
    trigger: { global: 'removeMark' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.player === player &&
            event.markName === 'bts_bless_shengge' &&
            lib.bts.api.getBless(player, 'shengge', 10)
        );
    },
    async content(event, trigger, player) {
        await lib.bts.api.removeBless(player, 'shengge', 10);
        lib.bts.api.addAngry(player);
    },
};

// 绝海祝福：造/受伤后清全场异常（引爆并移除麻痹/烧伤/中毒，源 gamerule_ex damageEnd）。
RULE_MARKS['bts_bless_haiqu'] = {
    ...RULE_MARKS['bts_bless_haiqu'],
    trigger: { source: 'damageEnd', player: 'damageEnd' },
    forced: true,
    silent: true,
    filter(event, player) {
        return (
            event.num > 0 &&
            (event.source === player || event.player === player)
        );
    },
    async content(event, trigger, player) {
        for (const target of game.filterPlayer())
            await lib.skill['bts_st_mosuo'].util.kafuka(target, player);
    },
};

// ── 批4：modifiers.js 数值修正随标记拆（2026-09-02 TODO 拆分）──
// 揭露组合（jielu+poison 减攻距 / jielu+burn|numb 减手牌上限）属跨标记交叉，仍留在 modifiers.js。

// 神君祝福：攻击范围/手牌上限 增加此祝福层数（源 gamerule_atk L1753 / gamerule_hand L1776）。
RULE_MARKS['bts_bless_shenjun'] = {
    ...RULE_MARKS['bts_bless_shenjun'],
    mod: {
        ...RULE_MARKS['bts_bless_shenjun'].mod,
        attackRange(player, range) {
            return range + lib.bts.api.getBless(player, 'shenjun', -1);
        },
        maxHandcard(player, num) {
            return num + lib.bts.api.getBless(player, 'shenjun', -1);
        },
    },
};

// 烧伤：攻击范围-1（源 gamerule_atk L1754；揭露+中毒组合留在 bts_gamerule_atk，见其 !burn 守卫）。
RULE_MARKS['bts_abnormal_burn'] = {
    ...RULE_MARKS['bts_abnormal_burn'],
    mod: {
        ...RULE_MARKS['bts_abnormal_burn'].mod,
        attackRange(player, range) {
            if (lib.bts.api.getAbnor(player, 'burn')) return range - 1;
        },
    },
};

// 中毒：手牌上限-1（源 gamerule_hand L1780；揭露+烧伤/麻痹组合留在 bts_gamerule_hand，见其 !poison 守卫）。
RULE_MARKS['bts_abnormal_poison'] = {
    ...RULE_MARKS['bts_abnormal_poison'],
    mod: {
        ...RULE_MARKS['bts_abnormal_poison'].mod,
        maxHandcard(player, num) {
            if (lib.bts.api.getAbnor(player, 'poison')) return num - 1;
        },
    },
};

// 睡眠：其他角色与你距离-1（源 gamerule_dis L1763-1772）。
RULE_MARKS['bts_abnormal_sleep'] = {
    ...RULE_MARKS['bts_abnormal_sleep'],
    mod: {
        ...RULE_MARKS['bts_abnormal_sleep'].mod,
        globalTo(from, to, distance) {
            if (lib.bts.api.getAbnor(to, 'sleep')) return distance - 1;
        },
    },
};
