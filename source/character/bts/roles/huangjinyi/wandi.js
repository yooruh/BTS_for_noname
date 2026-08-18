// 万敌（源 animal.lua L7558-7700）—— 血仇阈值、登神与濒死回收。
// 技能：诛天（必杀技·血仇+回复）、无悔（出牌开始不死祝福+失体+跳弃牌）、血仇（扣血积累/登神/反击）、登神（濒死回收）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'huangjinyi';
export const title = '虚数·毁灭·黄金裔的角斗士'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('万敌')}用无悔换${get.poptip('bts_glossary_xuechou_faq')}，攒满就登神，回头反打伤你的目标。`;

export const character = {
    bts_wandi: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_zhutian', 'bts_st_wuhui', 'bts_st_xuechou'],
    },
};

export const skill = {
    // ── 必杀技·诛天（源 st_zhutian = SkillCard + ZeroCardViewAsSkill，L7559-7579）──
    // 出牌阶段，失5怒气，获得2枚血仇标记；若受伤，回复已损失体力的一半。
    bts_st_zhutian: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L7577）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_zhutian');
            lib.bts.api.loseAngry(player, 5); // 源 L7563：LoseAngry(player, 5)
            player.addMark('bts_xuechou', 2); // 源 L7564：addPlayerMark(@st_xuechou, 2)
            // 源 L7565-7567：受伤时回复已损失体力的一半（源为浮点除法，无名杀向下取整）
            const lost = Math.max(0, player.maxHp - player.hp);
            if (lost) await player.recover(player, Math.floor(lost / 2));
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_zhutian')
                    ? -1
                    : 6;
            },
            result: { player: 2 },
        },
    },

    // ── 锁定技·无悔（源 st_wuhui = TriggerSkill Compulsory EventPhaseStart Play，L7581-7594）──
    // 出牌阶段开始时，附加1层不死祝福，失去2点体力并跳过弃牌阶段。
    bts_st_wuhui: {
        trigger: { player: 'phaseUseBegin' },
        forced: true,
        async content(event, trigger, player) {
            // 源 L7588：AddBless(player, "@bless_busi")
            await lib.bts.api.addBless(player, 'busi', 1, player);
            // 源 L7589：room:loseHp(player, 2)
            await player.loseHp(2);
            // 源 L7590：player:skip(Player_Discard)
            player.skip('phaseDiscard');
        },
        ai: { noe: true },
    },

    // ── 锁定技·血仇（源 st_xuechou = TriggerSkill Compulsory HpChanged，L7596-7639）──
    // 扣减体力后获得等量血仇；达到体力上限时：未登神则首次获得等量体力上限祝福并登神，
    // 已登神则对所有最近伤害关联目标造成暴击伤害（数值=体力上限祝福层数）。
    bts_st_xuechou: {
        trigger: { player: ['damageEnd', 'loseHpEnd'] },
        forced: true,
        filter(event) {
            return event.num > 0; // 源 L7612：x（扣减量）> 0 才积累
        },
        async content(event, trigger, player) {
            // 源 L7613：player:gainMark("@st_xuechou", x)（trigger=伤害/失血事件）
            player.addMark('bts_xuechou', trigger.num);
            // 源 L7614：血仇 ≥ 体力上限 才结算
            if (player.countMark('bts_xuechou') < player.maxHp) return;
            // 源 L7615：清空血仇
            player.removeMark('bts_xuechou', player.countMark('bts_xuechou'));
            if (!player.hasSkill('bts_st_dengshen')) {
                // 源 L7629-7633：未登神 → 附加 x 层体力上限祝福、回复 x 点体力、获得登神
                await lib.bts.api.addBless(player, 'maxhp', player.maxHp, player);
                await player.addSkill('bts_st_dengshen');
                await player.recover(player, player.maxHp);
            } else {
                // 源 L7616-7627：已登神 → 对所有 LastDamagedLink 目标造成
                // "_critical" 伤害（数值 = maxhp 祝福层数）；
                // LastDamagedLink 记在被伤者（万敌）上、键=来源（L1270：damage.to 加
                // "LastDamagedLink"+damage.from），故目标=「伤过万敌的人」。用引擎 damage
                // 历史取所有伤害来源（.source）替代（参照 ren.js 同款；原实现误用
                // sourceDamage 打成「万敌打过的目标」，已修正方向反转）。
                const damaged = new Set(
                    player
                        .getAllHistory('damage')
                        .map((event) => event.source)
                        .filter(Boolean)
                        .map((target) => target.playerid),
                );
                for (const target of game.filterPlayer((target) =>
                    damaged.has(target.playerid),
                )) {
                    const damage = target.damage(
                        player,
                        lib.bts.api.getBless(player, 'maxhp', -1) || 1,
                        'nocard',
                    );
                    damage.reason = 'bts_st_xuechou_critical';
                    await damage;
                    // 源 L7623-7625：拥有爱诗时，登神造成伤害后获得等同体力上限祝福数的血仇标记（『纷争』诗）
                    if (player.hasSkill('bts_st_aishi'))
                        player.addMark(
                            'bts_xuechou',
                            lib.bts.api.getBless(player, 'maxhp', -1) || 1,
                        );
                }
            }
        },
        ai: { noe: true },
    },

    // ── 锁定技·登神（源 st_dengshen = TriggerSkill Compulsory MarkChanged(@angry/@st_xuechou)/EnterDying，L7641-7698）──
    // 登神期间：怒气势≥5自动触发诛天；血仇标记变化时管理私有牌堆（手牌入池/低血弃池回复）；
    // 进入濒死时回复半额体力、移除体力上限祝福、收回血仇牌堆并退出登神、避免真正死亡（多阶段濒死）。
    // 注：参照无名杀陈寿的专属牌堆实现——用 game.cardsGotoSpecial 将手牌物理移入置旁牌堆，
    // 由 player.storage.st_xuechou_pile（卡牌对象）记录归属，进场时 player.gain 回收回手牌。
    bts_st_dengshen: {
        charlotte: true,
        trigger: { player: ['dying', 'addMark', 'removeMark'] },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'dying') return true;
            return ['bts_xuechou', 'bts_angry'].includes(event.markName);
        },
        async content(event, trigger, player) {
            if (event.triggername === 'dying') {
                // 源 L7687：recover(maxHp/2)
                await player.recover(player, Math.ceil(player.maxHp / 2));
                // 源 L7688：RemoveBless(@bless_maxhp, -1)
                await lib.bts.api.removeBless(player, 'maxhp', -1, player);
                // 源 L7690-7693：收回血仇牌堆（私有牌池）回手牌
                const pool = player.storage.st_xuechou_pile || [];
                if (pool.length) {
                    player.storage.st_xuechou_pile = [];
                    await player.gain(pool, 'gain2');
                }
                player.removeMark('bts_xuechou', player.countMark('bts_xuechou'));
                // 源 L7685：退出登神
                await player.removeSkill('bts_st_dengshen');
                // 源 L7683 EnterDying return true → 阻断本次濒死结算（多阶段濒死）
                trigger.cancel();
                return;
            }
            if (trigger.markName === 'bts_angry') {
                // 源 L7649-7662：登神期间怒气≥5 → 自动触发诛天
                if (player.countMark('bts_angry') >= 5) {
                    lib.bts.api.loseAngry(player, 5);
                    player.addMark('bts_xuechou', 2);
                    const lost = Math.max(0, player.maxHp - player.hp);
                    if (lost) await player.recover(player, Math.floor(lost / 2));
                }
                return;
            }
            // trigger.markName === 'bts_xuechou'：私有牌堆管理（源 L7664-7681）
            if (player.hp > 0) {
                // 手牌移入血仇牌堆（参照陈寿专属牌堆：game.cardsGotoSpecial 置旁；登神时 gain 回收）
                const hands = player.getCards('h');
                if (hands.length) {
                    player.storage.st_xuechou_pile = (
                        player.storage.st_xuechou_pile || []
                    ).concat(hands);
                    await game.cardsGotoSpecial(hands);
                }
            } else if (
                player.hp <= 0 &&
                (player.storage.st_xuechou_pile || []).length >= player.maxHp - player.hp
            ) {
                // 血仇牌堆够大 → 弃置 (maxHp-hp) 张并回复等量
                const need = player.maxHp - player.hp;
                await player.lose(
                    (player.storage.st_xuechou_pile || []).splice(0, need),
                );
                await player.recover(player, need);
            }
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_wandi: '万敌',
    bts_st_zhutian: '诛天',
    bts_st_zhutian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，获得2枚${get.poptip('bts_glossary_xuechou_faq')}标记并回复已损失体力的一半。`,
    bts_st_wuhui: '无悔',
    bts_st_wuhui_info: `锁定技，出牌阶段开始时，你附加1层${get.poptip('bts_glossary_bless_busi_faq')}，失去2点体力并跳过弃牌阶段。`,
    bts_st_xuechou: '血仇',
    bts_st_xuechou_info: `锁定技，扣减体力后获得等量${get.poptip('bts_glossary_xuechou_faq')}；达到${get.poptip('bts_glossary_bless_maxhp_faq')}时，首次获得等量${get.poptip('bts_glossary_bless_maxhp_faq')}并登神，之后对最近伤害关联目标造成${get.poptip('bts_glossary_bless_critical_faq')}伤害；若你拥有${get.poptip('bts_st_aishi')}，登神造成伤害后获得等同${get.poptip('bts_glossary_bless_maxhp_faq')}数的${get.poptip('bts_glossary_xuechou_faq')}标记。`,
    bts_st_dengshen: '登神',
    bts_st_dengshen_info: `锁定技，登神期间你的手牌移入血仇牌堆、怒气达到5时自动发动诛天；当你于登神期间进入濒死状态时，回复${get.poptip('bts_glossary_bless_maxhp_faq')}半额体力、收回血仇牌堆、移除${get.poptip('bts_glossary_bless_maxhp_faq')}并退出登神（避免死亡）。`,

    '$bts_st_zhutian1': "垂死之魂，直面我！",
    '$bts_st_zhutian2': "我允许你们…伏首受诛！",
    '$bts_st_wuhui1': "玉石，俱焚！",
    '$bts_st_wuhui2': "万劫，不复！",
    '$bts_st_xuechou1': "赐你天谴！",
    '$bts_st_xuechou2': "荡平万邦！",
    '$bts_st_dengshen1': "流淌吧，悬锋之血！",
    '$bts_st_dengshen2': "怒吼吧，吾即纷争",
    '~bts_wandi': "结…束了……",
};

export const simpleTranslate = {
    bts_st_zhutian_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+2${get.poptip('bts_glossary_xuechou_faq')}并回复已损失体力一半`,
    bts_st_wuhui_info: `锁；出牌开始+${get.poptip('bts_glossary_bless_busi_faq')}、失2体力、跳弃牌`,
    bts_st_xuechou_info: `锁；扣血+${get.poptip('bts_glossary_xuechou_faq')}，满上限后登神并反击伤害关联目标`,
};

export const pinyins = { bts_wandi: 'wandi' };
