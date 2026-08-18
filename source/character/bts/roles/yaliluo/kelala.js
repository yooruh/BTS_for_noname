// 克拉拉（源 animal.lua L4035-4126）—— 约定必杀技标记、复仇准备阶段追击、家人变形史瓦罗反击。
// 史瓦罗（shiwaluo）不是真正的克拉拉变形态，而仅仅是换了个角色皮肤而已，其驱逐技能应归于克拉拉。
import { lib, game, ui, get, ai, _status, X, Y, Z, styleText, B } from '../../shared.js';
import { extensionPath } from '../../../../tool/utils/paths.js';

export const sort = 'yaliluo';
export const title = '物理·毁灭·与机械为伴'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('克拉拉')}是反击型：${get.poptip('bts_glossary_bisha_faq')}${B('约定')}积攒标记，${B('复仇')}准备阶段弃【杀】追击，${B('家人')}受伤时召唤史瓦罗反击。` +
    `<li>史瓦罗形态的【杀】会附加${get.poptip('bts_glossary_abnormal_scary_faq')}`;

export const character = {
    bts_kelala: {
        sex: 'female',
        group: 'yaliluo',
        hp: 4,
        skills: ['bts_st_yueding', 'bts_st_fuchou', 'bts_st_jiaren'],
    },
};

// 替代形态注册：史瓦罗为克拉拉的 substitute/换形
export const characterSubstitute = {
    bts_kelala: [['bts_shiwaluo', [`img:${extensionPath}/image/character/bts_shiwaluo.png`]]],
};

export const skill = {
    // ── 必杀技·约定（源 st_yueding = ZeroCardViewAsSkill target_fixed，L4036-4052）──
    bts_st_yueding: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 4);
        },
        async content(event, trigger, player) {
            lib.bts.api.loseAngry(player, 4);
            player.addSkill("bts_st_yueding_buff");
            player.setStorage('bts_st_yueding_buff', lib.bts.api.god(player) ? 3 : 2);
        },
        subSkill: {
            buff: {
                mark: true,
                marktext: "约",
                intro: {
                    name: "约定",
                    content: (storage, player, skill) => {
                        if (player.isTempBanned("bts_st_yueding")) return "技能封禁中";
                        const num = storage === Infinity ? '∞' : storage;
                        return `使用的杀会强制命中<li>还能触发${num}次`;
                    },
                },
                forced: true,
                forceDie: true,
                popup: "约定·强杀",
                logTarget: "target",
                trigger: {
                    player: "useCardToPlayered",
                },
                filter: (event, player) => {
                    return event.card.name === "sha";
                },
                async content(event, trigger, player) {
                    trigger.getParent().directHit.add(trigger.target);
                    let count = player.getStorage('bts_st_yueding_buff', 1);
                    player.setStorage('bts_st_yueding_buff', --count);
                    if (count <= 0) {
                        player.removeSkill("bts_st_yueding_buff");
                    }
                },
                ai: {
                    threaten: 1.8,
                    "directHit_ai": true,
                    skillTagFilter(player, tag, arg) {
                        if (!arg) return false;
                        if (arg.card.name != "sha") return false;
                    },
                },
                sub: true,
                sourceSkill: "bts_st_yueding",
            },
        },
        ai: {
            order: 10,
            result: { player: 1 },
        },
    },

    // ── 复仇（源 st_fuchou = OneCardViewAsSkill + EventPhaseStart，L4053-4089）──
    bts_st_fuchou: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            return player.getCards('h').some((c) => get.name(c) === 'sha');
        },
        async cost(event, trigger, player) {
            event.result = await player.chooseCardTarget({
                position: 'hes',
                selectTarget: [1, Infinity],
                prompt: "是否发动「复仇」？弃置1张【杀】，并选择至少一名其他角色",
                prompt2: `这些角色各选择一项：<br>①弃置一张牌；<br>②受到由你造成的1点伤害并移除1层${get.poptip('bts_glossary_abnormal_scary_faq')}`,
                filterTarget: lib.filter.notMe,
                filterCard: (card) => {
                    return get.name(card, player) === 'sha';
                },
                ai2: (target) => {
                    if (get.attitude(player, target) < 0 && (target.hasSkillTag('noh') || target.hasSkillTag('noe'))) return 0;
                    const eff = get.effect(target, { name: 'damage' }, player, player);
                    return eff;
                },
            }).forResult();
        },
        async content(event, trigger, player) {
            if (event.cards) await player.discard(event.cards);

            const targets = event.targets.slice().sortBySeat(_status.event.phase);
            for (const target of targets) {
                const result = await target.chooseCard('hes', `被${get.translation(player)}选为了「复仇」目标`, `弃置1张牌，或者选择取消，受到1点伤害并移除1层${get.poptip('bts_glossary_abnormal_scary_faq')}`).set("ai", card => {
                    if (target.hp >= 2 && lib.bts.api.getAbnor(target, 'scary')) return -1;
                    if (target.countCards('e') > 0 && target.hasSkillTag('noe')) return get.position(card) === 'e';
                    if (target.countCards('h') > 0 && target.hasSkillTag('noh')) return get.position(card) === 'h';
                    return 7 - get.value(card);
                }).forResult();
                if (result.bool && result.cards.length > 0) {
                    await target.discard(result.cards, player);
                } else {
                    const damage = target.damage(player, 1, 'nocard');
                    damage.reason = 'bts_st_fuchou';
                    await damage;
                    if (lib.bts.api.getAbnor(target, 'scary')) {
                        lib.bts.api.removeAbnormal(target, 'scary', 1, player);
                    }
                }
            }
        },
    },

    // ── 锁定技·家人（源 st_jiaren = TriggerSkill Compulsory DamageInflicted，L4090-4097）──
    bts_st_jiaren: {
        forced: true,
        trigger: { player: 'damageEnd' },
        filter(event, player) {
            return event.source && event.num > 0 && player.canUse({ name: 'sha', isCard: true }, event.source);
        },
        async content(event, trigger, player) {
            // 变形史瓦罗反击：视为对来源使用【杀】并附加恐惧（源 changeHero→ViewAsCardOnly→changeHero）
            player.changeSkin(event.name, "bts_shiwaluo");
            const use = player.useCard(
                { name: 'sha', isCard: true },
                trigger.source,
            );
            await use;
            lib.bts.api.addAbnormal(trigger.source, 'scary', 1, player);
            player.changeSkin(event.name, "bts_kelala");
        },
        ai: {
            "maixie_defend": true,
            skillTagFilter(player, tag, arg) {
                if (tag === "maixie_defend") {
                    return !arg?.player || player.canUse({ name: 'sha', isCard: true }, arg?.player);
                }
            },
            effect: {
                target: (card, player, target) => {
                    if (player.hasSkillTag("jueqing", false, target)) {
                        return [1, -1];
                    }
                    if (!lib.bts.runtime.effLock['bts_st_jiaren']) {
                        if (!target.canUse({ name: 'sha', isCard: true }, player)) return;
                        lib.bts.runtime.effLock['bts_st_jiaren'] = true;
                        const divAtt = Math.abs(get.attitude(player, target)) ?? 5;
                        const eff = get.effect(player, { name: 'sha', isCard: true }, target, player) / divAtt;
                        delete lib.bts.runtime.effLock['bts_st_jiaren'];
                        return [1, 0, 1, eff];
                    }
                },
            },
        },
    },

    // ── 驱逐，无名杀不需要变形为史瓦罗后再使用，暂时废弃（源 st_quzhu = TriggerSkill Compulsory TargetSpecified，L4098-4112；史瓦罗）──
    // bts_st_quzhu: {
    //     trigger: { player: 'useCard' },
    //     forced: true,
    //     filter(event, player) {
    //         return event.card?.name === 'sha' && event.targets?.length;
    //     },
    //     async content(event, trigger, player) {
    //         for (const t of trigger.targets || [])
    //             lib.bts.api.addAbnormal(t, 'scary', 1, player);
    //     },
    //     ai: { noe: true },
    // },
};

export const translate = {
    bts_kelala: '克拉拉',
    bts_shiwaluo: '史瓦罗',
    bts_st_yueding: '约定',
    bts_st_yueding_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}，之后两次使用【杀】不能被响应（若你为${get.poptip('bts_glossary_xingqi_faq')}则改为三次）`,
    bts_st_fuchou: '复仇',
    bts_st_fuchou_info: `准备阶段开始时，你可以弃置一张【杀】并选择至少一名其他角色，这些角色各选择一项：1.弃置一张牌；2.受到由你造成的1点伤害并移除1层${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_st_jiaren: '家人',
    bts_st_jiaren_info: `锁定技，当你受到伤害时，视为对来源使用【杀】并令其附加1层${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_st_quzhu: '驱逐',
    bts_st_quzhu_info: `锁定技，当你使用【杀】指定目标后，令目标附加1层${get.poptip('bts_glossary_abnormal_scary_faq')}`,

    '$bts_st_yueding1': "我也想保护大家…",
    '$bts_st_yueding2': "帮帮我，史瓦罗先生！",
    '$bts_st_fuchou1': "躲起来",
    '$bts_st_fuchou2': "歼灭开始",
    '$bts_st_jiaren1': "离开克拉拉",
    '$bts_st_jiaren2': "命令执行",
    '~bts_kelala': "大家…还好么……",
    '~bts_shiwaluo': "大家…还好么……",
};

export const simpleTranslate = {
    bts_st_yueding_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，-4${get.poptip('bts_glossary_nuqi_faq')}，后2次用杀不能被响应（${get.poptip('bts_glossary_xingqi_faq')}3次）`,
    bts_st_fuchou_info: `准备阶段，弃1杀令≥1名其他角色选择：①-1牌；②受1伤，-1${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_st_jiaren_info: `锁；受伤时，对来源用杀并令其+1${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_st_quzhu_info: `锁；用杀指定目标后令其+1${get.poptip('bts_glossary_abnormal_scary_faq')}`,
};