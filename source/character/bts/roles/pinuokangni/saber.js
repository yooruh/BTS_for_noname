// Saber（源 animal.lua L9249-9379）—— 圣剑、风王与炉心。
// 技能：圣剑（必杀技·风伤+圣剑状态+决斗转化）、风王（弃杀风伤累积炉心）、炉心（发动必杀技后+1炉心）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';import { extensionPath } from '../../../../tool/utils/paths.js';

export const sort = 'pinuokangni';
export const title = '风·毁灭·亚瑟王'; // 属性·命途
export const intro =
    `${B('Saber')}用${get.poptip('bts_sk_shengjian')}把【杀】当【决斗】用，靠${get.poptip('bts_sk_fengwang')}攒${get.poptip('bts_sk_luxin')}。`;

export const character = {
    bts_ch_saber: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_shengjian', 'bts_sk_fengwang', 'bts_sk_luxin'],
    },
};

export const skill = {
    // ── 必杀技·圣剑（源 st_shengjian = SkillCard + ZeroCardViewAsSkill，L9264-9327）──
    // 出牌阶段，失5怒气，对任意名其他角色各造成1点风属性通常伤害，获得圣剑状态
    // （手牌【杀】当【决斗】，使用【决斗】后解除，源 #shengjian_buff）。
    bts_sk_shengjian: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L9298）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9267）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_shengjian');
            lib.bts.api.loseAngry(player, 5); // 源 L9270：LoseAngry(player, 5)
            // 源 L9271-9273：星启时附加贯通祝福
            // 平衡改动（定夺）：出牌阶段叠1层会被当回合结束阶段自然衰减抹掉 → 改2层（源为1）。
            if (lib.bts.api.god(player)) await lib.bts.api.addBless(player, 'through', 2);
            for (const target of event.targets) {
                // 源 L9275：reason 含 "_wind_common"（风属性 + 通常伤害）
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_sk_shengjian_bts_reason_common_wind';
                lib.bts.api.setDamageNature(damage, 'wind');
                await damage;
            }
            // 源 L9277-9279：addPlayerMark(st_shengjian) + acquireSkill("#shengjian_buff")
            //（圣剑状态：手牌【杀】当【决斗】，使用【决斗】后解除）
            player.addMark('bts_mk_shengjian', 1);
            await player.addSkill('bts_sk_shengjian_buff');
            // 源 L9639-9647：星启额外——获得1枚命运标记；标记数为1时回复4点怒气；为3时弃全部命运标记
            if (lib.bts.api.god(player)) {
                player.addMark('bts_mk_fate', 1);
                if (player.countMark('bts_mk_fate') === 1)
                    lib.bts.api.addAngry(player, 4);
                if (player.countMark('bts_mk_fate') === 3)
                    player.removeMark(
                        'bts_mk_fate',
                        player.countMark('bts_mk_fate'),
                    );
            }
        },
        subSkill: {
            // ── 关联技·圣剑状态（源 shengjian_buff FilterSkill "#shengjian_buff" L9609-9621 + #shengjian_exbuff L9674-9683）──
            // 拥有圣剑标记时，你的手牌【杀】视为【决斗】（无目标数限制，源 extra_target +1000）；
            // 使用【决斗】后移除圣剑标记并卸除本技能（源 max_shengjian 全局 PreCardUsed L9660-9672）。
            buff: {
                sub: true,
                sourceSkill: 'bts_sk_shengjian',
                charlotte: true,
                enable: 'phaseUse',
                filter(event, player) {
                    // 源 view_filter（L9611-9612）：手牌且为【杀】（有圣剑标记时才挂载本技能）
                    return (
                        player.countMark('bts_mk_shengjian') > 0 &&
                        player.getCards('h').some((card) => get.name(card) === 'sha')
                    );
                },
                filterCard: (card) => get.name(card) === 'sha',
                position: 'h',
                selectCard: 1,
                filterTarget(card, player, target) {
                    // 源 FilterSkill 转化后的决斗是锦囊（无距离限制），目标规则仍走 canUse
                    //（canUse 第三参 false 跳过距离检查、保留 targetEnabled，同钺贯·bts_sk_yueguan_buff）
                    return player.canUse(card, target, false);
                },
                viewAs: {
                    name: 'juedou',
                    isCard: true,
                },
                mod: {
                    // 源 #shengjian_exbuff extra_target_func（L9678-9681）：有圣剑标记时决斗额外目标 +1000。
                    // range[1]=Infinity → 玩家可自选任意名目标（铁索连环同款「任意个目标」）；
                    // 勿用 -1：content.js L2229「range[1]<=-1」会走自动全选分支（对全部合法目标用决斗），
                    // 与源「玩家指定任意名」不符。
                    selectTarget(card, player, range) {
                        if (
                            player.countMark('bts_mk_shengjian') > 0 &&
                            get.name(card) === 'juedou'
                        )
                            range[1] = Infinity; // 目标数上限无穷（玩家自选任意名）
                    },
                },
                group: ['bts_sk_shengjian_buff_clear'],
                ai: {
                    // AI 口径：viewAs 型（无独立 content，不空转）：手牌【杀】当【决斗】（挂载期有杀即可用）；
                    // order 6=圣剑在身时愿意转化，目标由【决斗】卡牌 AI 与下方 result 决定（源 L9264-9327）。
                    order: 6,
                    // 目标：只决斗敌方；手牌少者更易落败、低血=击杀窗口
                    result: {
                        target: (player, target) => {
                            if (target === player) return -1;
                            if (get.attitude(player, target) >= 0) return -2;
                            let value = 1.2;
                            if (target.hp <= 1) value += 0.8; // 击杀窗口
                            if (target.countCards('h') === 0) value += 0.8; // 无手牌直接吃亏
                            return -value;
                        },
                    },
                },
            },
            // ── 关联技·圣剑解除（注册名 bts_sk_shengjian_buff_clear；父技能并入 subSkill 后
            //    按注册名规则升为兄弟键）──
            buff_clear: {
                sub: true,
                sourceSkill: 'bts_sk_shengjian_buff',
                // 源 max_shengjian 全局 PreCardUsed（L9665-9671）：使用【决斗】后
                // setPlayerMark(max_shengjian, 0) + detachSkill("#shengjian_buff") + filterCards
                trigger: { player: 'useCard' },
                forced: true,
                filter(event, player) {
                    return (
                        player.countMark('bts_mk_shengjian') > 0 &&
                        event.card?.name === 'juedou'
                    );
                },
                async content(event, trigger, player) {
                    player.removeMark(
                        'bts_mk_shengjian',
                        player.countMark('bts_mk_shengjian'),
                    );
                    player.removeSkill('bts_sk_shengjian_buff');
                    player.removeSkill('bts_sk_shengjian_buff_clear');
                },
            },
        },
        ai: {
            // AI 口径：代价=失5怒气；收益=对任意名角色各1点风伤（星启必杀+1、目标带异属性再相克+1）
            // ＋圣剑状态（手牌【杀】当【决斗】、无目标数限制，使用【决斗】后解除）。
            // 敌方越多/有击杀窗口/手握【杀】可转化时越积极；无敌方目标不发动（源 L9264-9327）。
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_shengjian')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1;
                const isGod = lib.bts.api.god(player);
                let value = 0;
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) >= 0) continue;
                    let damage = isGod ? 2 : 1; // 星启：必杀伤害+1（rules/globalrules.js L54-55）
                    const nature = lib.bts.api.getNature(null, target);
                    if (nature && nature !== 'wind') damage += 1; // 风与异属性相克+1（同文件 L56-64）
                    let v = damage * 1.5; // 1点伤害≈1.5评估单位
                    if (target.hp <= damage) v += 2.5; // 击杀
                    value += v;
                }
                if (!value) return -1; // 无敌方目标：不对友军出手
                if (player.countCards('h', 'sha') > 0) value += 1.5; // 圣剑状态有【杀】变现
                if (isGod) value += 0.5; // 贯通祝福+命运回复的小幅溢出
                return Math.max(1, Math.min(9, value));
            },
            result: {
                player: 1,
                // 目标受损=伤害d（星启+1、风相克+1）+击杀加分；友军/自己排除（源 L9267）
                target: (player, target) => {
                    if (target === player) return -1;
                    if (get.attitude(player, target) >= 0) return -2;
                    let damage = lib.bts.api.god(player) ? 2 : 1;
                    const nature = lib.bts.api.getNature(null, target);
                    if (nature && nature !== 'wind') damage += 1;
                    let v = damage * 1.5;
                    if (target.hp <= damage) v += 2.5;
                    return -v;
                },
            },
        },
    },

    // ── 主动技·风王（源 st_fengwang = OneCardViewAsSkill + SkillCard，L9329-9360）──
    // 出牌阶段限一次，弃置一张【杀】，对攻击范围内一名其他角色造成1点风属性伤害；累积炉心。
    bts_sk_fengwang: {
        enable: 'phaseUse',
        usable: 1, // 源 enabled_at_play（L9358）：not hasUsed("#st_fengwang")
        filterCard: (card) => get.name(card) === 'sha', // 源 filter_pattern = "Slash"
        position: 'h',
        selectCard: 1,
        filterTarget(card, player, target) {
            // 源 Card filter（L9337）：目标 ≠ 自己且在攻击范围内
            return target !== player && player.inRange(target);
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_fengwang');
            const target = event.targets[0];
            await player.discard(event.cards); // 源 L9352-9353：addSubcard 弃【杀】
            // 源 L9340：reason 含 "_wind" 的风属性伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_fengwang_wind';
            lib.bts.api.setDamageNature(damage, 'wind');
            await damage;
            // 源 L9341-9346：炉心<3 +1；=3 则弃3回怒
            if (player.countMark('bts_sk_luxin') < 3) player.addMark('bts_sk_luxin', 1);
            else {
                player.removeMark('bts_sk_luxin', 3);
                lib.bts.api.addAngry(player); // 源 L9345：AddAngry(player)
            }
        },
        ai: {
            // AI 口径：代价=弃一张【杀】（filterCard 保证）＋出牌阶段限一次；收益=对范围内一名敌方
            // 1点风伤（目标带异属性相克+1；非必杀伤害，无星启加成）+炉心进度（满3层回收1怒气）。
            // 无范围内敌方不发动；有击杀窗口/满炉心时更积极（源 L9329-9360）。
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_fengwang')) return -1;
                let hasEnemy = false;
                let killWindow = false;
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) >= 0) continue;
                    if (!player.inRange(target)) continue;
                    hasEnemy = true;
                    let damage = 1;
                    const nature = lib.bts.api.getNature(null, target);
                    if (nature && nature !== 'wind') damage += 1;
                    if (target.hp <= damage) killWindow = true;
                }
                if (!hasEnemy) return -1;
                let value = 4; // 1点风伤（≈1.5）+炉心累积
                if (killWindow) value += 2;
                const luxin = player.countMark('bts_sk_luxin');
                if (luxin >= 3) value += 1; // 满3层：本击回收1怒气
                else if (luxin === 2) value += 0.5; // 下击即满
                return Math.min(9, value);
            },
            result: {
                // 目标受损=1点风伤（相克+1）；友军/自己排除（源 L9337）
                target: (player, target) => {
                    if (target === player) return -1;
                    if (get.attitude(player, target) >= 0) return -1.5;
                    let damage = 1;
                    const nature = lib.bts.api.getNature(null, target);
                    if (nature && nature !== 'wind') damage += 1;
                    let v = damage * 1.5;
                    if (target.hp <= damage) v += 2;
                    return -v;
                },
            },
        },
    },

    // ── 锁定技·炉心（源 st_luxin = TriggerSkill Compulsory CardUsed，L9362-9377）──
    // 任意角色发动必杀技后，你获得1枚炉心标记。
    bts_sk_luxin: {
        // 非必杀技本体（锁定触发技）；filter 读的是触发技能（event.skill）的 bts_bisha 标签
        trigger: { global: 'useSkillAfter' },
        forced: true,
        filter(event, player) {
            // 源 L9368：使用 SkillCard 且技能名含 "max_"（必杀技）；
            // 无名杀以 bts_bisha 标签判定（勿用子串匹配如 includes('st_')）；
            // 源遍历所有炉心持有者、各得自己的标记 → 触发角色 ≠ 自己
            return (
                event.player !== player &&
                lib.skill[event.skill]?.bts_bisha === true
            );
        },
        async content(event, trigger, player) {
            // 源 L9371：p:gainMark("@st_luxin", 1)
            player.addMark('bts_sk_luxin', 1);
        },
        // 攒标进度在头像可见（真技能 mark:true 范式，素材文件名即技能 ID，见《标记系统规范》§一·规则1）
        mark: true,
        intro: {
            name: '炉心',
            content: (storage) => `当前有${storage}枚炉心。`,
        },
        markimage: `${extensionPath}/image/mark/bts_sk_luxin.png`,
    },

};

