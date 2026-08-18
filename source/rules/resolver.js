// bts_gamerule_ex：animal.lua gamerule_ex 的通用事件结算器。
// 技能定义（content/filter/mod）只引用全局（lib.bts.*），不引用包级变量（对齐叁岛规范）。
import { lib, game, get } from '../../../../noname.js';
import { ABNORMALS, BLESSES, MARKS } from './marks.js';

function clearSuffixMarks(player, suffix) {
    for (const mark of Object.keys(player.storage || {})) {
        if (mark.endsWith(suffix) && player.countMark(mark) > 0) {
            player.removeMark(mark, player.countMark(mark));
        }
    }
}

// 制胜祝福锁手：归还仍在其武将牌上、且仍归其所有的牌（死亡/易主则自然流失）。
async function zhishengReturn(event) {
    const stash = event._bts_zhisheng_stash;
    if (!stash) return;
    delete event._bts_zhisheng_stash;
    for (const { target, cards } of stash) {
        if (!target.isAlive()) continue;
        const back = cards.filter(
            (card) => get.position(card) === 'x' && get.owner(card) === target,
        );
        if (back.length) {
            game.log(target, '取回了被制胜祝福置于武将牌上的手牌');
            await target.gain(back, 'gain2');
        }
    }
}

export const HANDLERS = {
    // 来源侧：星启/祝福先赋予伤害类型，目标侧的护盾在 damageBegin2 处理。
    // 对照源 gamerule_ex DamageCaused（L1143-1176）与 ConfirmDamage（L1098-1142）。
    async damageBegin1(event, player) {
        if (event.source !== player || event.num <= 0) return;
        // 原版 reason 判定（源 animal.lua L266 等）：reason 含 _critical 视为暴击伤害，
        // 覆盖刃·万死/万敌·血仇/Archer·螺旋等用 reason 标记暴击的技能（无名杀靠
        // markDamage 打 _critical 标记，据此在 damageEnd 结算暴击回怒）。
        if (
            event.reason &&
            !event.reason.includes('_common') &&
            event.reason.includes('_critical') &&
            !lib.bts.api.isSpecialDamage(event, '_critical')
        ) {
            lib.bts.api.markDamage(event, '_critical');
        }
        // 海妖/结印/共舞/冻结 已拆到各自祝福/异常标记技能（2026-09-02 TODO 批3 拆分）。
        // 浮元链（源 DamageCaused L1153-1175）：浮元【杀】防止伤害，弃(伤害值)张手牌，附加火属性，治疗最低体力回复关联角色。
        if (event.card?.storage?.bts_st_fuyuan) {
            const target = event.player;
            event.cancel();
            if (target.countCards('h') > 0) {
                await target.chooseToDiscard(
                    `浮元：弃置${get.cnNumber(event.num)}张手牌`,
                    'h',
                    [event.num, event.num],
                    true,
                );
            }
            await lib.bts.api.addNature(target, 'flame');
            const healed = game
                .filterPlayer(
                    (candidate) =>
                        candidate.countMark(
                            `bts_recover_link_${player.playerid}`,
                        ) && candidate.isDamaged(),
                )
                .sort((a, b) => a.hp - b.hp);
            if (healed.length) await healed[0].recover(player);
            return;
        }
        // 星启必杀+1（源 ConfirmDamage L1100：God(player) 且 reason 含 "max_"，无 _common 排除）；
        // 无名杀以 isBishaReason 判定（勿用 includes('st_')，命中所有 bts_st_* 技能）
        if (lib.bts.api.god(player) && lib.bts.api.isBishaReason(event.reason))
            event.num += 1;
        // 增幅/贯通/致命/暴击/暗/赐福/狐祈 已拆到各自祝福标记技能（2026-09-02 TODO 批3 拆分）。
        // 映月状态（源 ConfirmDamage L1121：持有暴击祝福或映月 → AddNew "_critical"，
        // 无 _common 排除；暴击祝福部分在 bts_bless_critical 标记技能，此处仅映月）。
        if (player.hasSkill('bts_st_yingyue'))
            lib.bts.api.markDamage(event, '_critical');
        // 混乱：造成的伤害无效 已拆到 bts_abnormal_confuse 标记技能（2026-09-02 TODO 批2 拆分）。
        const nature = lib.bts.api.getNature(event);
        if (!nature && lib.bts.api.getAbnor(event.player, 'shahuo'))
            lib.bts.api.setDamageNature(event, 'flame');
        const attached = lib.bts.api.getNature(null, event.player);
        if (
            nature &&
            attached &&
            nature !== attached &&
            !event.reason?.includes('_nature')
        ) {
            event.num += 1;
            lib.bts.api.markDamage(event, '_nature');
            lib.bts.api.removeNature(event.player, attached);
        }
    },
    // 目标侧：诅咒/护盾/败谢/石化 已拆到 bts_curse / bts_shield / bts_abnormal_baixie /
    // bts_abnormal_fossilize 标记技能（2026-09-02 TODO 批1/2 拆分），damageBegin2 不再需要。
    async damageEnd(event, player) {
        if (event.num <= 0) return;
        if (event.player === player) {
            if (!lib.bts.api.isSpecialDamage(event, '_fatal'))
                lib.bts.api.addAngry(player, event.num);
            // 乱蝶/酩酊/负债/短见/生息 已拆到各自异常/祝福标记技能（2026-09-02 TODO 批2/3 拆分）。
            const nature = lib.bts.api.getNature(event);
            if (nature && !event.reason?.includes('_nature'))
                await lib.bts.api.addNature(player, nature);
            if (event.source) {
                event.source.addMark(
                    `${MARKS.DAMAGE_LINK_PREFIX}${player.playerid}`,
                    event.num,
                    false,
                );
            }
            // 忆灵生命池：本体受伤等量扣忆灵生命（源 HpChanged L1366-1382，
            // 用户定夺 2026-09-02 统一实现；归零自动 RemovePet）。
            await lib.bts.api.petLifeDelta(player, -event.num);
        }
        if (event.source === player) {
            // 暴击回怒为全局规则；完全燃烧/蓄能/至高之姿/绝海 已拆到各自祝福标记技能
            //（2026-09-02 TODO 批3 拆分）。
            if (lib.bts.api.isSpecialDamage(event, '_critical')) lib.bts.api.addAngry(player);
            // 热意祝福（跨角色聚合：造成伤害且不为暗属性/睡眠时，所有热意持有者各+1层，源 L1303-1309）。
            if (
                lib.bts.api.getNature(null, player) !== 'dark' &&
                !lib.bts.api.getAbnor(player, 'sleep')
            ) {
                for (const p of game.filterPlayer((p) =>
                    lib.bts.api.getBless(p, 'reyi'),
                ))
                    await lib.bts.api.addBless(p, 'reyi', 1, player);
            }
        }
    },
    async useSkillAfter(event, player) {
        if (event.player !== player || !event.skill) return;
        // 禳命祝福：发动必杀技后，若因拥有此祝福的角色回复过体力，回复1点并移除1层异常（源 CardUsed L1015-1026）。
        // 源检查 SkillCard 技能名含 "max_"（必杀技）；无名杀以 bts_bisha 标签判定（勿用 includes('st_')）
        if (lib.skill[event.skill]?.bts_bisha === true) {
            const healer = game.filterPlayer(
                (p) =>
                    p !== player &&
                    player.countMark(`bts_recover_link_${p.playerid}`) &&
                    lib.bts.api.getBless(p, 'rangming'),
            );
            if (healer.length && player.isDamaged()) {
                await player.recover(player);
                await lib.bts.api.removeAbnormalChoice(player);
            }
        }
        // 增幅祝福（摸牌）已拆到 bts_bless_zengfu 标记技能（2026-09-02 TODO 批3 拆分）。
    },
    // 制胜祝福：使用【杀】指定目标后视为【决斗】；使用【决斗】指定目标后锁目标手牌（源 animal.lua L1041-1061）。
    async useCard(event, player) {
        if (event.player !== player) return;
        const card = event.card;
        if (!card) return;
        // 地狱：使用【决斗】时失去1点体力（源 PreCardUsed L996-1000）。
        if (card.name === 'juedou' && lib.bts.api.getAbnor(player, 'diyu')) {
            await player.loseHp(1);
        }
        // 至高之姿祝福：使用【杀】视为【决斗】（源 PreCardUsed L1001-1008）。
        if (card.name === 'sha' && lib.bts.api.getBless(player, 'zhigaozhizi')) {
            const duel = get.autoViewAs(
                { name: 'juedou', suit: card.suit, number: card.number },
                event.cards,
            );
            duel.storage = { ...(card.storage || {}) };
            event.card = duel;
            game.log(player, '触发了至高之姿祝福，此【杀】视为【决斗】');
        }
        const usedCard = event.card;
        if (!['sha', 'juedou'].includes(usedCard.name)) return;
        if (!lib.bts.api.getBless(player, 'zhisheng', 3)) return;
        if (usedCard.name === 'sha') {
            const duel = get.autoViewAs(
                {
                    name: 'juedou',
                    suit: usedCard.suit,
                    number: usedCard.number,
                },
                event.cards,
            );
            duel.storage = { ...(usedCard.storage || {}) };
            event.card = duel;
            game.log(player, '触发了制胜祝福，此【杀】视为【决斗】');
        }
        await lib.bts.api.removeBless(player, 'zhisheng', 3);
        const stash = [];
        for (const target of event.targets) {
            const handcards = target.getCards('h');
            if (!handcards.length) continue;
            stash.push({ target, cards: handcards });
            await target.addToExpansion(handcards, 'give');
        }
        if (stash.length) {
            event._bts_zhisheng_stash = stash;
            game.log(
                player,
                '制胜祝福：',
                stash.map((item) => item.target),
                '的手牌被置于武将牌上',
            );
        }
    },
    async useCardAfter(event, player) {
        if (event.player !== player) return;
        await zhishengReturn(event);
        // 看破祝福：使用的无牌【杀】结算完毕后，视为对其目标使用【决斗】（源 CardFinished L1082-1084）。
        const card = event.card;
        if (
            card?.name === 'sha' &&
            !card.cards?.length &&
            lib.bts.api.getBless(player, 'kanpo')
        ) {
            const targets = (event.targets || []).filter((t) => t.isAlive());
            if (targets.length) {
                game.log(player, '触发了看破祝福，视为对目标使用【决斗】');
                await player.useCard(
                    { name: 'juedou', isCard: true },
                    targets,
                );
            }
        }
    },
    async useCardCancelled(event, player) {
        if (event.player === player) await zhishengReturn(event);
    },
    // 沉醉 已拆到 bts_abnormal_chunzui、弦外音 已拆到 bts_bless_xianwaiyin 标记技能
    //（2026-09-02 TODO 批2/3 拆分），discard 处理器不再需要。
    // 残梦封锁：结算完毕前全场不能使用/打出任何牌（源 setPlayerCardLimitation "use,response"）。
    chooseToUseBegin(event, player) {
        if (event.player !== player || !lib.skill['bts_st_canmeng'].util.canmengActive()) return;
        event.filterCard = () => false;
        event.filterButton = () => false;
    },
    chooseToRespondBegin(event, player) {
        if (event.player !== player || !lib.skill['bts_st_canmeng'].util.canmengActive()) return;
        event.filterCard = () => false;
        event.filterButton = () => false;
    },
    async recoverEnd(event, player) {
        if (event.player !== player || event.num <= 0) return;
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
        if (event.source)
            event.source.addMark(
                `${MARKS.RECOVER_LINK_PREFIX}${player.playerid}`,
                event.num,
                false,
            );
        // 忆灵生命池：本体回复等量回补（封顶 GetPetMaxHp，源 HpChanged L1383-1388）。
        await lib.bts.api.petLifeDelta(player, event.num);
    },
    async loseHpEnd(event, player) {
        if (event.player !== player) return;
        // 忆灵生命池：纯失去体力（非伤害附带）等量扣忆灵生命（源 HpChanged n=data:toInt，
        // L1391-1396）；伤害附带的 loseHp 由 damageEnd 已计，此处经 lostHp 排除。
        const lost = lib.bts.api.lostHp(event);
        if (lost > 0) await lib.bts.api.petLifeDelta(player, -lost);
    },
    phaseDrawBegin2(event, player) {
        if (event.player !== player || event.num <= 0) return;
        // 揭露+中毒（且无麻痹，麻痹单独由 bts_abnormal_numb 标记技能处理）：额定摸牌数-1
        //（源 DrawNCards L1473-1476，2026-09-02 TODO 拆分）。
        if (
            !lib.bts.api.getAbnor(player, 'numb') &&
            lib.bts.api.getAbnor(player, 'jielu') &&
            lib.bts.api.getAbnor(player, 'poison')
        )
            event.num = Math.max(0, event.num - 1);
        // 契约祝福（+1）已拆到 bts_bless_yingzi 标记技能（2026-09-02 TODO 批3 拆分）。
        // 残梅祝福：拥有贯通祝福的其他角色的额定摸牌数+1（源 L1454-1456）
        if (
            lib.bts.api.getBless(player, 'through') &&
            game.hasPlayer((p) => p !== player && lib.bts.api.getBless(p, 'canmei'))
        )
            event.num += 1;
    },
    phaseUseBegin(event, player) {
        if (event.player !== player) return;
        clearSuffixMarks(player, '-play');
        // 烧伤：出牌阶段受伤已拆到 bts_abnormal_burn 标记技能（2026-09-02 TODO 拆分）。
    },
    phaseDiscardBegin(event, player) {
        if (event.player !== player) return;
        // 揭露+烧伤/麻痹（且无中毒，中毒单独由 bts_abnormal_poison 标记技能处理）：失去1点体力
        //（源 EventPhaseStart Discard L1577-1587，2026-09-02 TODO 拆分）。
        if (
            !lib.bts.api.getAbnor(player, 'poison') &&
            lib.bts.api.getAbnor(player, 'jielu') &&
            (lib.bts.api.getAbnor(player, 'burn') || lib.bts.api.getAbnor(player, 'numb'))
        ) {
            let n = 1;
            if (player.countMark('bts_st_jingxi') > 0) {
                n = 2; // 惊喜标记：改为失去2点并移除（源 L1581-1584）
                player.removeMark('bts_st_jingxi', player.countMark('bts_st_jingxi'));
            }
            player.loseHp(n);
        }
    },
    async phaseZhunbeiBegin(event, player) {
        if (event.player !== player) return;
        // 注：原在此清除 extraTurn 的 bts_extra_turn_granted（供知更鸟·合颂），
        // 该 storage 已随合颂改走 inExtraTurn() 而删除，此处不再需要清理。
        clearSuffixMarks(player, '-start');
        // 旗语/治愈 已拆到各自祝福标记技能（2026-09-02 TODO 批3 拆分）。
        // 禳命祝福：准备阶段开始时，若因拥有此祝福的角色回复过体力，回复1点并移除1层异常（源 Start L1544-1553）。
        if (
            player.isDamaged() &&
            game.hasPlayer(
                (p) =>
                    p !== player &&
                    player.countMark(`bts_recover_link_${p.playerid}`) &&
                    lib.bts.api.getBless(p, 'rangming'),
            )
        ) {
            await player.recover(player);
            await lib.bts.api.removeAbnormalChoice(player);
        }
        // 跳过回合（拟洞）已拆到 bts_skip_turn 标记技能（2026-09-02 TODO 批2 拆分）。
    },
    // 绽放：跳过摸牌阶段 已拆到 bts_abnormal_zhanfang 标记技能（2026-09-02 TODO 批2 拆分）。
    // 标记移除时的祝福结算（生息/升格/不死）已拆到各自祝福标记技能
    //（源 gamerule_ex MarkChanged L1694-1704；2026-09-02 TODO 批3 拆分）。
    phaseJieshuBegin(event, player) {
        if (event.player !== player) return;
        // 只有当前结束阶段角色自然衰减；星启和契约为常驻祝福，不自然衰减。
        for (const abnormal of ABNORMALS)
            lib.bts.api.removeAbnormal(player, abnormal, 1);
        for (const bless of BLESSES) {
            if (!['god', 'yingzi'].includes(bless))
                lib.bts.api.removeBless(player, bless, 1);
        }
    },
    phaseAfter(event, player) {
        if (event.player !== player) return;
        clearSuffixMarks(player, '-clear');
        // 额外回合改为由技能直接 insertPhase（extraTurn）插入，
        // 不再依赖回合末遍历标记结算。
    },
    // 不死祝福（防止濒死）已拆到 bts_bless_busi 标记技能（2026-09-02 TODO 批3 拆分）。
};

