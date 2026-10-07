// 克拉拉（源 animal.lua L4035-4126）—— 约定必杀技标记、复仇准备阶段追击、家人变形史瓦罗反击。
// 史瓦罗（shiwaluo）非真实变形态、仅为换肤；其「驱逐」技能应归克拉拉。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
import { extensionPath } from '../../../../tool/utils/paths.js';

export const sort = 'yaliluo';
export const title = '物理·毁灭·与机械为伴'; // 属性·命途
export const intro =
    `${B('克拉拉')}是反击型：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_yueding'))}积攒标记，${B(get.poptip('bts_sk_fuchou'))}准备阶段弃【杀】追击，${B(get.poptip('bts_sk_jiaren'))}受伤时召唤${get.poptip('bts_ch_shiwaluo')}反击。` +
    `<li>${get.poptip('bts_ch_shiwaluo')}形态的【杀】会附加${get.poptip('bts_glossary_abnormal_scary_faq')}`;

export const character = {
    bts_ch_kelala: {
        sex: 'female',
        group: 'yaliluo',
        hp: 4,
        skills: ['bts_sk_yueding', 'bts_sk_fuchou', 'bts_sk_jiaren'],
    },
};

// 替代形态注册：史瓦罗为克拉拉的 substitute/换形
export const characterSubstitute = {
    bts_ch_kelala: [['bts_ch_shiwaluo', [`img:${extensionPath}/image/character/bts_ch_shiwaluo.png`]]],
};