export const marks = {
    bts_mk_shengjian: { markKind: 'record' },
    bts_mk_fate: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_fate_faq',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_saber_skin1': '皮肤1',
    bts_mk_shengjian: '圣剑状态',
    bts_ch_saber: 'Saber',
    bts_sk_shengjian: '圣剑',
    bts_sk_shengjian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，对至少一名其他角色各造成1点${get.poptip('bts_glossary_nature_wind_dmg_faq')}通常伤害，令你的【杀】于下次使用【决斗】前视为【决斗】（无目标数限制），然后若你为${get.poptip('bts_glossary_xingqi_faq')}，你附加2层${get.poptip('bts_glossary_bless_through_faq')}，获得1枚${get.poptip('bts_glossary_fate_faq')}标记，然后若标记数为：1，你回复4点${get.poptip('bts_glossary_nuqi_faq')}；3，你弃全部${get.poptip('bts_glossary_fate_faq')}标记。`,
    bts_sk_fengwang: '风王',
    bts_sk_fengwang_info: `出牌阶段，你可以弃置一张【杀】，对攻击范围内一名其他角色造成1点${get.poptip('bts_glossary_nature_wind_dmg_faq')}伤害，累积${get.poptip('bts_sk_luxin')}。`,
    bts_sk_luxin: '炉心',
    bts_sk_luxin_info: `锁定技，当一名角色发动${get.poptip('bts_glossary_bisha_faq')}后，你获得1枚${get.poptip('bts_sk_luxin')}标记。`,

    '$bts_sk_shengjian1': "以星辰之光点亮大地",
    '$bts_sk_shengjian2': "Excalibur！",
    '$bts_sk_fengwang1': "敌寇，看剑！",
    '$bts_sk_fengwang2': "圣剑，解放！",
    '$bts_sk_luxin1': "燃烧吧，骑士之志！",
    '$bts_sk_luxin2': "飞舞吧，风暴！",
    '~bts_ch_saber': "抱歉…御主，我有负所托……",
    bts_mk_fate: '命运',
    bts_mk_fate_info: `来源：${get.poptip('bts_sk_shengjian')}${get.poptip('bts_glossary_bisha_faq')}（${get.poptip('bts_glossary_xingqi_faq')}）获得；标记数1回复4${get.poptip('bts_glossary_nuqi_faq')}，3弃全部重新积累`,
};

export const simpleTranslate = {
    bts_sk_shengjian_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}对至少1名其他角色各造成${get.poptip('bts_glossary_nature_wind_dmg_faq')}通常伤害，你的杀下次当决斗（无目标数限制）；${get.poptip('bts_glossary_xingqi_faq')}则+2层${get.poptip('bts_glossary_bless_through_faq')}并+1${get.poptip('bts_glossary_fate_faq')}（1回4${get.poptip('bts_glossary_nuqi_faq')}/3弃全部）`,
    bts_sk_fengwang_info: `出牌阶段弃杀对范围内角色造成风伤并攒${get.poptip('bts_sk_luxin')}`,
    bts_sk_luxin_info: `锁；任角色发动${get.poptip('bts_glossary_bisha_faq')}后+1${get.poptip('bts_sk_luxin')}`,
};

// 默认读音把拉丁名逐字符拆开（S a b e r）：按叁岛式以整词覆盖。
export const pinyins = {
    'Saber': ['Saber'],
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_fate_faq',
        name: '|命运|',
        info: `Saber 专属：${get.poptip('bts_sk_shengjian')}${get.poptip('bts_glossary_bisha_faq')}（${get.poptip('bts_glossary_xingqi_faq')}）获得；标记数1时回复4点${get.poptip('bts_glossary_nuqi_faq')}，3时弃全部标记重新积累。`,
    },
];
