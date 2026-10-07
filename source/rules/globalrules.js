// 崩铁杀全局规则技能 + 通用机制词条。
// 机制层：damage/recover/phase/decay 四个纯全局规则（bts_gamerule_ 前缀 → registerRules 挂全局）；
// 角色相关的全局结算在各自角色文件/标记技能，此处只保留纯全局规则。
// decay 的祝福/异常名单读生成表（scripts/generate.mjs → generated/buffRegistry.js，按定义标签归类）。
// 技能定义只引用全局（lib.bts.*），不引用包级变量（对齐叁岛规范）。
import { lib, game, get } from '../../../../noname.js';
import { MARKS } from './markRegistry.js';
import {
    BLESSES,
    ABNORMALS,
    PERMANENT_BLESSES,
} from '../generated/buffRegistry.js';

function clearSuffixMarks(player, suffix) {
    for (const mark of Object.keys(player.storage || {})) {
        if (mark.endsWith(suffix) && player.countMark(mark) > 0) {
            player.removeMark(mark, player.countMark(mark));
        }
    }
}

// 伤害结算：damageBegin1（_critical 归一化/星启必杀+1/元素相克）＋ damageEnd（怒气/属性/伤害链/忆灵/暴击回怒）。
export const bts_gamerule_damage = {
    global: true,
    charlotte: true,
    silent: true,
    popup: false,
    trigger: { global: ['damageBegin1', 'damageEnd'] },
    filter(event, player) {
        // 本技能只挂 damageBegin1/damageEnd；阶段逻辑在 bts_gamerule_phase（源把二者写在
        // 同一 on_trigger 大函数内按 event 分发，移植按事件拆分，定夺 G-05）。
        return event.player === player || event.source === player;
    },
    async content(event, trigger, player) {
        // 触发点判据必须用 event.triggername（技能事件记录的触发点名）：trigger 是伤害
        // 事件本体、trigger.name 恒为 'damage'，误用会让开始分支成死代码、结束分支双跑。
        // 正确语义：开始分支仅源方执行、结束分支仅 damageEnd 执行，各服一次。
        if (event.triggername === 'damageBegin1') {
            if (trigger.source !== player || trigger.num <= 0) return;
            // 欢愉约束（源 gamerule_ex·DamageCaused L1235-1238）：欢愉角色（含阿哈）造成的
            // 伤害被取消，除非其处于「欢愉升格」（阿哈·欢愉万相，持续至其回合结束）。
            // 源 `return true` 在 room.cpp 即 break 整个伤害流程＝取消，且无日志。
            if (
                lib.bts.api.funnyPlayer(player) &&
                player.countMark('bts_mk_huanju_shengge-clear') <= 0
            ) {
                trigger.cancel();
                return;
            }
            // 暴击（_critical）由各技能 markDamage 自标（刃·万死/万敌·血仇/Archer·螺旋等），
            // 本处不做归一化（源 IsSpecial/AddNew L266 以 reason 含 "_critical" 识别；定夺 G-06）。
            // 星启必杀+1（源 ConfirmDamage L1100：God(player) 且 reason 含 "max_"，
            // 无 _common 排除）；无名杀以 isBishaReason 判定（勿用 includes('st_')）。
            if (lib.bts.api.god(player) && lib.bts.api.isBishaReason(trigger.reason))
                trigger.num += 1;
            // 元素相克：伤害属性与目标附加属性不同 → 伤害+1、移除目标旧属性（源 L1103-1110）。
            // 仅排除 _nature（源 L1131）；_common/无 reason 照样参与相克（定夺回退源版）。
            const nature = lib.bts.api.getNature(trigger);
            const attached = lib.bts.api.getNature(null, trigger.player);
            if (
                nature &&
                attached &&
                nature !== attached &&
                !trigger.reason?.includes('_bts_reason_nature')
            ) {
                trigger.num += 1;
                lib.bts.api.markDamage(trigger, '_nature');
                lib.bts.api.removeNature(trigger.player, attached);
            }
            return;
        }
        // 以下仅 damageEnd 触发点执行。
        if (event.triggername !== 'damageEnd') return;
        if (trigger.num <= 0) return;
        if (trigger.player === player) {
            if (!lib.bts.api.isSpecialDamage(trigger, '_fatal'))
                lib.bts.api.addAngry(player, trigger.num);
            const nature = lib.bts.api.getNature(trigger);
            if (nature && !trigger.reason?.includes('_bts_reason_nature'))
                await lib.bts.api.addNature(player, nature);
            if (trigger.source) {
                trigger.source.addMark(
                    `${MARKS.DAMAGE_LINK_PREFIX}${player.playerid}`,
                    trigger.num,
                    false,
                );
            }
            // 忆灵生命池：本体受伤等量扣忆灵生命（源 HpChanged L1366-1382）。
            await lib.bts.api.petLifeDelta(player, -trigger.num);
        }
        if (trigger.source === player) {
            // 暴击回怒为全局规则。
            if (lib.bts.api.isSpecialDamage(trigger, '_critical'))
                lib.bts.api.addAngry(player);
        }
    },
};

