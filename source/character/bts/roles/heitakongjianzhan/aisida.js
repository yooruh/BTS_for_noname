// 艾丝妲（源 animal.lua L2729-2813）—— 星空必杀技摸牌、星座锁定蓄能、星群弃杀五谷丰登。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'heitakongjianzhan';
export const title = '火·同谐·眠于银河之下'; // 属性·命途
export const intro =
    `${B('艾丝妲')}是过牌辅助：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_xingkong'))}与目标各摸牌，${B(get.poptip('bts_sk_xingzuo'))}随用牌积累${get.poptip('bts_glossary_bless_xuneng_faq')}，${B(get.poptip('bts_sk_xingqun'))}在手牌最多时弃【杀】开五谷丰登并给炎系角色附加${get.poptip('bts_glossary_nature_flame_faq')}。` +
    `<li>${get.poptip('bts_glossary_bless_xuneng_faq')}满3层时，你造成伤害后会自动给目标附加${get.poptip('bts_glossary_nature_flame_faq')}`;

export const character = {
    bts_ch_aisida: {
        sex: 'female',
        group: 'heitakongjianzhan',
        hp: 3,
        skills: ['bts_sk_xingkong', 'bts_sk_xingzuo', 'bts_sk_xingqun'],
    },
};

export const skill = {
    // ── 必杀技·星空（源 st_xingkong = ZeroCardViewAsSkill，L2730-2749）──
    bts_sk_xingkong: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_xingkong');
            lib.bts.api.loseAngry(player, 3); // 源 L2736
            // 自己与各目标同时摸一张牌（2026-09-30 改 asyncDraw：多人同时摸）
            await game.asyncDraw([player, ...(event.targets || [])], 1);
            if (lib.bts.api.god(player)) player.addMark('bts_mk_xingkong-clear', 1); // 星启防止蓄能移除
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_xingkong')
                    ? -1
                    : 5;
            },
            result: { player: 1 },
        },
    },

    // ── 锁定技·星座（源 st_xingzuo = TriggerSkill TargetSpecified，L2750-2764）──
    bts_sk_xingzuo: {
        trigger: { player: 'useCard' },
        forced: true,
        filter(event, player) {
            return event.targets?.length;
        },
        async content(event, trigger, player) {
            let n = 0;
            for (const t of trigger.targets || []) { // trigger=useCard 事件
                n += 1;
                if (
                    lib.bts.api.getAbnor(t, 'burn') ||
                    lib.bts.api.getNature(null, t) === 'flame'
                )
                    n += 2;
            }
            await lib.bts.api.addBless(player, 'xuneng', n); // 源 AddBless(@bless_xuneng, n)
        },
        ai: { noe: true },
    },

    // ── 星群（源 st_xingqun = OneCardViewAsSkill + SkillCard，L2765-2813）──
    bts_sk_xingqun: {
        enable: 'phaseUse',
        filter(event, player) {
            // 若你为手牌数最多的角色
            const n = player.countCards('h');
            return game.players.every(
                (p) => p === player || p.countCards('h') <= n,
            );
        },
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，视为使用【五谷丰登】',
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_xingqun');
            await player.discard(event.cards);
            // 目标须可被指定（isProhibited/目标禁用过滤，如残梦封锁等；源 L2768 isProhibited）
            const targets = game.players.filter(
                (p) =>
                    p.isAlive() &&
                    player.canUse({ name: 'wugu', isCard: true }, p, false),
            );
            const use = player.useCard({ name: 'wugu', isCard: true }, targets); // 视为【五谷丰登】
            await use;
            for (const p of lib.bts.api.seatOrder(game.players)) {
                if (
                    p.isAlive() &&
                    (lib.bts.api.getAbnor(p, 'burn') ||
                        lib.bts.api.getNature(null, p) === 'flame')
                ) {
                    await lib.bts.api.addNature(p, 'flame');
                }
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_xingqun')
                    ? -1
                    : 3;
            },
            useful: 2,
            value: 4,
            result: { player: 1 },
        },
    },
};

