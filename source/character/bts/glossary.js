// 崩铁杀专有名词词条：怒气/护盾/星启/祝福/属性/异常等机制的注册表。
//
// 与叁岛（lit_negClear_faq 等）一致的做法：
//  - 词条以「键 + 键_info」翻译形式注册（无技能对象），同时服务两处消费：
//      1. get.poptip('词条id') —— 技能描述中的专有名词悬浮/点击查看解释；
//      2. 技能 derivation —— 技能详情页把词条作为补充描述渲染在技能描述下方。
//  - 词条 id 统一带 _faq 后缀（同叁岛 lit_negClear_faq），无名杀对 _faq 的
//    特殊处理：角色完整介绍界面不把 derivation 引用的 _faq 词条展开为独立
//    技能按钮（ui/click/index.js 4042 跳过），技能详情弹窗将其渲染为补充
//    描述（ui/click/index.js 3804-3838）。
//  - 词条翻译由 index.js 合并进 fullTranslate；poptip 注册（type: 'character'，
//    叁岛 lit_sameCardName 同款，显示不带〖〗的纯文本名）在
//    source/tool/ui/poptips.js（registerPoptips，content 阶段调用）。
//  - attachGlossaryDerivations 在角色包合并后按技能特征自动挂载词条
//    derivation（不覆盖技能已有的 derivation，只追加）。
//
// 词条 id 统一使用 bts_glossary_ 前缀 + _faq 后缀，避免与真实技能/标记冲突。

import { get } from '../../../../../noname.js';

