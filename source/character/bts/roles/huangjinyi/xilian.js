// 昔涟（源 animal.lua L9084-9247）—— 记忆、誓约、乐土与爱诗。
// 技能：誓约（必杀技·记忆阈值后强化黄金裔/摸牌）、追忆（用杀/决斗得记忆）、众愿（他人回合后/弃杀得记忆）、
//       乐土（手牌【杀】当【决斗】+ 独立牌堆引擎：伤害+爱诗→除外1牌+1记忆）、爱诗（空标记，授予黄金裔，
//       各黄金裔技能经 hasSkill 检测后自行结算"诗歌"加成，参照五虎将大旗范式）。
import { lib, game, get, ui, _status, B } from '../../shared.js';

export const sort = 'huangjinyi';
export const title = '冰·记忆·往昔的涟漪'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('昔涟')}攒${get.poptip('bts_glossary_jiyi_faq')}给黄金裔同伴铺路：把爱诗交给他们，攒够记忆就开乐土、抛必杀，自己手里的${get.poptip('bts_glossary_bisha_faq')}也能少花力气。`;

export const character = {
    bts_xilian: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_shiyue', 'bts_st_zhuiyi', 'bts_st_zhongyuan'],
    },
};

export const skill = {
    // ── 必杀技·誓约（源 st_shiyue = SkillCard + ZeroCardViewAsSkill，L9116-9161）──
    // 出牌阶段，弃24枚记忆（星启或已发动过则为12枚）并选择一名角色：若其为黄金裔，其获得爱诗；
    // 否则其摸三张牌。首次发动后你获得乐土，并选择任意名角色获得怒气豁免；
    // 若你为星启，这些角色各执行一个额外回合。
    bts_st_shiyue: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // audit-choosetarget: skip  —— 首次发动分支的金黄裔挠怒豁免是次级分发（0..many，依赖本分支是否首次），无法上提；0下限为合法「不豁免」
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9157-9160）：记忆 ≥ n（星启/已发动过为12，否则24）
            const need =
                lib.bts.api.god(player) ||
                player.countMark('bts_st_shiyue_used')
                    ? 12
                    : 24;
            return player.countMark('bts_jiyi') >= need;
        },
        filterTarget() {
            // 源 Card filter（L9119）：目标数0个时可选（实际1名目标）
            return true;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_shiyue');
            const target = event.targets[0];
            const need =
                lib.bts.api.god(player) ||
                player.countMark('bts_st_shiyue_used')
                    ? 12
                    : 24;
            player.removeMark('bts_jiyi', need); // 源 L9126：LoseOther(player, "@jiyi", n)
            // 源 L9127-9138：黄金裔 → 获得爱诗；否则摸三张牌
            if (target.group === 'huangjinyi')
                await target.addSkill('bts_st_aishi');
            else await target.draw(player, 3); // 源 L9136：targets[1]:drawCards(3)
            // 源 L9139-9147：首次发动 → 获得乐土并选择怒气豁免角色
            if (!player.countMark('bts_st_shiyue_used')) {
                player.addMark('bts_st_shiyue_used', 1);
                // 源 L9142：acquireSkill(player, "st_letu")
                // 子技能（牌堆引擎/使出）随父显式挂载，保证 mark 展示与 enable 按钮（group 只挂 trigger）
                await player.addSkill(['bts_st_letu', 'bts_st_letu_pile', 'bts_st_letu_use']);
                player.addMark('bts_st_letu_active', 1);
                // 源 L9140：setPlayerMark(player, "st_zhongyuan", 0) —— 誓约获得的乐土为永久
                // （清除"众愿"临时乐土标记，避免被下个自己回合结束回收）
                player.removeMark(
                    'bts_st_zhongyuan_used',
                    player.countMark('bts_st_zhongyuan_used'),
                );
                // 源 L9144：askForUseCard("@@st_shiyue_st_letu!") —— 选择任意名角色
                const result = await player
                    .chooseTarget(
                        '誓约：选择任意名角色获得怒气豁免',
                        [0, Infinity],
                        () => true,
                        (target) => get.attitude(player, target),
                    )
                    .forResult();
                for (const target of result.targets || []) {
                    // 源 L9099-9103：目标获得怒气豁免，星启时执行额外回合
                    target.addMark('bts_extra_max', 1);
                    if (lib.bts.api.god(player)) lib.bts.api.extraTurn(target, 'bts_extra_turn');
                }
                // 源 L9094-9097：自己也获得怒气豁免，星启时执行额外回合
                player.addMark('bts_extra_max', 1);
                if (lib.bts.api.god(player)) lib.bts.api.extraTurn(player, 'bts_extra_turn');
            }
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_st_shiyue') ? -1 : 9,
            result: { target: 2 },
        },
    },

    // ── 锁定技·追忆（源 st_zhuiyi = TriggerSkill Compulsory CardUsed，L9163-9178）──
    // 当你使用【杀】或【决斗】后，获得1枚记忆；【决斗】改为3枚。
    bts_st_zhuiyi: {
        trigger: { player: 'useCard' },
        forced: true,
        filter(event) {
            // 源 L9168-9169：使用【杀】或【决斗】
            return ['sha', 'juedou'].includes(event.card?.name);
        },
        content(event, trigger, player) {
            // 源 L9170-9175：决斗+3，杀+1，gainMark("@jiyi", n)（trigger=useCard 事件）
            player.addMark('bts_jiyi', trigger.card.name === 'juedou' ? 3 : 1);
        },
        ai: { noe: true },
    },

    // ── 触发技·众愿（源 st_zhongyuan = TriggerSkill EventPhaseStart NotActive，L9180-9205）──
    // 一名角色的回合结束时：若其不为你，其可以令你获得1枚记忆标记；否则，若你没有"乐土"，
    // 你可以弃置一张【杀】获得3枚记忆标记，于下个回合的回合结束前拥有乐土（临时乐土）。
    // （无名杀 phaseAfter 即回合结束事件，与源 EventPhaseStart+NotActive 同义；
    //   临时乐土于下个自己的回合结束时回收，源 L9187-9189 同款。）
    bts_st_zhongyuan: {
        trigger: { global: 'phaseAfter' },
        filter(event, player) {
            // 源 L9191：他人回合结束 → 可获1记忆
            if (event.player !== player) return true;
            // 源 L9187-9196：自己回合结束 → 有临时乐土需回收 / 无乐土且手牌有【杀】可弃
            if (player.hasSkill('bts_st_letu'))
                return player.countMark('bts_st_zhongyuan_used') > 0;
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // trigger=phaseAfter 事件，event.player=回合结束者
            // 源 L9191：他人回合结束 → askForSkillInvoke（可选获得1记忆）
            if (trigger.player !== player) {
                event.result = await player
                    .chooseBool('众愿：是否获得1枚记忆标记？')
                    .set('ai', () => true)
                    .forResult();
                return;
            }
            // 源 L9187-9189：自己回合结束且有临时乐土 → 直接回收（无交互）
            if (
                player.hasSkill('bts_st_letu') &&
                player.countMark('bts_st_zhongyuan_used') > 0
            ) {
                event.result = { bool: true, cost_data: { strip: true } };
                return;
            }
            // 源 L9194：无乐土 → askForCard("Slash")（仅选择弃【杀】，弃牌移入 content 结算）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '众愿：是否弃置一张【杀】获得3枚记忆并重获乐土？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // trigger=phaseAfter 事件；event.cost_data/event.cards 为自选结果（标准约定）
            if (trigger.player !== player) {
                // 源 L9193：p:gainMark("@jiyi") —— 他人回合结束得1记忆
                player.addMark('bts_jiyi', 1);
                return;
            }
            if (event.cost_data?.strip) {
                // 源 L9187-9189：临时乐土于下个自己回合结束回收（移除技能并清标记）
                player.removeMark(
                    'bts_st_zhongyuan_used',
                    player.countMark('bts_st_zhongyuan_used'),
                );
                await player.removeSkill(['bts_st_letu', 'bts_st_letu_pile', 'bts_st_letu_use']);
                return;
            }
            // 源 L9196-9198：弃【杀】后得3记忆并重获乐土（临时，下个自己回合结束回收）
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            player.addMark('bts_jiyi', 3);
            if (!player.hasSkill('bts_st_letu'))
                await player.addSkill(['bts_st_letu', 'bts_st_letu_pile', 'bts_st_letu_use']);
            player.addMark('bts_st_zhongyuan_used', 1);
            player.addMark('bts_st_letu_active', 1);
        },
        ai: { result: { player: 1 } },
    },

    // ── 关联技·乐土（源 st_letu = FilterSkill，L9222-9233）──
    // 你可以将手牌【杀】当【决斗】使用；同时承载"乐土"独立牌堆（源 #st_letu，L9207-9221，
    // 参照无名杀邓艾田/陈寿扑克牌堆范式：addToExpansion + 标记展示 + 副牌堆出牌）。
    // 乐土引擎：任意角色造成伤害后，若你拥有爱诗，将牌堆顶1张置入"乐土"牌堆并获得1枚记忆
    // （源 L9215：GetXiLian(p) 时 gainMark("@jiyi")）；乐土牌能当手牌使用或打出，
    // 于你的下个出牌阶段开始前回收（源描述）。
    // 结构（对齐克拉拉范式）：父技能=杀当决斗（enable），牌堆引擎/标记/出牌为子技能。
    bts_st_letu: {
        charlotte: true,
        enable: 'phaseUse',
        // 子技能随父挂载：无名杀 addSkillTrigger 经 expandSkills 把 group 技能一并挂载
        // （本库范式：jizi 远征 attach / welt 断界 ritual / 海妖 lock 同款；mark 展示另在授予处显式 addSkill 保证）
        group: ['bts_st_letu_pile', 'bts_st_letu_use'],
        filterCard(card) {
            // 源 view_filter（L9225）：手牌且为【杀】
            return get.name(card) === 'sha';
        },
        position: 'h',
        selectCard: 1,
        viewAs: {
            // 源 L9228：克隆 duel
            name: 'juedou',
            isCard: true,
            storage: { bts_st_letu: true },
        },
        subSkill: {
            // 乐土·牌堆引擎 + 展示（源 #st_letu；参照邓艾田 intro content: "expansion"）
            pile: {
                charlotte: true,
                mark: true,
                marktext: '乐',
                intro: { content: 'expansion', markcount: 'expansion' },
                // 引擎（任意伤害+爱诗）+ 出牌阶段回收（描述"下个出牌阶段开始前"）
                trigger: { player: 'phaseUseBegin', global: 'damageEnd' },
                forced: true,
                filter(event, player, triggername) {
                    if (triggername === 'phaseUseBegin')
                        return player.getExpansions('bts_letu').length > 0;
                    // 源 L9219-9221：任意角色造成伤害后（can_trigger 要求拥有者同时具备爱诗）
                    return event.num > 0 && player.hasSkill('bts_st_aishi');
                },
                async content(event, trigger, player) {
                    if (event.triggername === 'phaseUseBegin') {
                        // 源描述：乐土牌于你的下个出牌阶段开始前回收（弃置）
                        const cards = player.getExpansions('bts_letu');
                        if (cards.length) await player.loseToDiscardpile(cards);
                        return;
                    }
                    // 源 L9214：p:addToPile("&letu", getNCards(1)) —— 牌堆顶1张置入乐土牌堆
                    const cards = get.cards(1);
                    const next = player.addToExpansion(cards, 'gain2');
                    next.gaintag.add('bts_letu');
                    await next;
                    // 源 L9215：GetXiLian(p) 时 p:gainMark("@jiyi") —— 获得1枚记忆（『誓约』之诗）
                    player.addMark('bts_jiyi', 1);
                },
                onremove(player) {
                    const cards = player.getExpansions('bts_letu');
                    if (cards.length) player.loseToDiscardpile(cards);
                },
            },
            // 乐土·使出：牌能当手牌使用或打出（参照无名杀急袭 chooseButton 副牌堆出牌范式）
            use: {
                charlotte: true,
                enable: ['chooseToUse', 'chooseToRespond'],
                filter(event, player) {
                    return player.getExpansions('bts_letu').length > 0;
                },
                chooseButton: {
                    dialog(event, player) {
                        return ui.create.dialog(
                            '乐土：将一张乐土牌当手牌使用或打出',
                            player.getExpansions('bts_letu'),
                            'hidden',
                        );
                    },
                    filter(button, player) {
                        const card = button.link;
                        const evt = _status.event.getParent();
                        return evt.filterCard(
                            get.autoViewAs(card, [card]),
                            player,
                            evt,
                        );
                    },
                    backup(links, player) {
                        const card = links[0];
                        return {
                            position: 'x',
                            selectCard: -1,
                            filterCard(card2) {
                                return card2 === card;
                            },
                            viewAs: {
                                name: get.name(card),
                                suit: get.suit(card),
                                number: get.number(card),
                                isCard: true,
                                storage: { bts_st_letu_use: true },
                            },
                            card: card,
                        };
                    },
                    prompt(links, player) {
                        return `乐土：将${get.translation(links[0])}当手牌使用或打出`;
                    },
                },
                subSkill: { backup: {} },
                ai: { order: 1, result: { player: 1 } },
            },
        },
        ai: { order: 6, result: { target: -1 } },
    },

    // ── 关联技·爱诗（源 st_aishi = 空触发技（纯标记），L9235-9241；由誓约授予黄金裔）──
    // 纯标记技能（参照无名杀国战"五虎将大旗"wuhujiangdaqi 范式：nopop+mark，自身无效果，
    // 被各黄金裔技能经 hasSkill('bts_st_aishi') 检测后在各自内部结算"诗歌"加成）；
    // intro 列出全部『××』之诗（对应 animal.lua L13739 现役版，按无名杀实际实现标注）。
    bts_st_aishi: {
        charlotte: true,
        nopop: true,
        mark: true,
        intro: {
            name: '爱诗',
            content:
                '<div style="margin-top:-5px">' +
                '<div class="skill">【浪漫】</div><div class="skillinfo">阿格莱雅发动「共舞」不会结束出牌阶段</div>' +
                '<div class="skill">【门径】</div><div class="skillinfo">缇宝发动「礼物」时自己额外获得1层暴击祝福</div>' +
                '<div class="skill">【纷争】</div><div class="skillinfo">万敌「血仇」造成伤害后获得等同体力上限祝福数的血仇标记</div>' +
                '<div class="skill">【生死】</div><div class="skillinfo">遐蝶「荒芜」新蕊标记上限+7</div>' +
                '<div class="skill">【理性】</div><div class="skillinfo">那刻夏「驱虚」概率+15%，成功后目标无升华则附加1层升华</div>' +
                '<div class="skill">【天空】</div><div class="skillinfo">风堇「晨昏」回复值+1</div>' +
                '<div class="skill">【诡计】</div><div class="skillinfo">赛飞儿「热情」视为使用【杀】不再有次数限制</div>' +
                '<div class="skill">【海洋】</div><div class="skillinfo">海瑟音「海曲」附加的绝海祝福层数+2</div>' +
                '<div class="skill">【律法】</div><div class="skillinfo">刻律德菈「军功」分摊时军功持有者额外+1升变</div>' +
                '<div class="skill">【岁月】</div><div class="skillinfo">长夜月发动「昼离」后获得1枚忆质标记</div>' +
                '<div class="skill">【大地】</div><div class="skillinfo">丹恒·腾荒「辟世」额外附加1层护盾</div>' +
                '<div class="skill">【誓约】</div><div class="skillinfo">昔涟「乐土」除外牌后获得1枚记忆标记</div>' +
                '</div>',
        },
    },
};

export const translate = {
    bts_xilian: '昔涟',
    bts_st_shiyue: '誓约',
    bts_st_shiyue_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以弃24枚${get.poptip('bts_glossary_jiyi_faq')}（若你为${get.poptip('bts_glossary_xingqi_faq')}或已发动过此技能则改为12枚）并选择一名角色：若其为黄金裔，其获得爱诗；否则其摸三张牌。首次发动后你获得乐土，选择任意名角色使其下次发动${get.poptip('bts_glossary_bisha_faq')}无视${get.poptip('bts_glossary_nuqi_faq')}代价；若你为${get.poptip('bts_glossary_xingqi_faq')}，这些角色各执行一个额外回合。`,
    bts_st_zhuiyi: '追忆',
    bts_st_zhuiyi_info: `锁定技，当你使用【杀】或【决斗】后，获得1枚${get.poptip('bts_glossary_jiyi_faq')}；【决斗】改为3枚。`,
    bts_st_zhongyuan: '众愿',
    bts_st_zhongyuan_info: `一名角色的回合结束时，若其不为你，其可以令你获得1枚${get.poptip('bts_glossary_jiyi_faq')}；否则，若你没有${get.poptip('bts_st_letu')}，你可以弃置一张【杀】获得3枚${get.poptip('bts_glossary_jiyi_faq')}，于下个回合的回合结束前拥有乐土。`,
    bts_st_letu: '乐土',
    bts_st_letu_info: `你可以将手牌【杀】当【决斗】使用；任意角色造成伤害后，若你拥有${get.poptip('bts_st_aishi')}，你将牌堆顶一张牌称为"乐土"（能当手牌使用或打出）置于武将牌上并获得1枚${get.poptip('bts_glossary_jiyi_faq')}，此乐土牌于你的下个出牌阶段开始时置入弃牌堆。`,
    bts_st_letu_use: '乐土',
    bts_st_aishi: '爱诗',
    bts_st_aishi_info: `昔涟授予黄金裔的标记。拥有${get.poptip('bts_st_aishi')}时，各黄金裔技能获得额外的"诗歌"效果（见技能详情）。（源为空技能纯标记，效果由各技能经 hasSkill 检测后自行结算）`,
    bts_jiyi: '记忆',
    bts_st_letu_active: '乐土状态',

    '$bts_st_shiyue1': "记忆的涟漪，等待被流星的亲吻唤醒——要用「爱」铭记我，在那美丽的明天",
    '$bts_st_shiyue2': "别眨眼哦，有惊喜~",
    '$bts_st_shiyue3': "愿「浪漫」永不离席",
    '$bts_st_shiyue4': "愿「门径」再无别离",
    '$bts_st_shiyue5': "愿「纷争」加冕成王",
    '$bts_st_shiyue6': "愿「生死」萌发新蕊",
    '$bts_st_shiyue7': "愿「理性」启蒙真理",
    '$bts_st_shiyue8': "愿「天空」治愈晨昏",
    '$bts_st_shiyue9': "愿「诡计」皆为游戏",
    '$bts_st_shiyue10': "愿「负世」照拂黎明",
    '$bts_st_shiyue11': "愿「海洋」奏响欢宴",
    '$bts_st_shiyue12': "愿「律法」遍入群星",
    '$bts_st_shiyue13': "愿「岁月」守望长夜",
    '$bts_st_shiyue14': "愿「大地」捍卫前路",
    '$bts_st_shiyue15': "愿「开拓」，共赴「爱」的约定♪",
    '$bts_st_shiyue16': "愿世界，如你我所愿",
    '$bts_st_zhuiyi1': "逃不掉哦~",
    '$bts_st_zhuiyi2': "翻开吧，永恒的一页",
    '$bts_st_zhuiyi3': "以爱为因，涤荡憎恨",
    '$bts_st_zhuiyi4': "以我为因，改写毁灭",
    '$bts_st_zhongyuan1': "百花啊，请为明天绽放",
    '$bts_st_zhongyuan2': "群星啊，请为英雄闪耀",
    '$bts_st_letu1': "收下吧，我们的答案~",
    '$bts_st_letu2': "让刹那，成为永恒~",
    '~bts_xilian': "我会…等你……",
};

export const simpleTranslate = {
    bts_st_shiyue_info: `${get.poptip('bts_glossary_bisha_faq')}；弃${get.poptip('bts_glossary_jiyi_faq')}让黄金裔拿爱诗，不然摸3；第一次发还送乐土和${get.poptip('bts_glossary_nuqi_faq')}豁免`,
    bts_st_zhuiyi_info: `锁；用杀记1、用决斗记3${get.poptip('bts_glossary_jiyi_faq')}`,
    bts_st_zhongyuan_info: `别人回合结束+1${get.poptip('bts_glossary_jiyi_faq')}；自己回合结束无乐土可弃杀+3重拿乐土（临时，下回合结束回收）`,
    bts_st_letu_info: `手牌杀当决斗；有${get.poptip('bts_st_aishi')}时任意伤害后白嫖1张乐土牌（可当手牌）并+1${get.poptip('bts_glossary_jiyi_faq')}`,
    bts_st_aishi_info: '标记；给黄金裔的"诗歌"加成（见技能详情）',
};

export const pinyins = { bts_xilian: 'xilian' };