export const marks = {
    'bts_mk_xingkong-clear': { markKind: 'record' },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_aisida_skin1': '皮肤1',
    'bts_ch_aisida_skin2': '皮肤2',
    'bts_ch_aisida_skin1': '皮肤1',
    'bts_ch_aisida_skin2': '皮肤2',
    'bts_mk_xingkong-clear': '星空已用',
    'bts_ch_aisida_skin1': '皮肤1',
    'bts_ch_aisida_skin2': '皮肤2',
    bts_ch_aisida: '艾丝妲',
    bts_sk_xingkong: '星空',
    bts_sk_xingkong_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你与这些角色各摸一张牌，若你为${get.poptip('bts_glossary_xingqi_faq')}，防止你于此回合内因${get.poptip('bts_glossary_bless_xuneng_faq')}的效果移除${get.poptip('bts_glossary_bless_faq')}。`,
    bts_sk_xingzuo: '星座',
    bts_sk_xingzuo_info: `锁定技，当你使用牌指定一个目标后，附加1层${get.poptip('bts_glossary_bless_xuneng_faq')}（若其处于${get.poptip('bts_glossary_abnormal_burn_faq')}或为${get.poptip('bts_glossary_nature_flame_faq')}角色则改为2层）。`,
    bts_sk_xingqun: '星群',
    bts_sk_xingqun_info: `若你为手牌数最多的角色，你可以弃置一张【杀】并视为使用【五谷丰登】，然后处于${get.poptip('bts_glossary_abnormal_burn_faq')}或为${get.poptip('bts_glossary_nature_flame_faq')}的目标各附加${get.poptip('bts_glossary_nature_flame_faq')}。`,

    '$bts_sk_xingkong1': "一切，都是星辰的选择",
    '$bts_sk_xingkong2': "渴望着星星奥秘的钥匙啊，向开拓者们赐予你真正的祝福吧！",
    '$bts_sk_xingzuo1': "要躲开哟",
    '$bts_sk_xingzuo2': "露出破绽咯~",
    '$bts_sk_xingqun1': "幸运儿会是哪个呢~",
    '$bts_sk_xingqun2': "接受星星的祝福吧~",
    '~bts_ch_aisida': "还想…知道更多……",
    bts_bless_xuneng: '蓄能祝福',
    bts_bless_xuneng_info: `来源：${get.poptip('bts_sk_xingzuo')}赋予；造伤后≥3层移除3层并附炎属性；回合结束自然减少1层`,
};

export const simpleTranslate = {
    bts_sk_xingkong_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}与至少1名其他角色各摸1张牌；${get.poptip('bts_glossary_xingqi_faq')}则此回合${get.poptip('bts_glossary_bless_xuneng_faq')}不消耗`,
    bts_sk_xingzuo_info: `锁；你使用牌指定目标后，+1层${get.poptip('bts_glossary_bless_xuneng_faq')}（目标${get.poptip('bts_glossary_abnormal_burn_faq')}/炎则+2）`,
    bts_sk_xingqun_info: `手牌最多时，弃1张【杀】视为使用五谷丰登，再令${get.poptip('bts_glossary_abnormal_burn_faq')}/炎角色各+炎`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_xuneng: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_xuneng_faq',
        trigger: { source: 'damageEnd' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.source === player && event.num > 0 && !!event.player;
        },
        async content(event, trigger, player) {
            if (!lib.bts.api.getBless(player, 'xuneng', 3)) return;
            if (player.countMark('bts_mk_xingkong-clear') === 0)
                await lib.bts.api.removeBless(player, 'xuneng', 3);
            await lib.bts.api.addNature(trigger.player, 'flame');
        },
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_xuneng_faq',
        name: '蓄能祝福',
        info: `当你对其他角色造成伤害后，若拥有至少3层此${get.poptip('bts_glossary_bless_faq')}，移除3层并令其附加${get.poptip('bts_glossary_nature_yan_faq')}。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