function filter(event, player) {
    if (event.player === player || event.source === player) return true;
    return event.name.startsWith('phase');
}

// 残梦封锁器：经 player.addSkillBlocker('bts_canmeng_blocker') 挂载，
// getSkills/hasSkill 通过 get.is.blocked 将其排除，实现源版 Qingcheng 标记的技能失效。
// 放行残梦本体、蚀与收尾 finisher（finisher 若被屏蔽则残梦无法解除封锁 —— 已补白名单；
// 蚀为独立子技能，非「并入 content 内联循环」，原注释有误已更正）。
export const bts_canmeng_blocker = {
    skillBlocker(skill) {
        return !['bts_st_canmeng', 'bts_st_canmeng_dis', 'bts_st_canmeng_finisher'].includes(skill);
    },
};

export const bts_gamerule_ex = {
    trigger: { global: Object.keys(HANDLERS) },
    priority: 9,
    charlotte: true,
    silent: true,
    popup: false,
    filter,
    // 无名杀引擎约定：content(event=技能事件, trigger=触发事件, player=拥有者)。
    // 规则结算全部面向触发事件（trigger），技能事件自身不携带结算字段。
    // 只引用全局（lib.bts.dispatch / lib.bts.rules），不引用包级变量（对齐叁岛规范）。
    async content(event, trigger, player) {
        await lib.bts.dispatch(trigger, player);
        await lib.bts.rules.dispatchEvent(trigger.name, trigger, player);
    },
};