// 回复/失体力结算：recoverEnd（清基础异常/recover_link/忆灵回补）＋ loseHpEnd（忆灵扣减）。
export const bts_gamerule_recover = {
    global: true,
    charlotte: true,
    silent: true,
    popup: false,
    trigger: { global: ['recoverEnd', 'loseHpEnd'] },
    filter(event, player) {
        return event.player === player;
    },
    async content(event, trigger, player) {
        // 触发点后缀在 event.triggername（trigger.name 为基名如 recover/loseHp——勿用其判后缀）。
        if (event.triggername === 'recoverEnd') {
            if (trigger.num <= 0) return;
            // 源规则 HpRecover 会移除全部基础异常，不是仅移除一层。
            for (const name of [
                'sleep',
                'fossilize',
                'freeze',
                'burn',
                'numb',
                'poison',
            ]) {
                lib.bts.api.removeAbnormal(player, name, -1);
            }
            if (trigger.source)
                // 源 HpRecover L1357-1358：标记加在「被治疗者」身上、键=治疗者（RecoverLink<治疗者>）。
                player.addMark(
                    `${MARKS.RECOVER_LINK_PREFIX}${trigger.source.playerid}`,
                    trigger.num,
                    false,
                );
            // 忆灵生命池：本体回复等量回补（封顶 GetPetMaxHp，源 HpChanged L1383-1388）。
            await lib.bts.api.petLifeDelta(player, trigger.num);
            return;
        }
        // 忆灵生命池：纯失去体力（非伤害附带）等量扣忆灵生命（源 HpChanged n=data:toInt，
        // L1391-1396）；伤害附带的 loseHp 由 damageEnd 已计，此处经 lostHp 排除。
        const lost = lib.bts.api.getLostHp(trigger);
        if (lost > 0) await lib.bts.api.petLifeDelta(player, -lost);
    },
};

// 阶段标记清理：出牌/回合开始/回合末清对应后缀标记（-play/-start/-clear）。
// -start 用 phaseBefore（content.js L4083，phase 事件第一步、早于一切回合内触发）——
//「下回合开始前有效」语义应在回合一开始即失效（定夺 #1）。
export const bts_gamerule_phase = {
    global: true,
    charlotte: true,
    silent: true,
    popup: false,
    trigger: { global: ['phaseUseBegin', 'phaseBeforeStart', 'phaseAfter'] },
    filter(event, player) {
        // 仅清理「当前阶段归属者」自己的后缀标记（阶段事件 event.player 为回合归属者）；
        // 修复前无过滤会把全场所有人的同后缀标记一并清掉，语义错误。
        return event.player === player;
    },
    async content(event, trigger, player) {
        // 触发点名存于 event.triggername（phase 事件本体没有该字段，误用会让后缀标记永不清理）。
        // 三个点名即 engine phase 内容段的真实 fire 名：content.js L4154/L4319 直发
        // phaseBeforeStart/phaseAfter；phaseUseBegin 为逐阶段 Begin。
        const suffix = {
            phaseUseBegin: '-play',
            phaseBeforeStart: '-start',
            phaseAfter: '-clear',
        }[event.triggername];
        if (suffix) clearSuffixMarks(player, suffix);
    },
};

