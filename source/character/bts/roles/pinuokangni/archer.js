// Archer（源 animal.lua L9380-9487）—— 剑制、心眼与螺旋。
// 技能：剑制（必杀技·暗属性伤害+心眼）、心眼（他人间伤害弃心眼摸牌）、螺旋（弃两张【杀】暴击伤害）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';import { extensionPath } from '../../../../tool/utils/paths.js';

export const sort = 'pinuokangni';
export const title = '量子·巡猎·无铭的英灵'; // 属性·命途
export const intro =
    `${B('Archer')}用${get.poptip('bts_glossary_nature_dark_faq')}${get.poptip('bts_sk_jianzhi')}攒${get.poptip('bts_sk_xinyan')}，拿双杀放${get.poptip('bts_sk_luoxuan')}。`;

export const character = {
    bts_ch_archer: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_jianzhi', 'bts_sk_xinyan', 'bts_sk_luoxuan'],
    },
};

export const skill = {
    // ── 必杀技·剑制（源 st_jianzhi = SkillCard + ZeroCardViewAsSkill，L9381-9410）──
    // 出牌阶段，失5怒气，对一名其他角色造成1点量子伤害（星启为2点贯通量子伤害），获得2枚心眼。
    bts_sk_jianzhi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
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
            lib.bts.aiGuard.record(player, 'bts_sk_jianzhi');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L9387：LoseAngry(player, 5)
            // 源 L9388-9394：n=1，星启时 n=2 且 reason 追加 "_through"（贯通）
            const damage = target.damage(
                player,
                lib.bts.api.god(player) ? 2 : 1,
                'nocard',
            );
            damage.reason = `bts_sk_jianzhi_dark${lib.bts.api.god(player) ? '_bts_reason_through' : ''}`;
            lib.bts.api.setDamageNature(damage, 'dark');
            await damage;
            // 源 L9395：player:gainMark("@st_xinyan", 2)
            player.addMark('bts_sk_xinyan', 2);
            // 源 L9396-9398：星启时令目标附加暗属性
            if (lib.bts.api.god(player)) await lib.bts.api.addNature(target, 'dark');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_jianzhi')
                    ? -1
                    : 8;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·心眼（源 st_xinyan = TriggerSkill Damaged，L9412-9436）──
    // 其他角色之间造成伤害后，你可以弃置1枚心眼并摸一张牌。
    // 源版获得的牌标记为【杀】；无名杀简化为直接摸一张（见迁移记录「简化」）。
    bts_sk_xinyan: {
        trigger: { global: 'damageEnd' },
        filter(event, player) {
            // 源 L9420：受伤者 ≠ 你、伤害来源 ≠ 你、且你有心眼
            return (
                event.player !== player &&
                event.source !== player &&
                player.countMark('bts_sk_xinyan')
            );
        },
        async content(event, trigger, player) {
            // 源 L9779-9780：askForSkillInvoke 后 loseMark("@st_xinyan")；trigger=damageEnd 事件
            const result = await player
                .chooseBool('心眼：是否弃1枚心眼，视为对其使用【杀】并摸1张牌？')
                .forResult();
            if (result.bool) {
                player.removeMark('bts_sk_xinyan', 1);
                // 源 L9781：ViewAsCardOnly(p, player=受伤者, "#st_xinyan") —— 视为对其使用【杀】
                //（trigger.player = 本次 damageEnd 的受伤者；已死亡目标不可用牌，作存活守卫）
                if (trigger.player.isAlive())
                    await player.useCard({ name: 'sha', isCard: true }, trigger.player);
                // 源 L9782-9788：getNCards(1) + obtainCard + showCard + setCardFlag
                //（无名杀简化：摸1并展示；setCardFlag「此牌视为【杀】」未复刻，见迁移记录「简化」）
                await player.draw(player);
                const card = player.getCards('h').at(-1);
                if (card) player.showCards(card);
            }
        },
        // 攒标进度在头像可见（真技能 mark:true 范式，素材文件名即技能 ID）
        mark: true,
        intro: {
            name: '心眼',
            content: (storage) =>
                `当前有${storage}枚心眼；其他角色之间造成伤害后，你可以弃1枚心眼，视为对其使用【杀】并摸1张牌。`,
        },
        markimage: `${extensionPath}/image/mark/bts_sk_xinyan.png`,
        ai: { noe: true },
    },

    // ── 主动技·螺旋（源 st_luoxuan = ViewAsSkill n=2，L9812-9846）──
    // 出牌阶段，弃置两张【杀】，对一名其他角色造成1点暴击伤害；手牌<2或螺旋标记≥5时结束出牌阶段。
    // 源 enabled_at_play（L9842-9844）仅要求手牌≥2，无次数限制（L9818 usedTimes 仅播报动画）。
    bts_sk_luoxuan: {
        enable: 'phaseUse',
        filterCard: (card) => get.name(card) === 'sha', // 源 view_filter（L9472）：【杀】
        position: 'h',
        selectCard: 2, // 源 n=2（L9469）
        filterTarget(card, player, target) {
            // 源 Card filter（L9456）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_luoxuan');
            const target = event.targets[0];
            await player.discard(event.cards); // 源 L9477-9480：addSubcard 弃两张【杀】
            // 源 L9460：reason 含 "_critical" 的暴击伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_luoxuan_bts_reason_critical';
            await damage;
            // 源 L9461：AddAbnormal(player, "@abnormal_st_luoxuan") —— 螺旋计数
            lib.bts.api.addAbnormal(player, 'st_luoxuan', 1, player);
            // 源 L9462-9464：手牌<2 或 螺旋≥5 → 结束出牌阶段
            if (
                player.countCards('h') < 2 ||
                lib.bts.api.getAbnor(player, 'st_luoxuan', 5)
            )
                // 源 L9462-9464 结束出牌阶段：出牌中 skip() 无效且残留致隔回合误跳 →
                // 设 phaseUse.skipped（content.js「!event.skipped」不再 goto）
                lib.bts.api.endPlayPhase(player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_luoxuan') ? -1 : 6;
            },
            result: { target: -1 },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_archer_skin1': '皮肤1',
    'bts_ch_archer_skin1': '皮肤1',
    'bts_ch_archer_skin1': '皮肤1',
    bts_ch_archer: 'Archer',
    bts_sk_jianzhi: '剑制',
    bts_sk_jianzhi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，对一名其他角色造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}伤害（${get.poptip('bts_glossary_xingqi_faq')}时为2点${get.poptip('bts_glossary_guantong_faq')}伤害），获得2枚${get.poptip('bts_sk_xinyan')}。`,
    bts_sk_xinyan: '心眼',
    bts_sk_xinyan_info:
        `其他角色受到不为你造成的伤害后，你可以弃置1枚${get.poptip('bts_sk_xinyan')}标记，视为对其使用【杀】，然后摸一张牌并展示之。`,
    bts_sk_luoxuan: '螺旋',
    bts_sk_luoxuan_info: `出牌阶段，你可以弃置两张【杀】，对一名其他角色造成1点${get.poptip('bts_glossary_bless_critical_faq')}伤害，你附加1层${get.poptip('bts_glossary_abnormal_luoxuan_faq')}。`,

    '$bts_sk_jianzhi1': "I am the bone of my sword",
    '$bts_sk_jianzhi2': "Unlimited Blade Works",
    '$bts_sk_xinyan1': "鹤翼三连！",
    '$bts_sk_xinyan2': "穿山断水！",
    '$bts_sk_luoxuan1': "Trace on！",
    '$bts_sk_luoxuan2': "Caladbolg II！",
    '$bts_sk_luoxuan3': "Broken Phantasm！",
    '$bts_sk_luoxuan4': "别想跑",
    '$bts_sk_luoxuan5': "无处可躲！",
    '~bts_ch_archer': "是我…败了…",
};

export const simpleTranslate = {
    bts_sk_jianzhi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}对1名其他角色造成暗伤，得2${get.poptip('bts_sk_xinyan')}`,
    bts_sk_xinyan_info: `他人间伤害后可弃1${get.poptip('bts_sk_xinyan')}对其用杀并摸1展示`,
    bts_sk_luoxuan_info: `出牌阶段弃2杀对1名其他角色造成${get.poptip('bts_glossary_bless_critical_faq')}伤害并+1${get.poptip('bts_glossary_abnormal_luoxuan_faq')}`,
};

// 默认读音把拉丁名逐字符拆开（A r c h e r）：按叁岛式以整词覆盖。
export const pinyins = {
    'Archer': ['Archer'],
};
