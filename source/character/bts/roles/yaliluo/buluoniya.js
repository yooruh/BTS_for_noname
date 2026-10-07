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
            // AI 口径：怒气≥4 且存在友方时发动——自己与每名友方各+2层贯通祝福（2回合破盾/破甲窗口，
            // 贯通主用途=敌方护盾，场上有护盾敌人时加值）；无友方不发动（否则只能给敌方补贯通；源 AI
            // 同款要求 friends_noself>0）。贯通按≈0.8/层计（源 animal.lua L3962-4034；源 AI StarRail-ai.lua L1878-1890）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_xingqu')) return -1;
                if (!lib.bts.api.getAngry(player, 4)) return -1; // 怒气<4 且无怒气豁免：不可用（filter 同门）
                const friends = game.countPlayer(
                    (t) => t !== player && t.isAlive() && get.attitude(player, t) > 0,
                );
                if (!friends) return -1; // 至少需1名友方成为目标
                let value = (1 + friends) * 1.6; // 自身+每名友方各2层贯通
                if (
                    game.hasPlayer(
                        (t) =>
                            t.isAlive() &&
                            get.attitude(player, t) < 0 &&
                            lib.bts.api.getShield(t),
                    )
                )
                    value += 1; // 贯通破盾：敌方有护盾时收益上调
                return Math.min(9, value);
            },
            result: {
                player: 1.6, // 自身+2层贯通（获益）
                // 受动方各+2层贯通（获益）；持【杀】者更可能把窗口转化为输出，略优先（引擎按态度加权区敌我）
                target: (player, target) => {
                    if (!target.isAlive()) return 0;
                    const armed = target
                        .getCards('h')
                        .some((c) => get.name(c) === 'sha');
                    return armed ? 2 : 1.6;
                },
            },
        },
    },

    // ── 部署（源 st_bushu = OneCardViewAsSkill + EventPhaseChanging，L4184-4220）──
    bts_sk_bushu: {
        // 源 st_bushu = EventPhaseChanging（进入出牌阶段前触发）：在 phaseUseBegin 里 skip('phaseUse')
        // 时出牌阶段已开始，checkSkipped 不消费该标记、残留会误跳下一回合；故取 phaseChange
        //（阶段切换前），skip 才会在阶段事件启动时被消费（同款范式：xingqiri.js 恩赐 L76-84）。
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
            // AI 口径：代价=弃1张【杀】+跳过整个出牌阶段；收益=友方移除1层异常+抢到你下家位（提前一轮）。
            // 出牌阶段价值≈手牌数：仅在手牌≤2（打不出名堂）且存在友方时发动（源 animal.lua L4184-4220；
            // 源 AI @@st_bushu 亦要求友方目标——原实现未配 ai：chooseBool 无条件确认、chooseTarget 走默认
            // 态度2会把目标选成友方（凑巧）且不看手牌，属 AI 缺陷，此按收益矩阵修复）
            const worth = () =>
                player.countCards('h') <= 2 &&
                game.hasPlayer(
                    (t) => t !== player && t.isAlive() && get.attitude(player, t) > 0,
                );
            const r = await player
                .chooseBool('部署：是否弃置一张【杀】并跳过出牌阶段？')
                .set('ai', worth)
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
                // AI 口径：弃分值最低的【杀】（≥6 视为过贵→放弃发动；同风堇·虹光 ai1 范式）
                .set('ai', (card) =>
                    typeof card === 'object' && card ? 6 - get.value(card) : -1,
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
                // AI 口径：仅友方（移除异常=增益）；背负异常者优先；全非友方→选择失败、技能不发动
                //（chooseTarget 的 ai 实参签名 (target, targets)，首参即候选目标——勿按 filter 形参误读）
                .set('ai', (target) => {
                    const att = get.attitude(player, target);
                    if (att <= 0) return -1;
                    return att + (lib.bts.api.abnormalCount(target) > 0 ? 1 : 0);
                })
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
                // 控件须为纯字符串（[键,文案] 数组会原样成为 result.control 致下游崩溃）；文案走 set('prompt')。
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
            //（逐格 while 换座会多次广播座位、致游戏结束闪退；单次交换即可）
            const next = player.getNext();
            if (next && target !== next) game.swapSeat(next, target);
            player.skip('phaseUse'); // 源 player:skip(Player_Play)
        },
        ai: {
            // 发动决策在 cost 内联（cost 型触发技，引擎不询顶层 check）；此 result 供跨技能估值——
            // 受动方移除1层异常（获益）；施动方弃1杀+跳过出牌阶段（代价，记负）
            result: { player: -1, target: 1 },
        },
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
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
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