// 自然衰减：结束阶段开始时，除常驻（PERMANENT_BLESSES）外祝福/异常各减1层。
export const bts_gamerule_decay = {
    global: true,
    charlotte: true,
    silent: true,
    popup: false,
    trigger: { global: 'phaseJieshuBegin' },
    filter(event, player) {
        return event.player === player;
    },
    async content(event, trigger, player) {
        // 只有当前结束阶段角色自然衰减；常驻祝福（生成表 PERMANENT_BLESSES）不衰减。
        for (const key of ABNORMALS)
            lib.bts.api.removeAbnormal(player, key.slice('bts_abnormal_'.length), 1);
        // 体力上限祝福先减且逐项顺序结算（源 allbless L534-543 次序）：×2 快照依赖雨过天晴
        // 尚未被移除；乱序（如并发）会让雨过天晴先归零触发补收、上限层再按 ×1 扣 → 双重扣减。
        if (!PERMANENT_BLESSES.includes('bts_bless_maxhp'))
            await lib.bts.api.removeBless(player, 'maxhp', 1);
        for (const key of BLESSES) {
            if (
                key === 'bts_bless_maxhp' ||
                PERMANENT_BLESSES.includes(key)
            )
                continue;
            await lib.bts.api.removeBless(
                player,
                key.slice('bts_bless_'.length),
                1,
            );
        }
    },
};

