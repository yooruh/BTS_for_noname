// 布洛妮娅（源 animal.lua L3962-4034）—— 行曲必杀技贯通、部署弃杀跳过出牌阶段、军势额外摸牌。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '风·同谐·大守护者继承人'; // 属性·命途
export const intro =
    `${B('布洛妮娅')}是${get.poptip('bts_glossary_guantong_faq')}支援：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_xingqu'))}叠加${get.poptip('bts_glossary_guantong_faq')}，${B(get.poptip('bts_sk_bushu'))}弃【杀】调整站位并跳过出牌阶段，${B(get.poptip('bts_sk_junshi'))}回合结束额外摸牌。` +
    `<li>${get.poptip('bts_glossary_guantong_faq')}伤害无视${get.poptip('bts_glossary_hudun_faq')}`;

export const character = {
    bts_ch_buluoniya: {
        sex: 'female',
        group: 'yaliluo',
        hp: 4,
        skills: ['bts_sk_xingqu', 'bts_sk_bushu', 'bts_sk_junshi'],
    },
};

export const skill = {
    // ── 必杀技·行曲（源 st_xingqu = ZeroCardViewAsSkill，L3963-3982）──
    bts_sk_xingqu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 4);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_xingqu');
            lib.bts.api.loseAngry(player, 4);
            await lib.bts.api.addBless(player, 'through', 2);
            for (const t of event.targets || [])
                await lib.bts.api.addBless(t, 'through', 2, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_xingqu')
                    ? -1
                    : 5;
            },
            result: { player: 1 },
        },
    },

    // ── 部署（源 st_bushu = OneCardViewAsSkill + EventPhaseChanging，L4184-4220）──
    bts_sk_bushu: {
        // 源 st_bushu = EventPhaseChanging（即将进入出牌阶段前触发）：
        // 若在 phaseUseBegin 里 skip('phaseUse')，出牌阶段已开始，checkSkipped 不会消费
        // 该标记且残留致下一回合出牌阶段被误跳；改在 phaseChange（阶段切换前）触发，
        // 此刻 skip 才会在阶段事件启动时被消费（同款正确范式：xingqiri.js 恩赐 L76-84）。
        trigger: { player: 'phaseChange' },
        filter(event, player) {
            // 即将进入出牌阶段、出牌阶段未被跳过，且手牌有【杀】可弃
            return (
                event.phaseList?.[event.num]?.startsWith('phaseUse') &&
                !player.skipList.includes('phaseUse') &&
                player.getCards('h').some((c) => get.name(c) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            const r = await player
                .chooseBool('部署：是否弃置一张【杀】并跳过出牌阶段？')
                .forResult();
            if (!r.bool) {
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
                .chooseTarget(
                    '部署：选择一名角色（移除其1层异常，其成为你下家）',
                    [1, 1],
                    // 源 L4186-4187：任意其他角色（无需有异常；无异常时仅换座）
                    (c, p, t) => t !== p,
                )
                .forResult();
            if (!target.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = target;
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, t, player) {
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            const target = event.targets[0]; // event=技能事件，cost 结果目标
            // 源 L4190：RemoveAbnormal(targets[1], "choice", 1, player) —— 由本角色选择移除目标1层异常
            const marks = Object.keys(target.storage || {}).filter(
                (k) => k.startsWith('bts_abnormal_') && target.countMark(k) > 0,
            );
            if (marks.length === 1) {
                lib.bts.api.removeAbnormal(
                    target,
                    marks[0].slice('bts_abnormal_'.length),
                    1,
                    player,
                );
            } else if (marks.length > 1) {
                // 修复：控件须为纯字符串（[键,文案] 数组会原样成为 result.control 致下游崩溃）；文案改走 set('prompt')
                const r = await player
                    .chooseControl(marks)
                    .set('prompt', '部署：选择移除一种异常')
                    .set('ai', () => 0)
                    .forResult();
                if (r.control)
                    lib.bts.api.removeAbnormal(
                        target,
                        r.control.slice('bts_abnormal_'.length),
                        1,
                        player,
                    );
            }
            // 源 L4191-4195：目标还不是你下家时，一次性与其换座令其成为你下家
            //（源 fix：原 while 逐格换座会一回合多次座位广播致游戏结束闪退，改单次交换）
            const next = player.getNext();
            if (next && target !== next) game.swapSeat(next, target);
            player.skip('phaseUse'); // 源 player:skip(Player_Play)
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·军势（源 st_junshi = TriggerSkill Compulsory EventPhaseStart，L4011-4034）──
    bts_sk_junshi: {
        trigger: { player: 'phaseAfter' },
        forced: true,
        filter(event, player) {
            return player
                .getHistory('useCard')
                .some((h) => h.card?.name === 'sha');
        },
        async content(event, trigger, player) {
            // 源 L4030 ExtraPhase(Draw)：真实额外摸牌阶段（触发摸牌技能/异常/祝福）
            lib.bts.api.extraPhase(player, 'phaseDraw');
        },
        ai: { noe: true },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_buluoniya_skin1': '皮肤1',
    'bts_ch_buluoniya_skin2': '皮肤2',
    'bts_ch_buluoniya_skin3': '皮肤3',
    'bts_ch_buluoniya_skin1': '皮肤1',
    'bts_ch_buluoniya_skin2': '皮肤2',
    'bts_ch_buluoniya_skin3': '皮肤3',
    'bts_ch_buluoniya_skin1': '皮肤1',
    'bts_ch_buluoniya_skin2': '皮肤2',
    'bts_ch_buluoniya_skin3': '皮肤3',
    bts_ch_buluoniya: '布洛妮娅',
    bts_sk_xingqu: '行曲',
    bts_sk_xingqu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你与这些角色各附加2层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}。`,

    bts_sk_bushu: '部署',
    bts_sk_bushu_info:
        '出牌阶段开始时，你可以弃置一张【杀】并选择一名其他角色，移除其1层异常，其成为你下家，然后跳过出牌阶段。',

    bts_sk_junshi: '军势',
    bts_sk_junshi_info:
        '锁定技，回合结束时，若你于此回合内使用过【杀】，你执行一个额外的摸牌阶段。',

    '$bts_sk_xingqu1': "我们早已踏入风暴",
    '$bts_sk_xingqu2': "为了守护和捍卫，击溃他们！",
    '$bts_sk_bushu1': "时不再至，请助我一臂之力！",
    '$bts_sk_bushu2': "时不再至，请随我一同出战！",
    '$bts_sk_junshi1': "区区恶徒",
    '$bts_sk_junshi2': "拿出魄力来",
    '~bts_ch_buluoniya': "绝对…不能失守……",
};

export const simpleTranslate = {
    bts_sk_xingqu_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失4${get.poptip('bts_glossary_nuqi_faq')}与至少1名其他角色各+2${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}`,
    bts_sk_bushu_info: '出牌阶段开始时，弃1杀选1名其他角色移除其1层异常并成为你下家，跳过出牌阶段',
    bts_sk_junshi_info: '锁；回合结束时若用过杀，执行一个额外的摸牌阶段',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
