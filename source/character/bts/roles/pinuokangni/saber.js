// Saber（源 animal.lua L9249-9379）—— 圣剑、风王与炉心。
// 技能：圣剑（必杀技·风伤+圣剑状态+决斗转化）、风王（弃杀风伤累积炉心）、炉心（发动必杀技后+1炉心）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';import { extensionPath } from '../../../../tool/utils/paths.js';

export const sort = 'pinuokangni';
export const title = '风·毁灭·亚瑟王'; // 属性·命途
export const intro =
    `${B('Saber')}用圣剑把【杀】当【决斗】用，靠风王攒炉心。`;

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
            if (lib.bts.api.god(player)) await lib.bts.api.addBless(player, 'through');
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
                ai: { order: 6, result: { target: -1 } },
            },
            // ── 关联技·圣剑解除（原 bts_sk_shengjian_buff.subSkill.clear；父技能并入本 parent
            //    的 subSkill 后按注册名规则升为兄弟键，保留 bts_sk_shengjian_buff_clear 注册名）──
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
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_shengjian')
                    ? -1
                    : 8;
            },
            result: { target: -1 },
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
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_fengwang') ? -1 : 5;
            },
            result: { target: -1 },
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
            // 无名杀以 bts_bisha 标签判定（勿用 includes('st_')，命中所有 bts_st_* 技能）；
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
        ai: { noe: true },
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
    bts_mk_shengjian: '圣剑状态',
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_saber_skin1': '皮肤1',
    bts_ch_saber: 'Saber',
    bts_sk_shengjian: '圣剑',
    bts_sk_shengjian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，对至少一名其他角色各造成1点${get.poptip('bts_glossary_nature_wind_dmg_faq')}通常伤害，令你的【杀】于下次使用【决斗】前视为【决斗】（无目标数限制），然后若你为${get.poptip('bts_glossary_xingqi_faq')}，你附加1层${get.poptip('bts_glossary_bless_through_faq')}，获得1枚${get.poptip('bts_glossary_fate_faq')}标记，然后若标记数为：1，你回复4点${get.poptip('bts_glossary_nuqi_faq')}；3，你弃全部${get.poptip('bts_glossary_fate_faq')}标记。`,
    bts_sk_fengwang: '风王',
    bts_sk_fengwang_info: `出牌阶段，你可以弃置一张【杀】，对攻击范围内一名其他角色造成1点${get.poptip('bts_glossary_nature_wind_dmg_faq')}伤害，累积炉心。`,
    bts_sk_luxin: '炉心',
    bts_sk_luxin_info: `锁定技，当一名角色发动${get.poptip('bts_glossary_bisha_faq')}后，你获得1枚炉心标记。`,

    '$bts_sk_shengjian1': "以星辰之光点亮大地",
    '$bts_sk_shengjian2': "Excalibur！",
    '$bts_sk_fengwang1': "敌寇，看剑！",
    '$bts_sk_fengwang2': "圣剑，解放！",
    '$bts_sk_luxin1': "燃烧吧，骑士之志！",
    '$bts_sk_luxin2': "飞舞吧，风暴！",
    '~bts_ch_saber': "抱歉…御主，我有负所托……",
    bts_mk_fate: '命运',
    bts_mk_fate_info: '来源：圣剑必杀（星启）获得；标记数1回复4怒气，3弃全部重新积累',
};

export const simpleTranslate = {
    bts_sk_shengjian_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}对至少1名其他角色各造成${get.poptip('bts_glossary_nature_wind_dmg_faq')}通常伤害，你的杀下次当决斗（无目标数限制）；${get.poptip('bts_glossary_xingqi_faq')}则+1层${get.poptip('bts_glossary_bless_through_faq')}并+1${get.poptip('bts_glossary_fate_faq')}（1回4${get.poptip('bts_glossary_nuqi_faq')}/3弃全部）`,
    bts_sk_fengwang_info: '出牌阶段弃杀对范围内角色造成风伤并攒炉心',
    bts_sk_luxin_info: `锁；任角色发动${get.poptip('bts_glossary_bisha_faq')}后+1炉心`,
};

export const pinyins = { bts_ch_saber: 'saber' };

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_fate_faq',
        name: '|命运|',
        info: `Saber 专属：${get.poptip('bts_sk_shengjian')}必杀（星启）获得；标记数1时回复4点怒气，3时弃全部标记重新积累。`,
    },
];