export const GLOSSARY = [
    {
        id: 'bts_glossary_nuqi_faq',
        // 特殊名称（非标记）：不带任何标点。
        name: '怒气',
        info: '释放必杀技与部分主动技能的资源，通过技能效果获得或消耗。',
    },
    {
        id: 'bts_glossary_bisha_faq',
        // 特殊名词（非标记）：不带任何标点（叁岛 lit_negClear_faq 同款）。
        name: '必杀技',
        info: '角色的强力技能（描述以「必杀技」开头），通常消耗怒气发动，多数每回合限一次。',
    },
    {
        id: 'bts_glossary_xingqi_faq',
        // 特殊名词（非标记）：不带任何标点。
        name: '星启',
        info: '角色的特殊状态（星启祝福）。处于星启状态时，部分技能获得额外效果。',
    },
    {
        id: 'bts_glossary_hudun_faq',
        // 特殊名称（非标记）：不带任何标点。
        name: '护盾',
        info: '独立的防御值，每点护盾可抵挡1点伤害；贯通伤害可无视护盾。',
    },
    {
        id: 'bts_glossary_bless_faq',
        // 特殊名词（非标记）：不带任何标点。
        name: '祝福',
        info: '附着于角色的状态标记，以层数计算，由技能赋予并触发对应效果；部分祝福会随回合或条件消耗。',
    },
    {
        id: 'bts_glossary_bless_fatal_faq',
        name: '致命祝福',
        info: '当你造成伤害时，该伤害视为致命伤害。',
    },
    {
        id: 'bts_glossary_bless_through_faq',
        name: '贯通祝福',
        info: '当你造成伤害时，该伤害视为贯通伤害（可无视护盾）。',
    },
    {
        id: 'bts_glossary_bless_critical_faq',
        name: '暴击祝福',
        info: '当你造成伤害时，该伤害视为暴击伤害。',
    },
    {
        id: 'bts_glossary_bless_busi_faq',
        name: '不死祝福',
        info: '防止你进入濒死状态。',
    },
    {
        id: 'bts_glossary_bless_maxhp_faq',
        name: '体力上限祝福',
        info: '你的体力上限额外增加此祝福层数。',
    },
    {
        id: 'bts_glossary_bless_god_faq',
        name: '星启祝福',
        info: '你视为处于星启状态，部分技能获得额外效果。',
    },
    {
        id: 'bts_glossary_bless_yingzi_faq',
        name: '契约祝福',
        info: '你的额定摸牌数+1。',
    },
    {
        id: 'bts_glossary_bless_shengxi_faq',
        name: '生息祝福',
        info: '此祝福被移除时或受到伤害后，若已受伤，移除1层此祝福并回复1点体力。',
    },
    {
        id: 'bts_glossary_bless_fullburn_faq',
        name: '完全燃烧祝福',
        info: '当你对没有手牌的角色造成炎属性伤害后，其失去1点体力。',
    },
    {
        id: 'bts_glossary_bless_xuneng_faq',
        name: '蓄能祝福',
        info: '当你对其他角色造成伤害后，移除3层此祝福，令其附加火属性。',
    },
    {
        id: 'bts_glossary_bless_canmei_faq',
        name: '残梅祝福',
        info: '拥有贯通祝福的其他角色额定摸牌数+1。',
    },
    {
        id: 'bts_glossary_bless_zhiyu_faq',
        name: '治愈祝福',
        info: '准备阶段开始时，你回复1点体力；若体力不大于1，每有1名存活且拥有生机的角色，回复量+1。',
    },
    {
        id: 'bts_glossary_bless_zengfu_faq',
        name: '增幅祝福',
        info: '你发动必杀技造成的伤害+1；发动必杀技结算完毕后，若拥有至少2层，摸（层数-1）张牌。',
    },
    {
        id: 'bts_glossary_bless_shengge_faq',
        name: '升格祝福',
        info: '此祝福被移除时，若仍拥有至少10层，移除10层此祝福并回复1点怒气。',
    },
    {
        id: 'bts_glossary_bless_jieyin_faq',
        name: '结印祝福',
        info: '你的手牌【杀】视为【决斗】；当你使用【决斗】对其他角色造成伤害时，若其拥有超过1张手牌，防止此伤害并弃置其两张手牌，否则其弃置一张牌并失去1点体力。',
    },
    {
        id: 'bts_glossary_bless_gongwu_faq',
        name: '共舞祝福',
        info: '当你对其他角色造成属性伤害时，其弃置一张手牌，并将其余手牌置于其武将牌上。',
    },
    {
        id: 'bts_glossary_bless_shenjun_faq',
        name: '神君祝福',
        info: '你的攻击范围与手牌上限增加此祝福层数。',
    },
    {
        id: 'bts_glossary_bless_rangming_faq',
        name: '禳命祝福',
        info: '因你回复过体力的角色于其准备阶段或发动必杀技后，回复1点体力并移除1层异常。',
    },
    {
        id: 'bts_glossary_bless_kanpo_faq',
        name: '看破祝福',
        info: '当你使用的无牌【杀】指定目标并结算完毕后，视为对其目标使用【决斗】。',
    },
    {
        id: 'bts_glossary_bless_yuguotianqing_faq',
        name: '雨过天晴祝福',
        info: '体力上限祝福的效果翻倍。',
    },
    {
        id: 'bts_glossary_bless_haiqu_faq',
        name: '绝海祝福',
        info: '当你造成或受到伤害后，你结算并移除所有角色的麻痹、烧伤、中毒。',
    },
    {
        id: 'bts_glossary_bless_zhianzhimi_faq',
        name: '至暗之谜祝福',
        info: '你获得忆质标记的效果×6。',
    },
    {
        id: 'bts_glossary_bless_qiyu_faq',
        name: '旗语祝福',
        info: '准备阶段开始时，你令「远征」视为未发动过。',
    },
    {
        id: 'bts_glossary_bless_haiyao_faq',
        name: '海妖祝福',
        info: '当你对其他角色造成伤害时，防止此伤害并令其附加1层麻痹、烧伤或中毒（随机）。',
    },
    {
        id: 'bts_glossary_bless_reyi_faq',
        name: '热意祝福',
        info: '当不为暗属性且不处于睡眠的角色造成伤害后，所有热意祝福持有者各附加1层。',
    },
    {
        id: 'bts_glossary_bless_dark_faq',
        name: '暗之祝福',
        info: '当你造成无属性伤害时，视为量子属性伤害。',
    },
    {
        id: 'bts_glossary_bless_cifu_faq',
        name: '赐福祝福',
        info: '当你使用【杀】造成无属性伤害时，视为虚数属性伤害。',
    },
    {
        id: 'bts_glossary_bless_huqi_faq',
        name: '狐祈祝福',
        info: '当你造成属性伤害后，受伤角色须弃置一张手牌。',
    },
    {
        id: 'bts_glossary_bless_yingyue_faq',
        name: '|映月|',
        info: `镜流专属：满2朔望由${get.poptip('bts_st_zhuanpo')}进入映月并获${get.poptip('bts_st_yingyue')}；状态内出牌阶段消耗朔望造成${get.poptip('bts_glossary_nature_frost_dmg_faq')}伤害，结算后附睡眠，朔望耗尽退出。`,
    },
    {
        id: 'bts_glossary_bless_xianwaiyin_faq',
        name: '弦外音祝福',
        info: '当你弃置其他角色的手牌后，若其手牌数为1，其须弃置一张手牌。',
    },
    {
        id: 'bts_glossary_bless_zhisheng_faq',
        name: '制胜祝福',
        info: '当你使用【杀】时，若拥有至少3层此祝福，此牌视为【决斗】；当你使用【决斗】指定目标后，移除3层此祝福，将其手牌置于其武将牌上直到此牌结算完毕。',
    },
    {
        id: 'bts_glossary_bless_zhigaozhizi_faq',
        name: '至高之姿祝福',
        info: '你的【杀】视为【决斗】；当你造成光属性伤害后，附加1层此祝福。',
    },
    {
        id: 'bts_glossary_canmeng_faq',
        name: '|残梦|',
        info: `黄泉专属：${get.poptip('bts_st_chigui')}去除异常、${get.poptip('bts_st_feidu')}弃杀各+1枚；满9由${get.poptip('bts_st_canmeng')}发动，全场技能与祝福无效。`,
    },
    {
        id: 'bts_glossary_feihuang_faq',
        name: '|飞黄|',
        info: `飞霄专属：${get.poptip('bts_st_leishou')}击杀追击、${get.poptip('bts_st_yueguan')}弃杀各+1枚；满6由${get.poptip('bts_st_zaohuang')}连斩。`,
    },
    {
        id: 'bts_glossary_zhongdu_faq',
        name: '|中毒|',
        info: `异常状态：由技能效果赋予；手牌上限-1，弃牌阶段开始时失去1点体力；引爆时每层使持有者失去1点体力（回复体力会移除异常）。`,
    },
    {
        id: 'bts_glossary_mabi_faq',
        name: '|麻痹|',
        info: `异常状态：由技能效果赋予；额定摸牌数-1，摸牌阶段开始时受到1点无来源伤害；引爆时每层造成1点无来源伤害（回复体力会移除异常）。`,
    },
    {
        id: 'bts_glossary_guantong_faq',
        // 特殊名词（非标记）：不带任何标点。
        name: '贯通',
        info: '特殊的伤害类型，可无视护盾。',
    },
    {
        id: 'bts_glossary_nature_frost_faq',
        // 霜（冰）元素状态（键名 frost）。
        name: '|霜附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_elec_faq',
        // 电元素状态。
        name: '|电附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_earth_faq',
        name: '|物理附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_dark_faq',
        name: '|量子附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_guang_faq',
        name: '|虚数附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_yan_faq',
        // 炎元素状态（键名 flame）。
        name: '|炎附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_feng_faq',
        name: '|风附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_abnormal_burn_faq',
        name: '|烧伤|',
        info: `异常状态：由技能效果赋予；出牌阶段开始时受到1点无来源伤害，攻击范围-1；引爆时每层造成1点无来源伤害（回复体力会移除异常）。`,
    },
    {
        id: 'bts_glossary_abnormal_freeze_faq',
        name: '|冻结|',
        info: `异常状态：由技能效果赋予；造成的伤害基数-1，不能使用装备牌（回复体力会移除异常）。`,
    },
    {
        id: 'bts_glossary_abnormal_fossilize_faq',
        name: '|石化|',
        info: `异常状态：由技能效果赋予；受到的伤害视为暴击，不能使用锦囊牌（回复体力会移除异常）。`,
    },
    {
        id: 'bts_glossary_abnormal_sleep_faq',
        name: '|睡眠|',
        info: `异常状态：由技能效果赋予；不能使用基本牌，其他角色与你距离-1（回复体力会移除异常）。`,
    },
    {
        id: 'bts_glossary_abnormal_confuse_faq',
        name: '|混乱|',
        info: `异常状态：由技能效果赋予；造成的伤害无效。`,
    },
    {
        id: 'bts_glossary_abnormal_scary_faq',
        name: '|恐惧|',
        info: `异常状态：由技能效果赋予；持有者不能弃置牌。`,
    },
    {
        id: 'bts_glossary_abnormal_shenghua_faq',
        name: '|升华|',
        info: `异常状态：由技能效果赋予；附加元素时再次附加该元素。`,
    },
    {
        id: 'bts_glossary_abnormal_lieyang_faq',
        name: '|烈阳|',
        info: `异常状态：由技能效果赋予；每满2层移除2层并对持有者造成1点无来源伤害。`,
    },
    {
        id: 'bts_glossary_abnormal_shahuo_faq',
        name: '|煞火|',
        info: `异常状态：由技能效果赋予；持有者造成的无属性伤害视为炎属性。`,
    },
    {
        id: 'bts_glossary_abnormal_diyu_faq',
        name: '|地狱|',
        info: `异常状态：由技能效果赋予；你的手牌视为【决斗】；使用【决斗】时失去1点体力。`,
    },
    {
        id: 'bts_glossary_abnormal_duanjian_faq',
        name: '|短见|',
        info: `异常状态：由技能效果赋予；持有者受到伤害时，伤害来源摸1张牌。`,
    },
    {
        id: 'bts_glossary_abnormal_zhanfang_faq',
        name: '|绽放|',
        info: `异常状态：由技能效果赋予；进入摸牌阶段时跳过该阶段。`,
    },
    {
        id: 'bts_glossary_abnormal_luandie_faq',
        name: '|乱蝶|',
        info: `异常状态：由${get.poptip('bts_st_luandie')}赋予（希儿必杀技）；持有者受到伤害后附加等量乱蝶。`,
    },
    {
        id: 'bts_glossary_abnormal_mingding_faq',
        name: '|酩酊|',
        info: `异常状态：由技能效果赋予；持有者受到伤害后，伤害来源回复1点体力。`,
    },
    {
        id: 'bts_glossary_abnormal_fuzhai_faq',
        name: '|负债|',
        // 注：源描述 L13021 写「仅受到视为使用的【杀】造成的伤害后+1」属虚标；
        // 源代码 L4425-4432 为任意伤害 +1，无名杀按代码实现，词条随代码对齐。
        info: `异常状态：由${get.poptip('bts_st_zhangfu')}赋予，受伤后+1层；层数≥4时由${get.poptip('bts_st_jinrong')}移除3层并视为对其使用【杀】。`,
    },
    {
        id: 'bts_glossary_abnormal_jielu_faq',
        name: '|揭露|',
        info: `异常状态：由${get.poptip('bts_st_jielu')}赋予（那刻夏）；与其他异常组合结算：中毒→弃牌阶段失去1点体力、摸牌数-1、攻击范围-1；烧伤/麻痹→手牌上限-1。`,
    },
    {
        id: 'bts_glossary_abnormal_baixie_faq',
        name: '|败谢|',
        info: `异常状态：由技能效果赋予；受到属性伤害或附加元素时弃置一张手牌。`,
    },
    {
        id: 'bts_glossary_abnormal_dingzhen_faq',
        name: '|鼎阵|',
        info: `异常状态：由${get.poptip('bts_st_dingzhen')}赋予（椒丘必杀技，同时令目标烧伤层数拉齐）；与烧伤结算联动。`,
    },
    {
        id: 'bts_glossary_abnormal_chunzui_faq',
        name: '|沉醉|',
        info: `异常状态：由技能效果赋予；弃牌后若手牌数不大于层数，弃置所有手牌。`,
    },
    {
        id: 'bts_glossary_nature_dark_dmg_faq',
        // 伤害属性（与「量子附加」状态区分）：技能造成量子属性伤害时的修饰语。
        name: '量子属性',
        info: '作为量子属性伤害（技能造成对应属性伤害时使用，不附带属性状态）。',
    },
    {
        id: 'bts_glossary_nature_guang_dmg_faq',
        // 伤害属性（与「虚数附加」状态区分）：技能造成虚数属性伤害时的修饰语。
        name: '虚数属性',
        info: '作为虚数属性伤害（技能造成对应属性伤害时使用，不附带属性状态）。',
    },
    {
        id: 'bts_glossary_nature_yan_dmg_faq',
        // 伤害属性（与「炎附加」状态区分）：技能造成炎属性伤害时的修饰语。
        name: '炎属性',
        info: '作为炎属性伤害（技能造成对应属性伤害时使用，不附带属性状态）。',
    },
    {
        id: 'bts_glossary_nature_feng_dmg_faq',
        // 伤害属性（与「风附加」状态区分）：技能造成风属性伤害时的修饰语。
        name: '风属性',
        info: '作为风属性伤害（技能造成对应属性伤害时使用，不附带属性状态）。',
    },
    {
        id: 'bts_glossary_nature_frost_dmg_faq',
        // 伤害属性（与「霜附加」状态区分）：技能造成霜属性伤害时的修饰语。
        name: '霜属性',
        info: '作为霜属性伤害（技能造成对应属性伤害时使用，不附带属性状态）。',
    },
    {
        id: 'bts_glossary_nature_elec_dmg_faq',
        // 伤害属性（与「电附加」状态区分）：技能造成电属性伤害时的修饰语。
        name: '电属性',
        info: '作为电属性伤害（技能造成对应属性伤害时使用，不附带属性状态）。',
    },
    {
        id: 'bts_glossary_nature_earth_dmg_faq',
        // 伤害属性（与「物理附加」状态区分）：技能造成物理属性伤害时的修饰语。
        name: '物理属性',
        info: '作为物理属性伤害（技能造成对应属性伤害时使用，不附带属性状态）。',
    },
    {
        id: 'bts_glossary_extra_st_faq',
        name: '|怒气豁免|',
        info: `消耗怒气时豁免等量怒气（怒气消耗减免）：由${get.poptip('bts_st_shiyue')}赋予（昔涟可选择任意角色获得）。`,
    },
    {
        id: 'bts_glossary_zhugu_faq',
        name: '|主顾|',
        info: `赛飞儿专属：${get.poptip('bts_st_reqing')}以【顺手牵羊】指定目标；主顾角色受伤后赛飞儿获得等量七札。`,
    },
    {
        id: 'bts_glossary_qizha_faq',
        name: '|七札|',
        info: `赛飞儿专属：主顾角色受伤后获得等量；${get.poptip('bts_st_jingshang')}消耗全部，按数量令目标获得诅咒。`,
    },
    {
        id: 'bts_glossary_huozhong_faq',
        name: '|火种|',
        info: `白厄专属：${get.poptip('bts_st_shenju')}获牌/治疗、${get.poptip('bts_st_pidi')}受伤弃杀各+1枚；满6/12由${get.poptip('bts_st_fanshi')}变身燔世。`,
    },
    {
        id: 'bts_glossary_bts_fanshi_active_faq',
        name: '|燔世状态|',
        info: `白厄变身状态：发动${get.poptip('bts_st_fanshi')}（耗火种）后变身卡厄斯兰那；他回合结束时你执行额外回合，濒死时回复并退出。`,
    },
    {
        id: 'bts_glossary_shengbian_faq',
        name: '|升变|',
        info: `刻律德菈专属：${get.poptip('bts_st_shiqi')}必杀、${get.poptip('bts_st_shengbian')}结束弃杀、${get.poptip('bts_st_jungong')}用/失杀各+1枚；出牌阶段结束时满6消费6枚，对最近伤害者造成伤害。`,
    },
    {
        id: 'bts_glossary_yizhi_faq',
        name: '|忆质|',
        info: `长夜月专属：${get.poptip('bts_st_tongxing')}受伤、${get.poptip('bts_st_zhouli')}召唤各+量；满8由${get.poptip('bts_st_yulu')}对最近伤害者造成伤害并解长夜。`,
    },
    {
        id: 'bts_glossary_jiyi_faq',
        name: '|记忆|',
        info: `昔涟专属：${get.poptip('bts_st_zhuiyi')}用杀/决斗、${get.poptip('bts_st_zhongyuan')}获得；拥有${get.poptip('bts_st_aishi')}时经${get.poptip('bts_st_letu')}引擎（任意伤害后除外牌）获得；满12/24发动${get.poptip('bts_st_shiyue')}。`,
    },
    {
        id: 'bts_glossary_bts_st_letu_active_faq',
        name: '|乐土状态|',
        info: `昔涟状态：由${get.poptip('bts_st_shiyue')}（永久）、${get.poptip('bts_st_zhongyuan')}（临时）获得；状态内可将手牌【杀】当【决斗】，且拥有${get.poptip('bts_st_aishi')}时任意角色造成伤害后除外1张乐土牌（能当手牌使用或打出）并获1枚${get.poptip('bts_glossary_jiyi_faq')}。`,
    },
    {
        id: 'bts_glossary_lanhan_faq',
        name: '|婪酣|',
        info: `不死途专属：${get.poptip('bts_st_suyuan')}获得；${get.poptip('bts_st_xiangyan')}消耗全部。`,
    },
    {
        id: 'bts_glossary_magic_diamond_faq',
        name: '|宝石|',
        info: `远坂凛专属：${get.poptip('bts_st_mingxin')}星启、${get.poptip('bts_st_moshu')}他人弃杀各+量；${get.poptip('bts_st_shiyan')}耗3枚概率暗伤。`,
    },
    {
        id: 'bts_glossary_xingzhi_faq',
        name: '|兴致|',
        info: `吉尔伽美什专属：${get.poptip('bts_st_caibao')}、${get.poptip('bts_wanglai_yunxu')}获得；满10由${get.poptip('bts_wanglai_chengren')}按兴致摸牌并清空。`,
    },
    {
        id: 'bts_glossary_qifen_faq',
        name: '|气氛|',
        info: `知更鸟·晴歌专属：${get.poptip('bts_st_xunyou')}获得；满12由${get.poptip('bts_st_hesheng')}翻面并造成风属性伤害。`,
    },
    {
        id: 'bts_glossary_duzhu_faq',
        name: '|赌注|',
        info: `砂金专属：${get.poptip('bts_st_xunjue')}判定、${get.poptip('bts_st_binguo')}受伤各+1枚；满7点亮${get.poptip('bts_st_binguo')}，对所有其他角色使用【杀】。`,
    },
    {
        id: 'bts_glossary_shuowang_faq',
        name: '|朔望|',
        info: `镜流专属：${get.poptip('bts_st_tianhe')}必杀、${get.poptip('bts_st_wuxia')}扣血各+1枚；满2由${get.poptip('bts_st_zhuanpo')}进入映月，出牌阶段消耗朔望发动${get.poptip('bts_st_yingyue')}。`,
    },
    {
        id: 'bts_glossary_xuechou_faq',
        name: '|血仇|',
        info: `万敌专属：${get.poptip('bts_st_zhutian')}必杀、${get.poptip('bts_st_xuechou')}受伤各+层；满体力上限清空登神，或对最近伤害者造成伤害。`,
    },
    {
        id: 'bts_glossary_moze_dark_assault_faq',
        name: '|暗袭|',
        info: `貊泽专属：${get.poptip('bts_st_lvexi')}赋予；猎物受他人【杀】伤害后追击，暗祝福耗尽或死亡结束。`,
    },
    {
        id: 'bts_glossary_fuyuan_faq',
        name: '|浮元|',
        info: `灵砂专属：${get.poptip('bts_st_fuyuan')}视为【杀】，累计3次失去；可由${get.poptip('bts_st_feicai')}弃杀重新获得。`,
    },
    {
        id: 'bts_glossary_st_zhankan_faq',
        name: '|斩勘|',
        info: `景元专属：${get.poptip('bts_st_zhankan')}觉醒获得，+3怒气并解锁${get.poptip('bts_st_shenjun')}。`,
    },
    {
        id: 'bts_glossary_st_piji_faq',
        name: '|否极|',
        info: `符玄专属：${get.poptip('bts_st_piji')}濒死时+1并回复；${get.poptip('bts_st_tianlv')}发动时消耗全部。`,
    },
    {
        id: 'bts_glossary_ebao_faq',
        name: '|恶报|',
        info: `雪衣专属：${get.poptip('bts_st_yebao')}获得；满9弃10枚，对最近伤害者使用暗【杀】。`,
    },
    {
        id: 'bts_glossary_koudai_faq',
        name: '|口袋|',
        info: `波提欧专属：${get.poptip('bts_st_chishuo')}弃杀赋予；${get.poptip('bts_st_zhuangtian')}以【决斗】造成伤害时令其弃至多3张手牌。`,
    },
    {
        id: 'bts_glossary_st_mengchong_faq',
        name: '|传冲|',
        info: `米沙专属：${get.poptip('bts_st_jizong')}弃杀、${get.poptip('bts_st_fuwu')}获牌各+1枚；${get.poptip('bts_st_mengchong')}发动时增冲击次数。`,
    },
    {
        id: 'bts_glossary_xinrui_faq',
        name: '|新蕊|',
        info: `遐蝶专属：${get.poptip('bts_st_huangwu')}获得；满7由${get.poptip('bts_st_wangxiao')}召唤死龙。`,
    },
    {
        id: 'bts_glossary_midi_faq',
        name: '|谜底|',
        info: `大黑塔专属：${get.poptip('bts_st_shijie')}获得；${get.poptip('bts_st_geju')}若拥有至少41枚，有概率弃41枚追加霜属性伤害。`,
    },
    {
        id: 'bts_glossary_linggan_faq',
        name: '|灵感|',
        info: `大黑塔专属：${get.poptip('bts_st_mofa')}必杀获得；${get.poptip('bts_st_geju')}弃1枚令受伤者各弃一张手牌。`,
    },
    {
        id: 'bts_glossary_baihua_faq',
        name: '|白花|',
        info: `罗刹专属：${get.poptip('bts_st_guizang')}必杀+1；有2枚以上时${get.poptip('bts_st_lunzhuan')}令受伤者回复1，准备阶段清除。`,
    },
    {
        id: 'bts_glossary_bailu_zhulu_faq',
        name: '|珠露|',
        info: `白露专属：${get.poptip('bts_st_zhulu')}治疗时在被奶角色上充留；带珠露的角色之后可被珠露的二次随机补奶选中。`,
    },
];

