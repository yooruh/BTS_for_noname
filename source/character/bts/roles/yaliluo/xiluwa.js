// 希露瓦（源 animal.lua L3365-3432）—— 热潮必杀技麻痹、和弦空手回怒、电光弃杀点麻痹。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '雷·智识·贯通天穹的一曲'; // 属性·命途
export const intro =
    `${B('希露瓦')}是${get.poptip('bts_glossary_mabi_faq')}控制：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_rechao'))}令目标${get.poptip('bts_glossary_mabi_faq')}，${B(get.poptip('bts_sk_hexian'))}空手时回复${get.poptip('bts_glossary_nuqi_faq')}，${B(get.poptip('bts_sk_dianguang'))}摸牌阶段弃【杀】点${get.poptip('bts_glossary_mabi_faq')}。` +
    `<li>${get.poptip('bts_glossary_mabi_faq')}会令目标少摸牌并受额外伤害`;

export const character = {
    bts_ch_xiluwa: {
        sex: 'female',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_sk_rechao', 'bts_sk_hexian', 'bts_sk_dianguang'],
    },
};

export const skill = {
    // ── 必杀技·热潮（源 st_rechao = SkillCard + ZeroCardViewAsSkill，L3366-3389）──
    // 出牌阶段，失3怒气并选择至少一名处于麻痹的其他角色，这些角色各附加2层麻痹
    //（若你为星启，也可选择不处于麻痹的角色，仅附加1层）。
    bts_sk_rechao: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L3387）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L3369）：目标 ≠ 自己且（处于麻痹 或 星启）
            return (
                target !== player &&
                (lib.bts.api.getAbnor(target, 'numb') || lib.bts.api.god(player))
            );
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_rechao');
            lib.bts.api.loseAngry(player, 3); // 源 L3372：LoseAngry(player, 3)
            for (const target of event.targets || []) {
                // 源 L3374-3376：星启且目标未麻痹 → +1，否则 +2
                const num =
                    lib.bts.api.god(player) &&
                    !lib.bts.api.getAbnor(target, 'numb')
                        ? 1
                        : 2;
                lib.bts.api.addAbnormal(target, 'numb', num, player); // 源 L3376：AddAbnormal(@abnormal_numb, n)
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_rechao') ? -1 : 5;
            },
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·和弦（源 st_hexian = TriggerSkill EventPhaseStart Play，L3391-3400）──
    // 出牌阶段开始时，若你没有手牌，你回复1点怒气。
    // 源描述 L12904「锁定技」，源代码无询问自动触发 → 标 forced 防引擎弹 chooseBool。
    bts_sk_hexian: {
        trigger: { player: 'phaseUseBegin' },
        forced: true,
        filter(event, player) {
            // 源 L3395：出牌阶段且空手
            return player.countCards('h') === 0;
        },
        async content(event, trigger, player) {
            // 源 L3397：AddAngry(player)
            lib.bts.api.addAngry(player, 1);
        },
        ai: { noe: true },
    },

    // ── 触发技·电光（源 st_dianguang = TriggerSkill EventPhaseStart Draw + OneCardViewAsSkill，L3402-3431）──
    // 摸牌阶段开始时，你可以弃置一张【杀】并选择一名角色，令其附加2层麻痹。
    bts_sk_dianguang: {
        trigger: { player: 'phaseDrawBegin' },
        filter(event, player) {
            // 源 L3429：摸牌阶段且手牌有【杀】可弃
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L3429：askForUseCard("@@st_dianguang")
            const result = await player
                .chooseBool(
                    '电光：是否放弃摸牌并弃置一张【杀】并选择一名角色令其附加2层麻痹？',
                )
                .forResult();
            if (!result.bool) {
                event.result = { bool: false };
                return;
            }
            const cards = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '弃置一张【杀】',
                )
                .forResult();
            if (!cards.bool) {
                event.result = { bool: false };
                return;
            }
            const target = await player
                .chooseTarget('电光：选择一名角色', [1, 1], () => true)
                .forResult();
            if (!target.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = target;
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, trigger, player) {
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            // 源 L3408：AddAbnormal(targets[1], "@abnormal_numb", 2, player)
            lib.bts.api.addAbnormal(event.targets[0], 'numb', 2, player);
            // 源 L3570：on_trigger 返回 true 跳过摸牌阶段（代价=放弃本次摸牌）。
            // phaseDrawBegin 触发时 trigger 即 phaseDraw 事件本身（loop Begin 派生点，见核实 F-07）；
            // 勿用 getParent（排除自身、恒返回 {}，跳过块永不执行——原实现「放弃摸牌」从未生效）。
            if (trigger.name === 'phaseDraw') {
                trigger.isSkipped = true;
                trigger.finish();
            }
        },
        ai: { result: { player: 1, target: -1 } },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_xiluwa_skin1': '皮肤1',
    'bts_ch_xiluwa_skin2': '皮肤2',
    'bts_ch_xiluwa_skin3': '皮肤3',
    'bts_ch_xiluwa_skin4': '皮肤4',
    'bts_ch_xiluwa_skin5': '皮肤5',
    'bts_ch_xiluwa_skin1': '皮肤1',
    'bts_ch_xiluwa_skin2': '皮肤2',
    'bts_ch_xiluwa_skin3': '皮肤3',
    'bts_ch_xiluwa_skin4': '皮肤4',
    'bts_ch_xiluwa_skin5': '皮肤5',
    bts_ch_xiluwa: '希露瓦',
    bts_sk_rechao: '热潮',
    bts_sk_rechao_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名处于${get.poptip('bts_glossary_mabi_faq')}的其他角色，这些角色各附加2层${get.poptip('bts_glossary_mabi_faq')}（若你为${get.poptip('bts_glossary_xingqi_faq')}，也可选择不处于${get.poptip('bts_glossary_mabi_faq')}的角色，仅附加1层）。`,

    bts_sk_hexian: '和弦',
    bts_sk_hexian_info: `锁定技，出牌阶段开始时，若你没有手牌，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,

    bts_sk_dianguang: '电光',
    bts_sk_dianguang_info: `摸牌阶段开始时，你可以放弃摸牌并弃置一张【杀】并选择一名角色，令其附加2层${get.poptip('bts_glossary_mabi_faq')}。`,

    '$bts_sk_rechao1': "准备好释放自己了么？",
    '$bts_sk_rechao2': "不管是反抗，摇摆，沉沦，都将……",
    '$bts_sk_hexian1': "摇滚不止！",
    '$bts_sk_hexian2': "躁起来！",
    '$bts_sk_dianguang1': "跟上，我的节奏！",
    '$bts_sk_dianguang2': "尖叫，还不够热烈！",
    '~bts_ch_xiluwa': "演出…还没……",
};

export const simpleTranslate = {
    bts_sk_rechao_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令至少1名${get.poptip('bts_glossary_mabi_faq')}角色各+2${get.poptip('bts_glossary_mabi_faq')}（${get.poptip('bts_glossary_xingqi_faq')}可对非${get.poptip('bts_glossary_mabi_faq')}角色+1）`,
    bts_sk_hexian_info: `锁；出牌阶段开始时，若无手牌则+1${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_sk_dianguang_info: `摸牌阶段，放弃摸牌并弃1张【杀】令1名角色+2${get.poptip('bts_glossary_mabi_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
