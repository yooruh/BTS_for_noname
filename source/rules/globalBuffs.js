// 崩铁杀全局 buff 定义（阶段2 迁自 rules/buffs.js；buildMarkSkill 已迁 rules/markRegistry.js）。
// 内容层：只放定义（markKind/glossaryId/permanent 标签 + 效果字段），显示文本一律进 translate。
// 由 character/bts/index.js 合并 { 全局, ...roles.merge('buffSkills') } → buildMarkSkill 烘焙。
import { lib, game, get } from '../../../../noname.js';

export const buffSkills = {
    bts_bless_fatal: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_fatal_faq',
        trigger: { source: 'damageBegin1' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                event.num > 0 &&
                // 无 reason（无名杀本体/其他扩展伤害）按源 getReason() 语义视为非 common（≈卡名）：
                // 性质升级祝福对普通伤害同样生效（源 ConfirmDamage L1126-1134 无 _common 排除；
                // 用户定夺 2026-09-12 回退），仅显式 _bts_reason_common 豁免。
                !event.reason?.includes('_bts_reason_common')
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.markDamage(trigger, '_fatal');
        },
    },
    bts_bless_through: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_through_faq',
        trigger: { source: 'damageBegin1' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                event.num > 0 &&
                // 无 reason（无名杀本体/其他扩展伤害）按源 getReason() 语义视为非 common（≈卡名）：
                // 性质升级祝福对普通伤害同样生效（源 ConfirmDamage L1126-1134 无 _common 排除；
                // 用户定夺 2026-09-12 回退），仅显式 _bts_reason_common 豁免。
                !event.reason?.includes('_bts_reason_common')
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.markDamage(trigger, '_through');
        },
    },
    bts_bless_critical: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_critical_faq',
        trigger: { source: 'damageBegin1' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                event.num > 0 &&
                // 无 reason（无名杀本体/其他扩展伤害）按源 getReason() 语义视为非 common（≈卡名）：
                // 性质升级祝福对普通伤害同样生效（源 ConfirmDamage L1126-1134 无 _common 排除；
                // 用户定夺 2026-09-12 回退），仅显式 _bts_reason_common 豁免。
                !event.reason?.includes('_bts_reason_common')
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.markDamage(trigger, '_critical');
        },
    },
    bts_bless_busi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_busi_faq',
        // 触发仅 dying（防死）。归零→濒死不在此监听：bts_mark_remove 在层数归零时 busi 技能已被
        // content.js 生命周期 removeSkill 卸载（收不到自身事件），改在 utils.js removeBless 的
        // busi 钩子统一结算（源 MarkChanged animal.lua L570-571，覆盖衰减/倏忽等全部移除路径）。
        trigger: { player: 'dying' },
        forced: true,
        silent: true,
        filter(event, player) {
            // 源 EnterDying（animal.lua L1457-1459）仅在有祝福层数时阻断濒死：
            // 归零濒死（removeBless 钩子触发）时层数已为 0，不在此拦截，正常走求救流程。
            return (
                event.player === player &&
                player.hp < 1 &&
                lib.bts.api.getBless(player, 'busi')
            );
        },
        async content(event, trigger, player) {
            // 「防止濒死」范式：不 cancel 濒死事件（否则濒死未完成结算、_status.dying 不移除），
            // 而对濒死事件自身设 nodying（dying step1/step2 查 event.nodying，content.js L11752/11785），
            // 使濒死正常收尾并清除 _status.dying；不回复体力（忠于原版 EnterDying return true）。
            // 相关范式：baie.js bts_sk_fanshi_huanyuan、wandi.js bts_sk_dengshen（后者另 recover 至 hp>0）。
            trigger.nodying = true;
        },
    },
    bts_bless_maxhp: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_maxhp_faq',
        // 体力上限祝福：无标记技能效果，+上限逻辑在 utils.js addBless/removeBless
        //（读 yuguotianqing 翻倍）；此处只提供注册/名字/来源（纯展示标记）。

    },
    bts_bless_god: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_god_faq',
        // 星启祝福：层数仅供星启来源判断（utils.js god()），沉为仅记录标记（mark:false）。
        // 不设 permanent：技能星启随结束阶段自然衰减（用户定夺 2026-09-09，忠于原版 Player_Finish 衰减）；
        // 主公星启走 isZhu 分支常驻（utils.js god()），归零时 syncMarkSources 自动撤 skill 来源仅留 zhu。
        mark: false,
    },
    bts_bless_yingzi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_yingzi_faq',
        // 契约祝福随结束阶段自然衰减（原版 animal.lua L13868 每回合衰减；用户定夺 2026-09-09）。
        trigger: { player: 'phaseDrawBegin2' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.player === player && event.num > 0;
        },
        async content(event, trigger, player) {
            trigger.num += 1;
        },
    },
    bts_bless_zhiyu: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_zhiyu_faq',
        trigger: { player: 'phaseZhunbeiBegin' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.player === player;
        },
        async content(event, trigger, player) {
            let n = 1;
            if (player.hp <= 1)
                n += game.filterPlayer((p) => p.hasSkill('bts_sk_shengji')).length;
            // 源 L1577：RecoverStruct(nil) —— who=nil 无来源。须无来源回复：
            // 否则 source=持有者会再触发娜塔莎·生机 recoverBegin 造成双倍回复（源语义下
            // recover.who=nil → 生机 filter 恒 false）。recover('nosource') 令 source 保持
            // undefined，仅走 zhiyu 内置的生机加成（上面 n 的 +1），不再额外触发一次。
            await player.recover('nosource', n);
        },
    },
    bts_bless_zengfu: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_zengfu_faq',
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
    },
    bts_bless_cifu: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_cifu_faq',
        // 转换类祝福挂 damageBefore（最早钩子，先于 damageBegin1-4 与元素相克，无需 priority 魔法值；
        // firstDo 保证在其它同事件监听（如狐祈弃牌）前完成属性转换，见《技能开发规范》A13）。
        firstDo: true,
        trigger: { source: 'damageBefore' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                event.num > 0 &&
                // 源版 L1155-1158：cifu 无 _common 排除，_common 技能杀（无属性）持赐福照样转虚数
                //（2026-09-13 回退至源版）。
                event.card?.name === 'sha' &&
                !lib.bts.api.getNature(event)
            );
        },
        async content(event, trigger, player) {
            game.log(player, '触发了赐福祝福');
            lib.bts.api.setDamageNature(trigger, 'light');
        },
    },
    bts_abnormal_freeze: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_freeze_faq',
        // 冻结者造成的伤害-1（源 DamageCaused L1145-1148）；造成方减免 → damageBegin2（§十三约定）。
        trigger: { source: 'damageBegin2' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.source === player && event.num > 0;
        },
        async content(event, trigger, player) {
            trigger.num -= 1;
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
    },
    bts_abnormal_fossilize: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_fossilize_faq',
        // 石化者受到的伤害视为暴击（源 gamerule_ex damageBegin2）；性质改变类 → damageBefore（§十三约定）。
        trigger: { player: 'damageBefore' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.player === player && event.num > 0;
        },
        async content(event, trigger, player) {
            lib.bts.api.markDamage(trigger, '_critical');
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
    },
    bts_abnormal_sleep: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_sleep_faq',
        // 禁基本牌（源 gamerule_pro）+ 其他角色与你距离-1（源 gamerule_dis L1763-1772）。
        mod: {
            cardEnabled(card, player) {
                if (
                    lib.bts.api.getAbnor(player, 'sleep') &&
                    get.type(card, player) === 'basic'
                )
                    return false;
            },
            globalTo(from, to, distance) {
                if (lib.bts.api.getAbnor(to, 'sleep')) return distance - 1;
            },
        },
    },
    bts_abnormal_scary: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_scary_faq',
        // 不能弃置牌（源 AddAbnormal L490-492 setPlayerCardLimitation "discard"）。
        mod: {
            cardDiscardable(card, player) {
                if (lib.bts.api.getAbnor(player, 'scary')) return false;
            },
        },
    },
    bts_abnormal_burn: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_burn_faq',
        // 出牌阶段开始时受到1点无来源伤害（源 gamerule_ex phaseUseBegin）+ 攻击范围-1。
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
        mod: {
            attackRange(player, range) {
                if (lib.bts.api.getAbnor(player, 'burn')) return range - 1;
            },
        },
    },
    bts_abnormal_numb: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_mabi_faq',
        // 摸牌阶段开始时受到1点无来源伤害 + 额定摸牌数-1（源 gamerule_ex phaseDrawBegin/phaseDrawBegin2；
        // 揭露+中毒组合仍留在 bts_abnormal_jielu 标记技能，见其 !numb 守卫）。
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
    },
    bts_abnormal_poison: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_zhongdu_faq',
        // 弃牌阶段开始时失去1点体力（源 gamerule_ex phaseDiscardBegin L1577-1587；
        // 惊喜 st_jingxi 使失去量+1 的逻辑一并随迁）+ 手牌上限-1。
        trigger: { player: 'phaseDiscardBegin' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.player === player;
        },
        async content(event, trigger, player) {
            let n = 1;
            if (player.countMark('bts_sk_jingxi') > 0) {
                n = 2; // 惊喜标记：改为失去2点并移除（源 L1581-1584）
                player.removeMark('bts_sk_jingxi', player.countMark('bts_sk_jingxi'));
            }
            player.loseHp(n);
        },
        mod: {
            maxHandcard(player, num) {
                if (lib.bts.api.getAbnor(player, 'poison')) return num - 1;
            },
        },
    },
    bts_abnormal_confuse: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_confuse_faq',
        // 造成的伤害无效（源 DamageCaused L1196-1199 经 GetBless 判定，残梦封锁期间 GetBless 失效，
        // 故混乱不阻止伤害）。
        trigger: { source: 'damageBegin1' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                event.num > 0 &&
                !lib.skill['bts_sk_canmeng']?.util?.canmengActive?.()
            );
        },
        async content(event, trigger, player) {
            game.log(player, '因混乱，此次伤害无效');
            trigger.cancel();
        },
    },
    bts_abnormal_diyu: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_diyu_faq',
        // 手牌视为【决斗】（源 #ab_diyu animal.lua L2627-2641）；使用【决斗】失去体力
        //（源 PreCardUsed L996-1000）已并入下方 useCard 触发。
        enable: 'phaseUse',
        viewAs: { name: 'juedou', isCard: true },
        filterCard: () => true,
        selectCard: 1,
        position: 'h',
        prompt: '地狱：将一张手牌当【决斗】使用',
        ai: { order: 1, result: { player: 1 } },
        // 使用【决斗】时失去1点体力（源 PreCardUsed L996-1000；resolver useCard 迁入，2026-09-04）。
        trigger: { player: 'useCard' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.player === player && event.card?.name === 'juedou';
        },
        async content(event, trigger, player) {
            await player.loseHp(1);
        },
    },
    bts_curse: {
        markKind: 'curse',
        trigger: { player: 'damageBegin4' },
        firstDo: true,
        forced: true,
        silent: true,
        filter(event, player) {
            return event.player === player && event.num > 0;
        },
        async content(event, trigger, player) {
            const curse = lib.bts.api.getCurse(player);
            if (curse > 0) {
                trigger.num += curse;
                lib.bts.api.removeCurse(player, curse);
            }
        },
    },
    bts_shield: {
        markKind: 'shield',
        glossaryId: 'bts_glossary_hudun_faq',
        trigger: { player: 'damageBegin4' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.player === player &&
                event.num > 0 &&
                !lib.bts.api.isSpecialDamage(event, '_through')
            );
        },
        async content(event, trigger, player) {
            const shield = lib.bts.api.getShield(player);
            if (shield > 0) {
                const absorbed = Math.min(shield, trigger.num);
                trigger.num -= absorbed;
                lib.bts.api.removeShield(player, absorbed);
            }
        },
    },
    bts_bless_funny: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_funny_faq',
        // 欢愉祝福：无标记技能效果，+概率逻辑在 utils.js funnyNumber（每层 +10%）；
        // 此处只提供注册/名字/来源（纯展示标记，同 bless_maxhp）。
    },
    // 螺旋异常（Archer·螺旋）：出牌阶段内累积，出牌阶段结束时移除全部；
    // 拥有期间只能使用技能牌（源 gamerule L1685-1690 / gamerule_pro L1787）。
    bts_abnormal_st_luoxuan: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_luoxuan_faq',
        // 源 L1685-1690（gamerule EventPhaseEnd Play）：出牌阶段结束时移除全部螺旋异常。
        // phaseUseAfter 在阶段被跳过时也会触发（content.js L4495），保证清理不遗漏。
        trigger: { player: 'phaseUseAfter' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.player === player;
        },
        async content(event, trigger, player) {
            lib.bts.api.removeAbnormal(player, 'st_luoxuan', -1); // 源 RemoveAbnormal(..., -1)
        },
        mod: {
            // 源 gamerule_pro L1787：拥有螺旋异常时 `not card:isKindOf("SkillCard")` → 禁止。
            // 无名杀以 cardEnabled 实现（同睡眠禁基本牌/冻结禁装备/石化禁锦囊范式）：
            // 非技能牌（杀/锦囊/装备/基本）无合法目标 → 无法使用，仅技能牌可用。
            cardEnabled(card, player) {
                if (
                    lib.bts.api.getAbnor(player, 'st_luoxuan') &&
                    get.type(card, player) !== 'skill'
                )
                    return false;
            },
        },
    },
    // 体力上限减少异常（源 @abnormal_losemaxhp，AddAbnormal/RemoveAbnormal 分支 L516/L678）：
    // 无标记技能效果——上限增减在 utils.js addAbnormal/removeAbnormal（无名杀特化保底 1）；
    // 回合结束衰减由 bts_gamerule_decay 统一处理；此处只提供注册/名字/来源（纯展示标记）。
    bts_abnormal_losemaxhp: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_losemaxhp_faq',
    },
};

