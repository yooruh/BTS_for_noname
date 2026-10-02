// 椒丘（源 animal.lua L7278+）—— 鼎阵与烧伤扩散。
// 技能：鼎阵（必杀技·烧伤对齐最高值+鼎阵异常）、燔燎（失装备后弃杀加烧伤）、精味（必杀/燔燎/杀指定目标后加烧伤）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '火·虚无·曜青丹士'; // 属性·命途
export const intro =
    `${B('椒丘')}把${get.poptip('bts_glossary_abnormal_burn_faq')}层数对齐到最高，${get.poptip('bts_glossary_bisha_faq')}、链接和【杀】都能继续加炎伤。`;

export const character = {
    bts_ch_jiaoqiu: {
        sex: 'male',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_dingzhen', 'bts_sk_fanliao', 'bts_sk_jingwei'],
    },
};

export const skill = {
    // ── 必杀技·鼎阵（源 st_dingzhen = SkillCard + ZeroCardViewAsSkill，L6917-6945）──
    // 出牌阶段，失5怒气并选择至少一名其他角色，将其烧伤层数补至所选角色中的最高值，然后各附加1层鼎阵异常。
    bts_sk_dingzhen: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L6943）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6920）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_dingzhen');
            lib.bts.api.loseAngry(player, 5); // 源 L6923：LoseAngry(player, 5)
            // 源 L6924-6927：取目标中烧伤最高层数
            const max = Math.max(
                0,
                ...event.targets.map((target) =>
                    lib.bts.api.getAbnor(target, 'burn', -1),
                ),
            );
            for (const target of event.targets) {
                // 源 L6928-6930：AddAbnormal(p, "@abnormal_fire", n - 当前) —— 补足至最高
                const now = lib.bts.api.getAbnor(target, 'burn', -1);
                if (max > now)
                    lib.bts.api.addAbnormal(target, 'burn', max - now, player);
                // 源 L6931-6933：AddAbnormal(p, "@abnormal_dingzhen", 1, player)
                lib.bts.api.addAbnormal(target, 'dingzhen', 1, player);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_dingzhen') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·燔燎（源 st_fanliao = TriggerSkill CardsMoveOneTime + OneCardViewAsSkill，L6947-6978）──
    // 你失去装备区里的牌后，可弃置一张【杀】，令一名其他角色附加1层烧伤。
    bts_sk_fanliao: {
        trigger: { player: 'loseAfter' },
        filter(event, player) {
            // 源 L7337：move.from_places 含 PlaceEquip（从装备区失去牌）。loseAfter 触发时
            // 牌已 goto 移入目标区（弃牌堆/他人手牌），get.position 依当前 DOM 位置恒为
            // 'd'/'h'，须读原始来源区记录 event.getl(player).es（同桂乃芬·迎红 L79、
            // 开拓者·斗志 L179 范式）。且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                event.getl?.(player)?.es?.length > 0 &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6975：askForUseCard("@@st_fanliao") —— 弃【杀】选目标
            event.result = await player
                .chooseCardTarget({
                    prompt: '燔燎：弃置一张【杀】令一名其他角色附加烧伤',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    filterTarget: (card, source, target) => target !== source,
                    ai2: (target) => -get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            // 源 L6953：AddAbnormal(targets[1], "@abnormal_burn", 1, player)
            lib.bts.api.addAbnormal(event.targets[0], 'burn', 1, player);
            // 源 精味联动：燔燎 SkillCard 使用触发 TargetSpecified → 精味再+1烧伤
            //（源 st_fanliao 为 OneCardViewAsSkill 牌事件，无名杀直接结算，
            //  已修正：原实现精味从未触发、漏掉源"必杀技/燔燎/杀"三联动的燔燎分支）
            if (player.hasSkill('bts_sk_jingwei'))
                lib.bts.api.addAbnormal(event.targets[0], 'burn', 1, player);
        },
        ai: { result: { target: -1 } },
    },

    // ── 锁定技·精味（源 st_jingwei = TriggerSkill Compulsory TargetSpecified，L6980-6996）──
    // 你发动必杀技、发动燔燎或使用【杀】指定目标后，令其附加1层烧伤。
    bts_sk_jingwei: {
        trigger: { player: ['useCardToPlayered', 'useSkillAfter'] },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'useSkillAfter') {
                // 源 L6986：鼎阵（max_dingzhen 必杀技卡）TargetSpecified → 各目标+1烧伤。
                // 无名杀鼎阵为主动技不发牌事件，改经 useSkillAfter 以 bts_bisha 判定
                //（勿用子串匹配如 includes('st_')）。
                return lib.skill[event.skill]?.bts_bisha === true;
            }
            // 源 L6986：使用【杀】指定目标 → 各目标+1烧伤（燔燎联动见 st_fanliao content）
            return event.card?.name === 'sha';
        },
        async content(event, trigger, player) {
            // 源 L6991-6993：对所有目标 AddAbnormal(p, "@abnormal_burn", 1, player)
            if (event.triggername === 'useSkillAfter') {
                // 触发技技能事件（createTrigger）不复制 useSkill 的 targets（无 cost/logTarget 时
                // event.targets 为 undefined → event.targets.filter 抛 TypeError）；目标在触发源
                // useSkill 事件上（trigger.targets 恒为数组，见 player.useSkill 兜底 next.targets=[]）。
                for (const target of (trigger.targets || []).filter((t) => t.isAlive()))
                    lib.bts.api.addAbnormal(target, 'burn', 1, player);
                return;
            }
            if (trigger.target) lib.bts.api.addAbnormal(trigger.target, 'burn', 1, player);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_ch_jiaoqiu: '椒丘',
    bts_sk_dingzhen: '鼎阵',
    bts_sk_dingzhen_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，将其${get.poptip('bts_glossary_abnormal_burn_faq')}层数补至所选角色中的最高值，然后各附加1层${get.poptip('bts_glossary_abnormal_dingzhen_faq')}。`,
    bts_sk_fanliao: '燔燎',
    bts_sk_fanliao_info: `失去装备区里的牌后，你可以弃置一张【杀】，令一名其他角色附加1层${get.poptip('bts_glossary_abnormal_burn_faq')}。`,
    bts_sk_jingwei: '精味',
    bts_sk_jingwei_info: `锁定技，当你发动${get.poptip('bts_glossary_bisha_faq')}、发动${get.poptip('bts_sk_fanliao')}或使用【杀】指定目标后，令其附加1层${get.poptip('bts_glossary_abnormal_burn_faq')}。`,

    '$bts_sk_dingzhen1': "承蒙诸位赏脸……",
    '$bts_sk_dingzhen2': "来都来了，不如吃过再走",
    '$bts_sk_fanliao1': "还差点火候",
    '$bts_sk_fanliao2': "再来些大料",
    '$bts_sk_jingwei1': "添把火呗",
    '$bts_sk_jingwei2': "文火慢熬，抑或武火爆炒？",
    '~bts_ch_jiaoqiu': "对不起…将军……",
    bts_abnormal_dingzhen: '鼎阵',
};

export const simpleTranslate = {
    bts_sk_dingzhen_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令目标${get.poptip('bts_glossary_abnormal_burn_faq')}对齐最高值并各+1${get.poptip('bts_glossary_abnormal_dingzhen_faq')}`,
    bts_sk_fanliao_info: `失装备后可弃杀令1名其他角色+1${get.poptip('bts_glossary_abnormal_burn_faq')}`,
    bts_sk_jingwei_info: `锁；${get.poptip('bts_glossary_bisha_faq')}/${get.poptip('bts_sk_fanliao')}/杀指定目标后+1${get.poptip('bts_glossary_abnormal_burn_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_abnormal_dingzhen: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_dingzhen_faq',
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_dingzhen_faq',
        name: '|鼎阵|',
        info: `异常状态：由${get.poptip('bts_sk_dingzhen')}赋予（椒丘${get.poptip('bts_glossary_bisha_faq')}，同时令目标${get.poptip('bts_glossary_abnormal_burn_faq')}层数拉齐）；与${get.poptip('bts_glossary_abnormal_burn_faq')}结算联动。`,
    },
];