export const skill = {
    // ── 必杀技·约定（源 st_yueding = ZeroCardViewAsSkill target_fixed，L4036-4052）──
    bts_sk_yueding: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 4);
        },
        async content(event, trigger, player) {
            lib.bts.api.loseAngry(player, 4);
            player.addSkill("bts_sk_yueding_buff");
            player.setStorage('bts_sk_yueding_buff', lib.bts.api.god(player) ? 3 : 2);
        },
        subSkill: {
            buff: {
                mark: true,
                marktext: "约",
                intro: {
                    name: "约定",
                    content: (storage, player, skill) => {
                        if (player.isTempBanned("bts_sk_yueding")) return "技能封禁中";
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
                    // useCardToPlayered 步骤事件的 directHit 复制自 useCard 事件同一数组（本体已转数组），
                    // 故 getParent().directHit 已是数组、直接 add 即可。
                    trigger.getParent().directHit.add(trigger.target);
                    let count = player.getStorage('bts_sk_yueding_buff', 1);
                    player.setStorage('bts_sk_yueding_buff', --count);
                    if (count <= 0) {
                        player.removeSkill("bts_sk_yueding_buff");
                    }
                },
                ai: {
                    threaten: 1.8,
                    // 消费方：引擎杀相关 AI（card/standard.js 读取 directHit_ai，参数 {target, card}）——
                    // 约定生效期间克拉拉使用的【杀】不可被响应；对照引擎标准（贯石斧 card/standard.js:3942）：
                    // 须带 {card,target} 且为敌向【杀】（源 max_yueding L4036-4052）
                    directHit_ai: true,
                    skillTagFilter(player, tag, arg) {
                        if (!arg?.card || arg.card.name !== 'sha' || !arg.target) return false;
                        return get.attitude(player, arg.target) < 0;
                    },
                },
                sub: true,
                sourceSkill: "bts_sk_yueding",
            },
        },
        ai: {
            // ai-guard: skip：content 为「失怒→加标记」直落、无内层选择，怒气门槛保证不会重复空转（§8 豁免）。
            // AI 口径：4怒换2次（星启3次）不可被响应的【杀】；手上已有【杀】则当回合即兑现
            //（源 max_yueding L4036-4052；源 AI StarRail-ai.lua：估值9、优先级≈Slash+0.45）
            order(item, player) {
                const times = lib.bts.api.god(player) ? 3 : 2; // 强制命中次数（星启+1）
                let v = times === 3 ? 8 : 7; // 每次必中≈+1.2 期望伤害，量级对齐源 AI 估值9
                if (player.getCards('h').some((c) => get.name(c) === 'sha')) v += 1; // 有杀可立即兑现
                return Math.min(9, v);
            },
            result: { player: 1 },
        },
    },

    // ── 复仇（源 st_fuchou = OneCardViewAsSkill + EventPhaseStart，L4053-4089）──
    bts_sk_fuchou: {
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
                // AI 口径（cost 型触发技：发动与否由本处 ai1/ai2 决定，最高分≤0→取消）：
                // ai1=弃估值最低的【杀】；ai2=对敌施压——目标各选①弃1牌或②受1伤并-1恐惧。
                // 按实际牌数判定：无牌可弃者必走伤害分支、收益最稳；带恐惧者不能弃牌（必受伤）但会被
                // 扣1层恐惧（己方损失，抵减）。友方取值为负→不会入选（源 st_fuchou L4053-4089）
                ai1: (card) => 6 - get.value(card),
                ai2: (target) => {
                    let v = get.effect(target, { name: 'damage' }, player, player);
                    if (get.attitude(player, target) < 0) {
                        if (target.countCards('h') + target.countCards('e') === 0) v += 0.4; // 无牌可弃：必受伤
                        if (lib.bts.api.getAbnor(target, 'scary')) v -= 0.4; // 必受伤但损失1层恐惧
                    }
                    return v;
                },
            }).forResult();
        },
        async content(event, trigger, player) {
            if (event.cards) await player.discard(event.cards);

            const targets = lib.bts.api.seatOrder(event.targets);
            for (const target of targets) {
                // 被复仇者视角 AI：弃1牌 vs 承伤（伤害分支另移除1层恐惧）。血线≥2 且带恐惧者宁可承伤
                //（顺带除恐惧层，且恐惧期间本不可弃牌）；桃不弃（源 AI @st_fuchou-discard 跳过 Peach）；
                // 其余按实际牌数放宽容忍：该区仅剩1张时更保守（源 st_fuchou L4053-4089）
                const result = await target.chooseCard('hes', `被${get.translation(player)}选为了「复仇」目标`, `弃置1张牌，或者选择取消，受到1点伤害并移除1层${get.poptip('bts_glossary_abnormal_scary_faq')}`).set("ai", card => {
                    if (target.hp >= 2 && lib.bts.api.getAbnor(target, 'scary')) return -1;
                    if (get.name(card) === 'tao') return -1;
                    const spare = get.position(card) === 'e' ? target.countCards('e') : target.countCards('h');
                    return (spare > 1 ? 7 : 5) - get.value(card);
                }).forResult();
                if (result.bool && result.cards.length > 0) {
                    await target.discard(result.cards, player);
                } else {
                    const damage = target.damage(player, 1, 'nocard');
                    damage.reason = 'bts_sk_fuchou';
                    await damage;
                    if (lib.bts.api.getAbnor(target, 'scary')) {
                        lib.bts.api.removeAbnormal(target, 'scary', 1, player);
                    }
                }
            }
        },
    },

    // ── 锁定技·家人（源 st_jiaren = TriggerSkill Compulsory DamageInflicted，L4090-4097）──
    bts_sk_jiaren: {
        forced: true,
        trigger: { player: 'damageEnd' },
        filter(event, player) {
            return event.source && event.num > 0 && player.canUse({ name: 'sha', isCard: true }, event.source);
        },
        async content(event, trigger, player) {
            // 变形史瓦罗反击：视为对来源使用【杀】并附加恐惧（源 changeHero→ViewAsCardOnly→changeHero）
            player.changeSkin(event.name, "bts_ch_shiwaluo");
            const use = player.useCard(
                { name: 'sha', isCard: true },
                trigger.source,
            );
            await use;
            lib.bts.api.addAbnormal(trigger.source, 'scary', 1, player);
            player.changeSkin(event.name, "bts_ch_kelala");
        },
        ai: {
            // 消费方：引擎卖血/承伤类 AI（diy/skill.js 无参读 maixie_defend）——无参即认可反击威慑；
            // 带参 {player} 时须真能对被指来源使用【杀】。声明必配 skillTagFilter（规范 §3）
            maixie_defend: true,
            skillTagFilter(player, tag, arg) {
                if (tag !== 'maixie_defend') return false;
                const from = arg?.player;
                return !from || player.canUse({ name: 'sha', isCard: true }, from);
            },
            effect: {
                // 他方用牌估值修正：克拉拉受伤即视为对来源出【杀】反击——把反击折算回用牌者成本；
                // 来源带 jueqing（伤害视作体力流失）时不产生 damage 事件、反击落空，按口径修正
                //（递归保护 effLock 见 precontent.js；源 st_jiaren L4090-4097）
                target: (card, player, target) => {
                    if (player.hasSkillTag("jueqing", false, target)) {
                        return [1, -1];
                    }
                    if (!lib.bts.runtime.effLock['bts_sk_jiaren']) {
                        if (!target.canUse({ name: 'sha', isCard: true }, player)) return;
                        lib.bts.runtime.effLock['bts_sk_jiaren'] = true;
                        const divAtt = Math.abs(get.attitude(player, target)) || 5; // || 5 防除零：attitude 可为 0
                        const eff = get.effect(player, { name: 'sha', isCard: true }, target, player) / divAtt;
                        delete lib.bts.runtime.effLock['bts_sk_jiaren'];
                        return [1, 0, 1, eff];
                    }
                },
            },
        },
    },

    // ── 驱逐（源 st_quzhu = TriggerSkill Compulsory TargetSpecified，L4098-4112；史瓦罗）——无名杀无需「变形后使用」，暂未注册（翻译条目已备）。
    // bts_sk_quzhu: {
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
    bts_ch_kelala: '克拉拉',
    bts_ch_shiwaluo: '史瓦罗',
    bts_sk_yueding: '约定',
    bts_sk_yueding_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}，之后两次使用【杀】不能被响应（若你为${get.poptip('bts_glossary_xingqi_faq')}则改为三次）`,
    bts_sk_fuchou: '复仇',
    bts_sk_fuchou_info: `准备阶段开始时，你可以弃置一张【杀】并选择至少一名其他角色，这些角色各选择一项：1.弃置一张牌；2.受到由你造成的1点伤害并移除1层${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_sk_jiaren: '家人',
    bts_sk_jiaren_info: `锁定技，当你受到伤害时，视为对来源使用【杀】并令其附加1层${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_sk_quzhu: '驱逐',
    bts_sk_quzhu_info: `锁定技，当你使用【杀】指定目标后，令目标附加1层${get.poptip('bts_glossary_abnormal_scary_faq')}`,

    '$bts_sk_yueding1': "我也想保护大家…",
    '$bts_sk_yueding2': "帮帮我，史瓦罗先生！",
    '$bts_sk_fuchou1': "躲起来",
    '$bts_sk_fuchou2': "歼灭开始",
    '$bts_sk_jiaren1': "离开克拉拉",
    '$bts_sk_jiaren2': "命令执行",
    '~bts_ch_kelala': "大家…还好么……",
};

export const simpleTranslate = {
    bts_sk_yueding_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，-4${get.poptip('bts_glossary_nuqi_faq')}，后2次用杀不能被响应（${get.poptip('bts_glossary_xingqi_faq')}3次）`,
    bts_sk_fuchou_info: `准备阶段，弃1杀令≥1名其他角色选择：①-1牌；②受1伤，-1${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_sk_jiaren_info: `锁；受伤时，对来源用杀并令其+1${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_sk_quzhu_info: `锁；用杀指定目标后令其+1${get.poptip('bts_glossary_abnormal_scary_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音