/** 词条翻译表：id → 显示名、id_info → 解释（合并进 fullTranslate）。 */
export const GLOSSARY_TRANSLATE = Object.fromEntries(
    GLOSSARY.flatMap((g) => [
        [g.id, g.name],
        [`${g.id}_info`, g.info],
    ]),
);

// ── 技能 → 词条 的 derivation 自动挂载规则 ──────────────────────────────
// test(id, src)：src 为技能 id + 各函数/字符串字段的源码文本。
const DERIVATION_RULES = [
    { id: 'bts_glossary_bisha_faq', test: (id) => id.startsWith('bts_st_') },
    {
        id: 'bts_glossary_nuqi_faq',
        test: (id, src) =>
            /(?:getAngry|loseAngry|addAngry|'angry'|"angry"|'bts_angry'|"bts_angry")/.test(
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
        id: 'bts_glossary_nature_guang_faq',
        test: (id, src) => /nature\s*:\s*'light'/.test(src),
    },
    {
        id: 'bts_glossary_nature_yan_faq',
        test: (id, src) => /nature\s*:\s*'flame'/.test(src),
    },
    {
        id: 'bts_glossary_nature_feng_faq',
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
 * 在 bts/index.js 合并 skill 后调用。
 */
export function attachGlossaryDerivations(skillMap) {
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
            if (rule.test(id, src)) deps.add(rule.id);
        }
        if (deps.size) {
            info.derivation = deps.size === 1 ? [...deps][0] : [...deps];
        }
    }
}