export const translate = {
    bts_bless_fatal: '致命祝福',
    bts_bless_fatal_info: '来源：魔术、同行、赞颂、天河、贯云赋予；伤害视为致命（不回怒气）；回合结束自然减少1层',
    bts_bless_through: '贯通祝福',
    bts_bless_through_info: '来源：摇缎、辟世、礼物、圣剑、寸强、行曲赋予；伤害无视护盾；回合结束自然减少1层',
    bts_bless_critical: '暴击祝福',
    bts_bless_critical_info: '来源：赞颂、贯云、礼物赋予；伤害视为暴击；回合结束自然减少1层',
    bts_bless_busi: '不死祝福',
    bts_bless_busi_info: '来源：解禁、无悔、倏忽赋予；防止濒死；归零且体力<1时立即濒死；回合结束自然减少1层',
    bts_bless_maxhp: '体力上限祝福',
    bts_bless_maxhp_info: '来源：血仇、愈世、晨昏赋予；每层+1体力上限（雨过天晴时翻倍）；回合结束自然减少1层',
    bts_bless_god: '星启祝福',
    bts_bless_god_info: '来源：天阙、星尘赋予；视为处于星启状态；回合结束自然减少1层',
    bts_bless_yingzi: '契约祝福',
    bts_bless_yingzi_info: '来源：胜局赋予；额定摸牌+1；回合结束自然减少1层',
    bts_bless_zhiyu: '治愈祝福',
    bts_bless_zhiyu_info: '来源：经验、新生、救护赋予；准备阶段回复1；回合结束自然减少1层',
    bts_bless_zengfu: '增幅祝福',
    bts_bless_zengfu_info: '来源：悦王、乱蝶、再现赋予；必杀伤害+1，用后摸牌；回合结束自然减少1层',
    bts_bless_cifu: '赐福祝福',
    bts_bless_cifu_info: '来源：七札、和韵赋予；无属性杀→虚数；回合结束自然减少1层',
    bts_abnormal_freeze: '冻结',
    bts_abnormal_fossilize: '石化',
    bts_abnormal_sleep: '睡眠',
    bts_abnormal_scary: '恐惧',
    bts_abnormal_burn: '烧伤',
    bts_abnormal_numb: '麻痹',
    bts_abnormal_poison: '中毒',
    bts_abnormal_confuse: '混乱',
    bts_abnormal_diyu: '地狱',
    bts_abnormal_losemaxhp: '体力上限减少',
    bts_abnormal_st_luoxuan: '螺旋',
    bts_abnormal_st_luoxuan_info: '来源：螺旋赋予；拥有期间所有角色不是你使用牌的合法目标（只能使用技能牌）；出牌阶段结束时移除全部',
    bts_curse: '诅咒',
    bts_curse_info: '来源：技能赋予；受到伤害时伤害+诅咒层数，并清空诅咒',
    bts_shield: '护盾',
    bts_shield_info: '来源：技能赋予；每点护盾抵挡1点伤害；贯通伤害无视护盾',
    bts_bless_funny: '欢愉祝福',
    bts_bless_funny_info: '来源：补缀、欢愉时刻赋予；每层使欢愉成功判定+10%；回合结束自然减少1层',
};
