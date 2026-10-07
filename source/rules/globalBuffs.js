// 崩铁杀全局 buff 定义（构建器见 rules/markRegistry.js）。
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
                // 空 reason（本体/其他扩展伤害）不豁免——性质升级祝福对普通伤害同样生效
                //（源 ConfirmDamage L1126-1134 无 _common 排除，定夺回退）；仅显式 _bts_reason_common 豁免。
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
                // 空 reason（本体/其他扩展伤害）不豁免——性质升级祝福对普通伤害同样生效
                //（源 ConfirmDamage L1126-1134 无 _common 排除，定夺回退）；仅显式 _bts_reason_common 豁免。
                !event.reason?.includes('_bts_reason_common')
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.markDamage(trigger, '_through');
        },
        // 「破防具」（定夺：持贯通祝福 = 青釭剑式无视防具，范围仅祝福持有者）。
        // 四向契约（《AI设计规范》§3）：行动端 gameplay=`unequip`（防具 filter：仁王盾/藤甲/八卦阵…），
        // 行动端 AI=`unequip_ai`（防具 AI effect 与杀/武器估值）；两查询均带参数 {name, target, card}。
        // skillTagFilter 必填——带对象参数而无过滤器时引擎会告警；两 tag 无条件放行（祝福对所有来源生效）。
        ai: {
            unequip: true,
            unequip_ai: true,
            skillTagFilter(player, tag) {
                return tag === 'unequip' || tag === 'unequip_ai';
            },
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
                // 空 reason（本体/其他扩展伤害）不豁免——性质升级祝福对普通伤害同样生效
                //（源 ConfirmDamage L1126-1134 无 _common 排除，定夺回退）；仅显式 _bts_reason_common 豁免。
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
        // 触发仅 dying（防死）。归零→濒死不在此监听：层数归零时本技能已被 content.js 生命周期
        // removeSkill 卸载（收不到自身 bts_mark_remove），改在 utils.js removeBless 的 busi 钩子统一
        // 结算（源 MarkChanged L570-571，覆盖衰减/倏忽等全部移除路径）。
        trigger: { player: 'dying' },
        forced: true,
        silent: true,
        filter(event, player) {
            // 源 EnterDying（L1457-1459）仅在有层数时阻断濒死；归零濒死（removeBless 钩子）层数已为 0，不拦截。
            return (
                event.player === player &&
                player.hp < 1 &&
                lib.bts.api.getBless(player, 'busi')
            );
        },
        async content(event, trigger, player) {
            // 「防止濒死」范式：不 cancel 濒死事件（否则结算不完、_status.dying 不清），而设
            // trigger.nodying（dying step1/2 查 event.nodying，content.js L11752/11785）——
            // 濒死正常收尾且不回复体力（源 EnterDying return true）。同范式：baie 燔世还原、wandi 登神。
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
        // 星启祝福：层数供星启来源判断（utils.js god()），设为仅记录标记（mark:false）。
        // 不设 permanent：随结束阶段自然衰减（定夺；忠于源 Player_Finish）；主公星启走 isZhu 常驻，
        // 归零时 syncMarkSources 撤 skill 来源、仅留 zhu。
        mark: false,
    },
    bts_bless_yingzi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_yingzi_faq',
        // 契约祝福随结束阶段自然衰减（源 L13868；定夺）。
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
                // 须补 isAlive()：源 L1707 遍历 room:getAlivePlayers()，game.filterPlayer 含阵亡角色。
                n += game.filterPlayer(
                    (p) => p.hasSkill('bts_sk_shengji') && p.isAlive(),
                ).length;
            // 源 L1577：RecoverStruct(nil) 无来源——须 nosource，否则 source=持有者会再触发
            // 娜塔莎·生机 recoverBegin 造成双倍回复（源 recover.who=nil → 生机 filter 恒 false）。
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
                // 源 L1085-1086：使用 SkillCard 且技能名含 "max_"（必杀技）；以 bts_bisha 标签判定（勿子串匹配）。
                return (
                    event.player === player &&
                    lib.skill[event.skill]?.bts_bisha === true
                );
            }
            // 源 L1103：damage.reason 含 "max_"（必杀技含 _common 通常伤害如乖离）；以 isBishaReason 判定。
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
                // 源 L1155-1158：cifu 无 _common 排除，无属性技能杀持赐福照样转虚数（定夺回退源版）。
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
        ai: {
            // AI 口径：手牌视为【决斗】；每次使用【决斗】失去1点体力（源 PreCardUsed L996-1000）。
            // 本体【决斗】ai.basic.order=5（card/standard.js）——多付1点体力、但可用任意手牌转攻，量级略降；
            // 1血禁用（失体即濒死），2血保守。viewAs 无独立 content，空选由引擎 _aiexclude 兜底。
            // ai-guard: skip
            order(item, player) {
                if (player.hp <= 1) return -1;
                return player.hp >= 3 ? 4 : 2;
            },
            result: { player: 1 },
        },
        // 使用【决斗】时失去1点体力（源 PreCardUsed L996-1000）。
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
                // 抵扣后广播 bts_shield_removed；「特权」（三月七）等由自身技能监听结算
                //（源 RemoveShield 后 findPlayersBySkillName("st_tequan")）。
                await lib.bts.api.emit('bts_shield_removed', {
                    player,
                    source: trigger.source || null,
                    absorbed,
                });
            }
        },
        // AI 估值协议：护盾=可抵扣伤害的资源——供杀/决斗等伤害类卡牌 AI 读 `filterDamage`
        //（本体 card/standard.js sha result.target 等；白银狮子 filterDamage 范式）。
        // 带参时排除打穿护盾的情形：攻击方持贯通祝福（trigger 的 '_through' 豁免同义）或带 jueqing。
        ai: {
            filterDamage: true,
            skillTagFilter(player, tag, arg) {
                if (tag !== 'filterDamage') return false;
                if (lib.bts.api.getShield(player) <= 0) return false;
                const from = arg?.player;
                if (
                    from &&
                    (from.hasSkillTag('jueqing', false, player) ||
                        lib.bts.api.getBless(from, 'through'))
                )
                    return false;
                return true;
            },
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
            // 源 gamerule_pro L1787：非技能牌禁止。以 cardEnabled 实现（同睡眠/冻结/石化范式）：
            // 非技能牌无合法目标 → 无法使用，仅技能牌可用。
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
    bts_bless_fatal_info: `来源：${get.poptip('bts_sk_moshu')}、${get.poptip('bts_sk_tongxing')}、${get.poptip('bts_sk_zansong')}、${get.poptip('bts_sk_tianhe')}、${get.poptip('bts_sk_guanyun')}、${get.poptip('bts_sk_youyu')}赋予；伤害视为${get.poptip('bts_glossary_bless_fatal_faq')}（受伤者无法回复${get.poptip('bts_glossary_nuqi_faq')}）；回合结束自然减少1层`,
    bts_bless_through: '贯通祝福',
    bts_bless_through_info: `来源：${get.poptip('bts_sk_yaoduan')}、${get.poptip('bts_sk_pishi')}、${get.poptip('bts_sk_liwu')}、${get.poptip('bts_sk_shengjian')}、${get.poptip('bts_sk_cunqiang')}、${get.poptip('bts_sk_xingqu')}赋予；伤害无视${get.poptip('bts_glossary_hudun_faq')}；你无视其他角色的防具；回合结束自然减少1层`,
    bts_bless_critical: '暴击祝福',
    bts_bless_critical_info: `来源：${get.poptip('bts_sk_zansong')}、${get.poptip('bts_sk_guanyun')}、${get.poptip('bts_sk_liwu')}、${get.poptip('bts_sk_enci')}赋予；伤害视为${get.poptip('bts_glossary_bless_critical_faq')}；回合结束自然减少1层`,
    bts_bless_busi: '不死祝福',
    // 不含「无悔」：新版源 st_wuhui 不再授予不死祝福（V2.2 重做血仇路线；L8079-8092/L14274）。
    bts_bless_busi_info: `来源：${get.poptip('bts_sk_jiejin')}、${get.poptip('bts_sk_shuhu')}赋予；防止濒死；归零且体力<1时立即濒死；回合结束自然减少1层`,
    bts_bless_maxhp: '体力上限祝福',
    bts_bless_maxhp_info: `来源：${get.poptip('bts_glossary_xuechou_faq')}、${get.poptip('bts_sk_yushi')}、${get.poptip('bts_sk_chenhun')}赋予；每层+1${get.poptip('bts_glossary_bless_maxhp_faq')}（${get.poptip('bts_glossary_bless_yuguotianqing_faq')}时翻倍）；回合结束自然减少1层`,
    bts_bless_god: '星启祝福',
    bts_bless_god_info: `来源：${get.poptip('bts_sk_tianque')}、${get.poptip('bts_sk_xingchen')}赋予；视为处于${get.poptip('bts_glossary_xingqi_faq')}状态；回合结束自然减少1层`,
    bts_bless_yingzi: '契约祝福',
    bts_bless_yingzi_info: `来源：${get.poptip('bts_sk_shengju')}、${get.poptip('bts_sk_sibao')}赋予；额定摸牌+1；回合结束自然减少1层`,
    bts_bless_zhiyu: '治愈祝福',
    bts_bless_zhiyu_info: `来源：${get.poptip('bts_sk_jingyan')}、${get.poptip('bts_sk_xinsheng')}、${get.poptip('bts_sk_jiuhu')}赋予；准备阶段回复1；回合结束自然减少1层`,
    bts_bless_zengfu: '增幅祝福',
    bts_bless_zengfu_info: `来源：${get.poptip('bts_sk_yuewang')}、${get.poptip('bts_glossary_abnormal_luandie_faq')}、${get.poptip('bts_sk_zaixian')}赋予；${get.poptip('bts_glossary_bisha_faq')}伤害+1，用后摸牌；回合结束自然减少1层`,
    bts_bless_cifu: '赐福祝福',
    bts_bless_cifu_info: `来源：${get.poptip('bts_sk_qizha')}、${get.poptip('bts_sk_heyun')}赋予；无属性杀→虚数；回合结束自然减少1层`,
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
    bts_abnormal_st_luoxuan_info: `来源：${get.poptip('bts_sk_luoxuan')}赋予；拥有期间所有角色不是你使用牌的合法目标（只能使用技能牌）；出牌阶段结束时移除全部`,
    bts_curse: '诅咒',
    bts_curse_info: '来源：技能赋予；受到伤害时伤害+诅咒层数，并清空诅咒',
    bts_shield: '护盾',
    bts_shield_info: `来源：技能赋予；每点${get.poptip('bts_glossary_hudun_faq')}抵挡1点伤害；${get.poptip('bts_glossary_guantong_faq')}伤害无视${get.poptip('bts_glossary_hudun_faq')}`,
    bts_bless_funny: '欢愉祝福',
    bts_bless_funny_info: '来源：补缀、欢愉时刻赋予；每层使欢愉成功判定+10%；回合结束自然减少1层',
};