// ── 通用机制词条（通用/多角色共用 → 本文件）；角色专属词条随角色文件 glossary 导出，
// 经 bts/index.js 聚合进 fullTranslate + poptip 前缀扫描。
export const glossary = [
    {
        id: 'bts_glossary_nuqi_faq',
        name: '怒气',
        info: `释放${get.poptip('bts_glossary_bisha_faq')}与部分主动技能的资源。受到伤害后回复等量${get.poptip('bts_glossary_nuqi_faq')}（受${get.poptip('bts_glossary_bless_fatal_faq')}伤害时不回复）；${get.poptip('bts_glossary_bless_critical_faq')}伤害来源回复1点${get.poptip('bts_glossary_nuqi_faq')}；部分技能效果也会回复或消耗${get.poptip('bts_glossary_nuqi_faq')}。`,
    },
    {
        id: 'bts_glossary_bisha_faq',
        name: '必杀技',
        info: `角色的强力技能，消耗${get.poptip('bts_glossary_nuqi_faq')}或其他资源发动，无次数限制，仅受${get.poptip('bts_glossary_nuqi_faq')}门槛与${get.poptip('bts_glossary_nuqi_faq')}资源制约。`,
    },
    {
        id: 'bts_glossary_xingqi_faq',
        name: '星启',
        info: `角色的特殊状态（${get.poptip('bts_glossary_bless_god_faq')}）。处于${get.poptip('bts_glossary_xingqi_faq')}状态时，部分技能获得额外效果。`,
    },
    {
        id: 'bts_glossary_hudun_faq',
        name: '护盾',
        info: `独立的防御值，每点${get.poptip('bts_glossary_hudun_faq')}可抵挡1点伤害；${get.poptip('bts_glossary_guantong_faq')}伤害可无视${get.poptip('bts_glossary_hudun_faq')}。`,
    },
    {
        id: 'bts_glossary_bless_faq',
        name: '祝福',
        info: `附着于角色的状态标记，以层数计算，由技能赋予并触发对应效果；${get.poptip('bts_glossary_bless_faq')}在你的结束阶段开始时自然减少1层，部分${get.poptip('bts_glossary_bless_faq')}还会因特定效果移除层数。`,
    },
    {
        id: 'bts_glossary_bless_fatal_faq',
        name: '致命祝福',
        info: `当你造成伤害时，该伤害视为${get.poptip('bts_glossary_bless_fatal_faq')}伤害（受到该伤害的角色不会因此回复${get.poptip('bts_glossary_nuqi_faq')}）。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_through_faq',
        name: '贯通祝福',
        info: `当你造成伤害时，该伤害视为${get.poptip('bts_glossary_guantong_faq')}伤害（可无视${get.poptip('bts_glossary_hudun_faq')}）；你无视其他角色的防具。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_critical_faq',
        name: '暴击祝福',
        info: `当你造成伤害时，该伤害视为${get.poptip('bts_glossary_bless_critical_faq')}伤害。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_busi_faq',
        name: '不死祝福',
        info: `防止你进入濒死状态（防止进入濒死时不消耗层数）；此${get.poptip('bts_glossary_bless_faq')}被移除至0层且你的体力小于1时，你立即进入濒死。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_maxhp_faq',
        name: '体力上限祝福',
        info: `你的${get.poptip('bts_glossary_bless_maxhp_faq')}额外增加此${get.poptip('bts_glossary_bless_faq')}层数（若拥有${get.poptip('bts_glossary_bless_yuguotianqing_faq')}则翻倍）。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层，${get.poptip('bts_glossary_bless_maxhp_faq')}随之下调。`,
    },
    {
        id: 'bts_glossary_bless_god_faq',
        name: '星启祝福',
        info: `你视为处于${get.poptip('bts_glossary_xingqi_faq')}状态，部分技能获得额外效果。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_yingzi_faq',
        name: '契约祝福',
        info: `你的额定摸牌数+1。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_zhiyu_faq',
        name: '治愈祝福',
        info: `准备阶段开始时，你回复1点体力；若体力不大于1，每有1名存活且拥有${get.poptip('bts_sk_shengji')}的角色，回复量+1。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_zengfu_faq',
        name: '增幅祝福',
        info: `你发动${get.poptip('bts_glossary_bisha_faq')}造成的伤害+1；发动${get.poptip('bts_glossary_bisha_faq')}结算完毕后，若拥有至少2层，摸（层数-1）张牌。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_cifu_faq',
        name: '赐福祝福',
        info: `当你使用【杀】造成无属性伤害时，视为${get.poptip('bts_glossary_nature_guang_faq')}伤害。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_funny_faq',
        name: '欢愉祝福',
        info: `每层使你的欢愉成功判定成功率+10%。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_funnypoint_faq',
        name: '笑点',
        info: '欢愉行动结算后获得1枚；欢愉时刻开始时消耗全部笑点换算欢愉层数。',
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
        name: '贯通',
        info: `特殊的伤害类型，可无视${get.poptip('bts_glossary_hudun_faq')}。`,
    },
    {
        id: 'bts_glossary_nature_frost_faq',
        name: '|霜附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_elec_faq',
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
        id: 'bts_glossary_nature_light_faq',
        name: '|虚数附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_flame_faq',
        name: '|炎附加|',
        info: '附加在角色身上的元素状态：影响相关技能判定，受到不同属性伤害时该伤害+1并被移除。',
    },
    {
        id: 'bts_glossary_nature_wind_faq',
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
        info: `异常状态：由技能效果赋予；受到的伤害视为${get.poptip('bts_glossary_bless_critical_faq')}，不能使用锦囊牌（回复体力会移除异常）。`,
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
        id: 'bts_glossary_abnormal_diyu_faq',
        name: '|地狱|',
        info: `异常状态：由技能效果赋予；你的手牌视为【决斗】；使用【决斗】时失去1点体力。`,
    },
    {
        id: 'bts_glossary_abnormal_luoxuan_faq',
        name: '|螺旋|',
        info: `异常状态：由${get.poptip('bts_sk_luoxuan')}赋予（${get.poptip('bts_ch_archer')}·${get.poptip('bts_sk_luoxuan')}）；拥有期间所有角色不是你使用牌的合法目标（只能使用技能牌）；出牌阶段结束时移除全部。`,
    },
    {
        id: 'bts_glossary_abnormal_losemaxhp_faq',
        name: '|体力上限减少|',
        info: `异常状态：由技能效果赋予；你额外减少等同于此异常数的${get.poptip('bts_glossary_bless_maxhp_faq')}；结束阶段开始时，移除1层此异常。`,
    },
    {
        id: 'bts_glossary_nature_dark_dmg_faq',
        // 伤害属性（与「量子附加」状态区分）：技能造成量子属性伤害时的修饰语。
        name: '量子属性',
        info: `作为${get.poptip('bts_glossary_nature_dark_faq')}伤害（技能造成对应属性伤害时使用，不附带属性状态）。`,
    },
    {
        id: 'bts_glossary_nature_light_dmg_faq',
        // 伤害属性（与「虚数附加」状态区分）：技能造成虚数属性伤害时的修饰语。
        name: '虚数属性',
        info: `作为${get.poptip('bts_glossary_nature_guang_faq')}伤害（技能造成对应属性伤害时使用，不附带属性状态）。`,
    },
    {
        id: 'bts_glossary_nature_flame_dmg_faq',
        // 伤害属性（与「炎附加」状态区分）：技能造成炎属性伤害时的修饰语。
        name: '炎属性',
        info: '作为炎属性伤害（技能造成对应属性伤害时使用，不附带属性状态）。',
    },
    {
        id: 'bts_glossary_nature_wind_dmg_faq',
        // 伤害属性（与「风附加」状态区分）：技能造成风属性伤害时的修饰语。
        name: '风属性',
        info: `作为${get.poptip('bts_glossary_nature_feng_faq')}伤害（技能造成对应属性伤害时使用，不附带属性状态）。`,
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
        info: `作为${get.poptip('bts_glossary_nature_earth_faq')}伤害（技能造成对应属性伤害时使用，不附带属性状态）。`,
    },
];
