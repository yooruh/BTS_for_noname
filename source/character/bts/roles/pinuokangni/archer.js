// Archer（源 animal.lua L9380-9487）—— 剑制、心眼与螺旋。
// 技能：剑制（必杀技·暗属性伤害+心眼）、心眼（他人间伤害弃心眼摸牌）、螺旋（弃两张【杀】暴击伤害）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'pinuokangni';
export const title = '量子·巡猎·无铭的英灵'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('Archer')}用${get.poptip('bts_glossary_nature_dark_faq')}剑制攒心眼，拿双杀放螺旋。`;

export const character = {
    bts_archer: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_jianzhi', 'bts_st_xinyan', 'bts_st_luoxuan'],
    },
};

export const skill = {
    // ── 必杀技·剑制（源 st_jianzhi = SkillCard + ZeroCardViewAsSkill，L9381-9410）──
    // 出牌阶段，失5怒气，对一名其他角色造成1点量子伤害（星启为2点贯通量子伤害），获得2枚心眼。
    bts_st_jianzhi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9408）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9384）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        logTarget: 'player',
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_jianzhi');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L9387：LoseAngry(player, 5)
            // 源 L9388-9394：n=1，星启时 n=2 且 reason 追加 "_through"（贯通）
            const damage = target.damage(
                player,
                lib.bts.api.god(player) ? 2 : 1,
                'nocard',
            );
            damage.reason = `bts_st_jianzhi_dark${lib.bts.api.god(player) ? '_through' : ''}`;
            lib.bts.api.setDamageNature(damage, 'dark');
            await damage;
            // 源 L9395：player:gainMark("@st_xinyan", 2)
            player.addMark('bts_st_xinyan', 2);
            // 源 L9396-9398：星启时令目标附加暗属性
            if (lib.bts.api.god(player)) await lib.bts.api.addNature(target, 'dark');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_jianzhi')
                    ? -1
                    : 8;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·心眼（源 st_xinyan = TriggerSkill Damaged，L9412-9436）──
    // 其他角色之间造成伤害后，你可以弃置1枚心眼并摸一张牌。
    // 源版获得的牌标记为【杀】；无名杀简化为直接摸一张（见迁移记录「简化」）。
    bts_st_xinyan: {
        trigger: { global: 'damageEnd' },
        filter(event, player) {
            // 源 L9420：受伤者 ≠ 你、伤害来源 ≠ 你、且你有心眼
            return (
                event.player !== player &&
                event.source !== player &&
                player.countMark('bts_st_xinyan')
            );
        },
        async content(event, trigger, player) {
            // 源 L9420-9421：askForSkillInvoke 后 loseMark("@st_xinyan")
            const result = await player
                .chooseBool('心眼：是否弃1枚心眼并摸1张牌？')
                .forResult();
            if (result.bool) {
                player.removeMark('bts_st_xinyan', 1);
                await player.draw(player); // 源 L9423-9427：getNCards + obtainCard（无名杀简化为摸1张）
            }
        },
        ai: { noe: true },
    },

    // ── 主动技·螺旋（源 st_luoxuan = ViewAsSkill n=2，L9453-9486）──
    // 出牌阶段，弃置两张【杀】，对一名其他角色造成1点暴击伤害；手牌<2或螺旋标记≥5时结束出牌阶段。
    bts_st_luoxuan: {
        enable: 'phaseUse',
        usable: 1,
        filterCard: (card) => get.name(card) === 'sha', // 源 view_filter（L9472）：【杀】
        position: 'h',
        selectCard: 2, // 源 n=2（L9469）
        filterTarget(card, player, target) {
            // 源 Card filter（L9456）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_luoxuan');
            const target = event.targets[0];
            await player.discard(event.cards); // 源 L9477-9480：addSubcard 弃两张【杀】
            // 源 L9460：reason 含 "_critical" 的暴击伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_luoxuan_critical';
            await damage;
            // 源 L9461：AddAbnormal(player, "@abnormal_st_luoxuan") —— 螺旋计数
            lib.bts.api.addAbnormal(player, 'st_luoxuan', 1, player);
            // 源 L9462-9464：手牌<2 或 螺旋≥5 → 结束出牌阶段
            if (
                player.countCards('h') < 2 ||
                lib.bts.api.getAbnor(player, 'st_luoxuan', 5)
            )
                player.skip('phaseUse');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_luoxuan') ? -1 : 6;
            },
            result: { target: -1 },
        },
    },
};

export const translate = {
    bts_archer: 'Archer',
    bts_st_jianzhi: '剑制',
    bts_st_jianzhi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，对一名其他角色造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}伤害（${get.poptip('bts_glossary_xingqi_faq')}时为2点${get.poptip('bts_glossary_guantong_faq')}伤害），获得2枚心眼。`,
    bts_st_xinyan: '心眼',
    bts_st_xinyan_info: '其他角色之间造成伤害后，你可以弃置1枚心眼并摸一张牌。',
    bts_st_luoxuan: '螺旋',
    bts_st_luoxuan_info: `出牌阶段，你可以弃置两张【杀】，对一名其他角色造成1点${get.poptip('bts_glossary_bless_critical_faq')}伤害。`,

    '$bts_st_jianzhi1': "I am the bone of my sword",
    '$bts_st_jianzhi2': "Unlimited Blade Works",
    '$bts_st_xinyan1': "鹤翼三连！",
    '$bts_st_xinyan2': "穿山断水！",
    '$bts_st_luoxuan1': "Trace on！",
    '$bts_st_luoxuan2': "Caladbolg II！",
    '$bts_st_luoxuan3': "Broken Phantasm！",
    '$bts_st_luoxuan4': "别想跑",
    '$bts_st_luoxuan5': "无处可躲！",
    '~bts_archer': "是我…败了…",
};

export const simpleTranslate = {
    bts_st_jianzhi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}对1名其他角色造成暗伤，得2心眼`,
    bts_st_xinyan_info: '他人间伤害后可弃1心眼摸1',
    bts_st_luoxuan_info: `出牌阶段弃2杀对1名其他角色造成${get.poptip('bts_glossary_bless_critical_faq')}伤害`,
};

export const pinyins = { bts_archer: 'archer' };
