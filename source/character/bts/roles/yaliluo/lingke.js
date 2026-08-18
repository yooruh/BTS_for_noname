// 玲可（源 animal.lua L3815-3907）—— 方案必杀技群体回复、经验锁定治愈、罐头弃杀摸牌回复。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'yaliluo';
export const title = '量子·丰饶·雪原探险家'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('玲可')}是后勤回复：${get.poptip('bts_glossary_bisha_faq')}${B('方案')}群体回复，${B('经验')}回复他人时附加${get.poptip('bts_glossary_bless_zhiyu_faq')}，${B('罐头')}受伤时弃【杀】补给队友并让其代为承伤。` +
    `<li>${get.poptip('bts_glossary_bless_zhiyu_faq')}在受伤时能提供额外回复`;

export const character = {
    bts_lingke: {
        sex: 'female',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_st_fangan', 'bts_st_jingyan', 'bts_st_guantou'],
    },
};

export const skill = {
    // ── 必杀技·方案（源 st_fangan = ZeroCardViewAsSkill，L3816-3834）──
    bts_st_fangan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, 2],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_fangan');
            lib.bts.api.loseAngry(player, 3);
            for (const t of event.targets || []) {
                await t.recover(player, 1);
                const marks = Object.keys(t.storage || {}).filter(
                    (k) => k.startsWith('bts_abnormal_') && t.countMark(k) > 0,
                );
                if (marks.length)
                    lib.bts.api.removeAbnormal(
                        t,
                        marks[0].slice('bts_abnormal_'.length),
                        1,
                        player,
                    );
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_fangan')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: 1 },
        },
    },

    // ── 锁定技·经验（源 st_jingyan = TriggerSkill Compulsory PreHpRecover，L3835-3853）──
    bts_st_jingyan: {
        trigger: { source: 'recoverEnd' },
        forced: true,
        filter(event, player) {
            return event.player !== player && event.num > 0;
        },
        async content(event, trigger, player) {
            await lib.bts.api.addBless(trigger.player, 'zhiyu', trigger.num, player);
        },
        ai: { noe: true },
    },

    // ── 罐头（源 st_guantou = TriggerSkill DamageInflicted + OneCardViewAsSkill，L3858-3907）：受伤时弃杀转移伤害 ──
    bts_st_guantou: {
        trigger: { player: 'damageBegin2' },
        filter(event, player) {
            return (
                event.num > 0 &&
                player.getCards('h').some((c) => get.name(c) === 'sha') &&
                game.hasPlayer(
                    (t) => t !== player && (t.isDamaged() || lib.bts.api.getShield(t)),
                )
            );
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseCardTarget({
                    prompt: '罐头：弃置一张【杀】，令一名受伤或拥有护盾的角色摸1张牌并回复1点体力',
                    position: 'h',
                    filterCard: (c) => get.name(c) === 'sha',
                    selectCard: 1,
                    filterTarget: (c, s, x) =>
                        x !== s && (x.isDamaged() || lib.bts.api.getShield(x)),
                    selectTarget: 1,
                    ai1: (c) => 6 - get.value(c),
                    ai2: (x) => get.attitude(player, x),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_guantou');
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            const target = event.targets[0]; // event=技能事件，cost 结果目标
            await target.draw(player, 1);
            await target.recover(player, 1);
            // 源 damage.to = p / transfer：目标可为你承受本次伤害（保留来源/数值/reason/属性，省略卡牌）
            const agree = await target
                .chooseBool(
                    `罐头：是否为${get.translation(player)}承受本次伤害？`,
                )
                .set(
                    'ai',
                    () =>
                        get.attitude(target, player) > 0 &&
                        target.hp > trigger.num,
                )
                .forResult();
            if (!agree.bool) return;
            trigger._btsGuantou = true;
            const d = target.damage(trigger.source, trigger.num, 'nocard');
            d.reason = trigger.reason || 'bts_st_guantou';
            if (trigger._btsNature) lib.bts.api.setDamageNature(d, trigger._btsNature);
            await d;
            trigger.cancel();
        },
        ai: { result: { player: 1 } },
    },
};

export const translate = {
    bts_lingke: '玲可',
    bts_st_fangan: '方案',
    bts_st_fangan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至多两名其他角色，这些角色各回复1点体力并移除1层异常。`,

    bts_st_jingyan: '经验',
    bts_st_jingyan_info: `锁定技，当你令其他角色回复体力后，其附加等同于回复量的${get.poptip('bts_glossary_bless_zhiyu_faq')}。`,

    bts_st_guantou: '罐头',
    bts_st_guantou_info: `当你受到伤害时，你可以弃置一张【杀】并选择一名受伤或拥有${get.poptip('bts_glossary_hudun_faq')}的其他角色，其摸1张牌并回复1点体力，然后其可以为你承受本次伤害。`,

    '$bts_st_fangan1': "为了去往远方…",
    '$bts_st_fangan2': "不管什么手段，通通拿出来吧！",
    '$bts_st_jingyan1': "劳驾，让一让",
    '$bts_st_jingyan2': "很好很好，看准机会…",
    '$bts_st_guantou1': "放松，深呼吸",
    '$bts_st_guantou2': "补充点盐分",
    '~bts_lingke': "哥…姐……",
};

export const simpleTranslate = {
    bts_st_fangan_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令至多2名其他角色各回复1体力并移除1层异常`,
    bts_st_jingyan_info: `锁；你令其他角色回复体力后，其+等量${get.poptip('bts_glossary_bless_zhiyu_faq')}`,
    bts_st_guantou_info: `受伤时弃1杀补给1名受伤/有${get.poptip('bts_glossary_hudun_faq')}角色并令其代为承伤`,
};

export const pinyins = { bts_lingke: 'lingke' };
