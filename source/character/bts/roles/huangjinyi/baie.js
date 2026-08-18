// 白厄（源 animal.lua L8223-8485）—— 火种变身为卡厄斯兰那。
import { lib, game, get, B } from '../../shared.js';

// ── 燔世专用方法（角色技能特化，原在 rules/utils.js 全局 API，按 TODO 移入本技能 util；
//    经 bts_st_fanshi.util 挂载，跨文件以 lib.skill['bts_st_fanshi'].util.<fn> 访问）──

// 燔世·在场余众排队（源 L8441-8452）：从白厄起按逆时针（无名杀 findNext 即回合顺序方向）
// 收集在场的其他角色，至多 num 个；跳过已被除名（chuwai 离场）与非存活者，不含白厄自己。
export function fanshiOthers(player, num) {
    const others = [];
    if (!num || num <= 0) return others;
    const seen = new Set([player.playerid]);
    let current = player;
    while (others.length < num) {
        current = game.findNext(current);
        const pid = current?.playerid;
        if (!current || seen.has(pid)) break;
        seen.add(pid);
        if (current.isAlive() && !current.hasSkill('bts_st_fanshi_chuwai'))
            others.push(current);
    }
    return others;
}

// 燔世·夺牌（源 L8454-8462：每轮波次结束时白厄夺在场未除名者各一张 he 牌）。
// 由 bts_st_fanshi_huanyuan 波次结束/濒死路径调用；endFanshi 默认不再重复夺。
export async function stealFanshi(player) {
    if (!player.isAlive()) return;
    for (const p of lib.bts.api.otherAlive(player)) {
        if (p.countCards('he') > 0) await player.gainPlayerCard(p, 'he');
    }
}

// 白厄·燔世终止还原（源 st_fanshi L8475-8482）：除名恢复 + 变回白厄 + 扣回体力上限。
// 无名杀技能 content 一次跑完、insertPhase 只排队，故"跨回合挂起"由 bts_st_fanshi
// 的悬置触发在终止条件（死亡/场上无存活排队者）时调用本 API 完成收尾（技能 content 只经 lib.bts.* 访问）。
// 还原时机（源 st_fanshi）：①player 死亡（dieAfter）②player phaseEnd 且场上无存活持有排队 buff 者。
// 退回白厄时体力取「白厄体力上限」与「卡厄斯兰那当前生命值」的较小者，并额外获得一个出牌阶段。
// 变身侧（白厄→卡厄斯兰那）为满血由 st_fanshi 以 changeHero maxHp 显式设定。
export async function endFanshi(player, { skipSteal = false } = {}) {
    const isKaesilanna = (player.name1 || player.name) === 'bts_kaesilanna';
    const currentHp = player.hp; // 卡厄斯兰那当前生命值（还原前取，供取小）
    // 夺未除名（在场）角色各一张牌（源 L8454-8462：每轮波次结束时夺）。
    // skipSteal=true：夺牌已由调用方（bts_st_fanshi_huanyuan 波次结束处）完成，避免重复。
    // 被除名者仍处离场（out），被 this.otherAlive 的 filterPlayer 排除，故仅夺未除名者。
    if (!skipSteal && player.isAlive()) {
        for (const p of lib.bts.api.otherAlive(player)) {
            // noname 无 isNude()，判有牌用 countCards('he')（夺 he 牌）
            if (p.countCards('he') > 0) await player.gainPlayerCard(p, 'he');
        }
    }
    for (const p of player.storage.bts_fanshi_excluded || []) {
        if (
            p &&
            typeof p.hasSkill === 'function' &&
            p.hasSkill('bts_st_fanshi_chuwai')
        )
            p.removeSkill('bts_st_fanshi_chuwai');
    }
    delete player.storage.bts_fanshi_excluded;
    // 清理所有在场排队 buff 持有者（含白厄已死亡仍留场的情形）
    for (const p of game.filterPlayer((p) => p.hasSkill('bts_st_fanshi_buff'))) {
        delete p.storage.bts_fanshi_owner;
        p.removeSkill('bts_st_fanshi_buff');
    }
    delete player.storage.bts_fanshi_owner;
    player.removeMark('bts_fanshi_active', player.countMark('bts_fanshi_active'));
    player.removeMark('bts_fanshi_counter', player.countMark('bts_fanshi_counter'));
    const gain = player.countMark('bts_st_fanshi_gain');
    if (gain) {
        player.removeMark('bts_st_fanshi_gain', gain);
        await player.loseMaxHp(gain);
    }
    if (isKaesilanna) {
        const baseMax = lib.character.bts_baie?.[2] ?? player.maxHp;
        lib.bts.api.changeHero(player, 'bts_baie'); // 变回白厄：reinit 默认回白厄体力上限并满血
        if (player.isAlive()) {
            player.hp = Math.min(baseMax, currentHp); // 取白厄上限与卡厄斯兰那生命值的较小者
            // 修：原调不存在的 extraPlayPhase → TypeError；改 extraPhase 插入名为 bts_st_fanshi 的出牌阶段
            // （源 ExtraPhase(Play)，非回合）。turnName 显式传，使阶段事件命名可被策略识别/测试断言。
            lib.bts.api.extraPhase(player, 'phaseUse', null, 'bts_st_fanshi');
        }
    }
}

export const sort = 'huangjinyi';
export const title = '物理·毁灭·无名的英雄'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('白厄')}攒${get.poptip('bts_glossary_huozhong_faq')}开启燔世，自选要除名的角色变身满血卡厄斯兰那（把队友除名可免其被夺牌，连番出手），被排队的角色各出完手、或你撑不住时，再变回白厄并额外出牌。`;
export const character = {
    bts_baie: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_fanshi', 'bts_st_shenju', 'bts_st_pidi'],
    },
};
export const transformCharacter = {
    bts_kaesilanna: {
        isUnseen: true,
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: [
            'bts_st_fanshi_huanyuan',
            'bts_fanshi_duel',
            'bts_fanshi_slash',
            'bts_fanshi_draw',
        ],
    },
};

// 替代形态注册：让引擎识别「卡厄斯兰那」为白厄的 substitute/换形。
export const characterSubstitute = {
    bts_baie: [['bts_kaesilanna', []]],
};

// 燔世终止还原逻辑在本文件上方导出、经 bts_st_fanshi.util 挂载（叁岛 util 字段范式），
// 跨文件以 lib.skill['bts_st_fanshi'].util.endFanshi 访问；技能 content 只经 lib.bts.* / lib.skill.* 访问。

export const skill = {
    // ── 必杀技·燔世（源 st_fanshi = SkillCard + ZeroCardViewAsSkill + chuwai 子技，L8427-8496）──
    // 出牌阶段，弃12枚火种（星启且首次发动则6枚），变形为满血的卡厄斯兰那；选择任意名角色
    // 除名（移出游戏，不可选、无任何回合），体力上限增至除名数倍数并回复；夺在场者各一张牌，
    // 令场内其余角色（至多8个，白厄起逆时针）各排队一个"插入回合"——每当这些角色完成回合，
    // 白厄续一个额外出牌阶段；直到 ①场上无存活排队者（白厄回合结束）②白厄死亡，才恢复除名、
    // 变回白厄并扣回体力上限（体力取白厄上限与当前生命值较小者）+ 一个额外出牌阶段。
    // 注：太阳神 gainAnExtraTurn() 同步立即执行整回合，故除名/变身跨若干回合挂起；无名杀
    // 单次结算，故以「bts_st_fanshi_chuwai 离场 + bts_st_fanshi_buff 排队 buff + bts_st_fanshi
    // 悬置触发终止」等效复刻（见迁移记录「跨回合结算」适配）。
    bts_st_fanshi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // 角色技能特化方法（叁岛 util 字段范式）：燔世在场余众/夺牌/终止还原，见文件上方导出。
        util: { fanshiOthers, stealFanshi, endFanshi },
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8491-8495）：火种≥12（星启且首次则6）
            const threshold =
                lib.bts.api.god(player) && !player.countMark('bts_st_fanshi_used')
                    ? 6
                    : 12;
            return (
                player.countMark('bts_huozhong') >= threshold &&
                lib.bts.api.otherAlive(player).length > 0
            );
        },
        // 除名（移出游戏）目标于发动时经 filterTarget 选定：描述"令至少一名其他角色除外"，
        // 按用户定夺下限1（源代码 feasible=true 允许0，以描述为准）。
        // 发动确认阶段可取消（取消=不发动）；确认后 content 仅读 event.targets，不可再取消。
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_fanshi');
            const n =
                lib.bts.api.god(player) && !player.countMark('bts_st_fanshi_used')
                    ? 6
                    : 12;
            // 源 L8434-8436：弃火种 + 记已发动 + 变身卡厄斯兰那（变身持久，终止时才变回）
            // 源 ChangeHero(player, "kaesilanna")（L8245）继承当前体力（hp=min(4,白厄血)），
            // 非满血变身；满血量由后续 recover(hp*除名数) 按当前 hp 补（源 L8248，对齐"按原版"）。
            const konaMax = get.infoMaxHp(lib.character.bts_kaesilanna?.[2]);
            player.removeMark('bts_huozhong', n);
            player.addMark('bts_st_fanshi_used', 1);
            lib.bts.api.changeHero(player, 'bts_kaesilanna', { maxHp: konaMax });

            // 源 L8437（@@st_fanshi_chuwai!）：除名选择 → 真离场（无法选中/无回合）。
            // 目标已由 skill 级 filterTarget/selectTarget 于发动时选定（event.targets），此处仅读、不再交互。
            const excluded = event.targets || [];
            for (const p of excluded) p.addSkill('bts_st_fanshi_chuwai');
            player.storage.bts_fanshi_excluded = excluded;

            // 源 L8438-8440：体力上限 += maxHp*(count-1)；回复 hp*count 点体力
            const count = excluded.length;
            if (count > 0) {
                const gain = player.maxHp >= 1 ? player.maxHp * (count - 1) : 0;
                if (gain > 0) {
                    await lib.bts.api.gainMaxHp(player, gain);
                    player.addMark('bts_st_fanshi_gain', gain);
                }
                await player.recover(player, player.hp * count);
            }

            // 源 L8441-8452：给场内其余角色各排队一个"插入回合"（至多8个，白厄起逆时针）。
            // 无名杀不以立即 insertPhase N 次实现（那会一次插满整列），改为对每个在场剩余角色（不含白厄、
            // 至多8个）各授予一个 silent buff（bts_st_fanshi_buff）：每当这些角色完成回合（phaseEnd），
            // 白厄（卡厄斯兰那）logskill 燔世并续一个额外回合（insertPhase 'bts_st_fanshi'），随后移除该
            // buff。还原/每轮夺牌/濒死由 bts_st_fanshi_huanyuan 统一收尾（见该技），此处不立即终止。
            player.addMark('bts_fanshi_active', 1);
            const others = lib.skill['bts_st_fanshi'].util.fanshiOthers(player, 8);
            for (const target of others) {
                target.storage.bts_fanshi_owner = player; // 记录白厄（卡厄斯兰那）供续回合
                target.addSkill('bts_st_fanshi_buff');
            }

            // ★ 不在此恢复/变回：由 bts_st_fanshi 的悬置触发在终止时经 bts_st_fanshi.util.endFanshi 完成。
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_fanshi')
                    ? -1
                    : 8;
            },
            result: { player: 3, target: -1 },
        },
    },

    // ── 除名·离场（源 st_fanshi_chuwai alive=false，L8401-8422）──
    // 复刻无名杀"离场"（参考 qiang/guozhan diaohulishan，但不挪用彼技能本体）：
    // group:'undist' 使被除名者 getNext() 跳过其回合、且不可被选为目标；init 加 out class
    // 使其从场上消失。结算终止时 removeSkill 恢复。属持久技能（非 addTempSkill 的回合作用域）。
    bts_st_fanshi_chuwai: {
        group: 'undist',
        init(player) {
            if (player.isIn()) {
                game.broadcastAll((p) => p.classList.add('out'), player);
                game.log(player, '因【燔世】被除名，移出了游戏');
            }
        },
        onremove(player) {
            if (player.isOut()) {
                game.broadcastAll((p) => p.classList.remove('out'), player);
                game.log(player, '因【燔世】除名结束，移回了游戏');
            }
        },
    },

    // ── 燔世·续回合（隐藏 buff，授予在场其余角色，源 L8441-8452）──
    // silent、nopop、mark:false：每当持有者完成回合（phaseEnd），白厄（卡厄斯兰那）
    // logskill 燔世并续一个额外回合（insertPhase 'bts_st_fanshi'，整回合），随后移除本 buff。
    // （额外出牌阶段不要在此给——那是白厄在最后一个额外回合终止时才授予，见 endFanshi。）
    // 授予与归属：st_fanshi content 经 fanshiOthers 按逆时针授予；owner（白厄卡厄斯兰那）
    // 记在持有者 storage.bts_fanshi_owner 供续回合。
    bts_st_fanshi_buff: {
        trigger: { player: 'phaseEnd' },
        forced: true,
        silent: true,
        nopop: true,
        charlotte: true,
        async content(event, trigger, player) {
            const skillers = game.filterPlayer(current => {
                return current.hasSkill('bts_st_fanshi');
            });
            for (const skiller of skillers) {
                await skiller.logSkill('bts_st_fanshi');
                lib.bts.api.extraTurn(skiller, 'bts_st_fanshi'); // 显式命名额外回合，匹配注释「insertPhase 'bts_st_fanshi'」
            }
            player.removeSkill(event.name);
        },
        sub:true,
    },

    // ── 锁定技·身炬（源 st_shenju = TriggerSkill Compulsory CardsMoveOneTime/Damaged/HpRecover，L8322-8352）──
    // 其他角色令你回复体力、回复怒气、附加祝福或护盾、获得牌后，你受到伤害后，或你弃置【杀】后，
    // 若火种少于15枚，你获得1枚火种。
    // （怒气/祝福/护盾三触发源代码未实现，按用户定夺补：在 lib.bts.api.addAngry/addBless/addShield
    //   以 from !== player 挂钩，见 rules/utils.js，与寸强 cunqiang 同款模式。）
    bts_st_shenju: {
        // 四件事以你为当事人（event.player === 你）：用 player:，引擎只在 event.player===你 时触发
        // filter 第 3 参 triggername 是带 Before/After 后缀的完整触发名（event.name/filter 的 event 为基名）。
        trigger: {
            player: ['gainAfter', 'recoverEnd', 'damageEnd', 'loseAfter'],
        },
        forced: true,
        filter(event, player, triggername) {
            // 源 L8345：火种<15 才触发
            if (player.countMark('bts_huozhong') >= 15) return false;
            // 源 L8341-8344：你受到伤害
            if (triggername === 'damageEnd') return event.num > 0;
            // 源 L8340：其他角色令你回复体力（self 回血不计）
            if (triggername === 'recoverEnd')
                return event.num > 0 && event.source && event.source !== player;
            // 源 L8331-8332：其他角色令你获得牌（self 得牌不计）
            if (triggername === 'gainAfter') return event.source && event.source !== player;
            // 源 L8334-8339：你从手牌弃置【杀】
            const lost = event.getl?.(player);
            return (
                event.type === 'discard' &&
                Boolean(lost?.hs?.some((card) => get.name(card) === 'sha'))
            );
        },
        async content(event, trigger, player) {
            // 源 L8347：player:gainMark("@huozhong")
            if (player.countMark('bts_huozhong') < 15) player.addMark('bts_huozhong', 1);
        },
        ai: { noe: true },
    },

    // ── 触发技·辟地（源 st_pidi = TriggerSkill Damage，L8353-8363）──
    // 当你造成伤害后，你可以弃置一张【杀】获得1枚火种。
    bts_st_pidi: {
        // 源 st_pidi events={sgs.Damage}，Damage 以 damage.from（来源）触发；描述"造成伤害后"，
        // player: 会误在受伤时触发，应 source:。
        trigger: { source: 'damageEnd' },
        filter(event, player) {
            // 源 L8357：造成伤害且火种<15、手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                event.num > 0 &&
                player.countMark('bts_huozhong') < 15 &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L8357：askForCard(player, "Slash") —— 仅选择弃【杀】，弃牌移入 content 结算
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '辟地：是否弃置一张【杀】获得1枚火种？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌在技能事件 event.cards（标准约定）
            if (event.cards) await player.discard(event.cards);
            // 源 L8359：player:gainMark("@huozhong")
            if (player.countMark('bts_huozhong') < 15) player.addMark('bts_huozhong', 1);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·燔世（源 st_fanshi = TriggerSkill Compulsory EventPhaseStart/EnterDying/Death，L8366-8392）──
    // 还原白厄（源 L8475-8482）的时机：①player 进入濒死（EnterDying）→ 回复至1点、阻断濒死（不死）、
    //   提前还原（源 L8377-8381，st_fanshi_dying 中断额外回合波次——对应"于你下次进入濒死状态前"）；
    // ②player 死亡（dieAfter）→ 还原除名；③player 回合结束（phaseEnd）且场上无存活排队者 → 还原，
    //   若拥有爱诗（『负世』诗，源 L8284-8294）则先可选弃所有手牌重复燔世流程，否则 +6 火种并还原。
    // （注：白厄的额外出牌阶段由 buff（bts_st_fanshi_buff）在其余角色回合结束时续给，不在本技；
    //      还原交由 endFanshi 统一收尾；也不用 phaseZhunbeiBegin 兜底——白厄自续的额外回合同样以其开始，会误触还原。）
    bts_st_fanshi_huanyuan: {
        trigger: { player: ['dying', 'phaseEnd', 'dieAfter'] },
        forced: true,
        filter(event, player, triggername) {
            if (!player.countMark('bts_fanshi_active')) return false;
            // filter 第 3 参 triggername 为带后缀完整触发名（event.name 是基名）
            if (triggername === 'dieAfter') return event.player === player;
            // 源 L8377-8381：燔世期间进入濒死即触发（神躯防御：回1不死）
            if (triggername === 'dying') return true;
            // 条件③：自己的回合结束且场上无存活 buff 持有者才还原；
            // 若仍有人持 buff，则那是「排队」未完，不还。
            return !game.hasPlayer(
                (p) => p.isAlive() && p.hasSkill('bts_st_fanshi_buff'),
            );
        },
        async content(event, trigger, player) {
            if (event.triggername === 'dying') {
                // 源 L8377-8381：回复至1点 + return true 阻断濒死（不死）；
                // st_fanshi_dying 中断额外回合波次 → 先夺牌（源 L8454-8462 波次结束夺）再提前还原
                if (player.hp < 1) await player.recover(player, 1 - player.hp);
                trigger.cancel();
                await lib.skill['bts_st_fanshi'].util.stealFanshi(player);
                await lib.skill['bts_st_fanshi'].util.endFanshi(player, { skipSteal: true });
                return;
            }
            if (event.triggername === 'dieAfter') {
                // 源 st_fanshi Death（L8383-8389）：只还原除名，不夺牌
                await lib.skill['bts_st_fanshi'].util.endFanshi(player, { skipSteal: true });
                return;
            }
            // phaseEnd：波次结束 → 每轮夺牌（源 L8454-8462），再判爱诗『负世』重复或收尾
            await lib.skill['bts_st_fanshi'].util.stealFanshi(player);
            if (player.hasSkill('bts_st_aishi')) {
                // 源 L8284-8294（爱诗『负世』诗）：可弃所有手牌重复燔世流程，否则 +6 火种退出
                const choice = await player
                    .chooseBool('负世：弃置所有手牌，重复燔世流程？')
                    .set('ai', () => false)
                    .forResult();
                if (choice.bool) {
                    // 源 L8287：throwAllHandCards() 弃所有手牌后重复流程（while 再来一轮）
                    const hands = player.getCards('h');
                    if (hands.length) await player.discard(hands);
                    const others = lib.skill['bts_st_fanshi'].util.fanshiOthers(player, 8);
                    for (const target of others) {
                        target.storage.bts_fanshi_owner = player;
                        target.addSkill('bts_st_fanshi_buff');
                    }
                    return; // 不还原，继续波次
                }
                player.addMark('bts_huozhong', 6); // 源 L8291：爱诗退出时 +6 火种
            }
            // 终止还原：还原除名/扣体力上限/变回白厄；endFanshi 据存活与否取体力并授额外出牌阶段
            await lib.skill['bts_st_fanshi'].util.endFanshi(player, { skipSteal: true });
        },
        // 神躯限制（源 st_fanshi 描述"其他角色不是你使用非视为或非转化的牌的合法目标"，
        // 按用户定夺实现）：变身期间卡厄斯兰那只能使用技能（视为/转化，如血棘/弑魂/天裁）
        // 或响应他人使用的牌，不能主动使用非转化的实体牌（isVirtual=false）。
        mod: {
            cardEnabled(card, player) {
                if (player.countMark('bts_fanshi_active') <= 0) return;
                if (get.itemtype(card) !== 'card') return;
                if (!card.isVirtual) return false;
            },
        },
        ai: { noe: true },
    },

    // ── 变身技·血棘（源 fanshi_duel = ViewAsSkill n=2，L8394-8414）──
    // 出牌阶段，你可以弃置两张手牌，视为使用【决斗】，然后结束出牌阶段。
    // （源 enabled_at_play 三技互斥：血棘/弑魂需"未用血棘（永久）&& 弑魂本回合未用 &&
    //   （天裁本回合未用 || 天裁强化）"；用 useSkill 历史按回合近似源 hasUsed）
    bts_fanshi_duel: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8411）：手牌≥2、未用血棘（永久 -play）、弑魂本回合未用、
            // 且（天裁本回合未用 || 天裁强化 fanshi_draw-play）
            const slashUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_fanshi_slash')
                .length > 0;
            const drawUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_fanshi_draw')
                .length > 0;
            return (
                !player.countMark('fanshi_duel-play') &&
                !slashUsed &&
                (!drawUsed || player.countMark('fanshi_draw-play') > 0) &&
                player.countCards('h') >= 2
            );
        },
        filterCard() {
            return true; // 源 view_filter（L8398-8400）：任意两张牌
        },
        position: 'h',
        selectCard: 2, // 源 n=2（L8396）
        filterTarget(event, player, target) {
            // 决斗目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_fanshi_duel');
            const target = event.targets[0];
            await player.discard(event.cards);
            player.addMark('fanshi_duel-play', 1);
            // 源 L8403-8406：克隆 duel 并使用
            await player.useCard(
                {
                    name: 'juedou',
                    isCard: true,
                    storage: { bts_fanshi_duel: true },
                },
                target,
            );
            // 源 L8419：Global_PlayPhaseTerminated 结束出牌阶段
            player.skip('phaseUse');
        },
        ai: { order: 7, result: { target: -2 } },
    },

    // ── 变身技·弑魂（源 fanshi_slash = ViewAsSkill n=999 + SkillCard，L8415-8451）──
    // 出牌阶段，你可以弃置等同于其他角色数的手牌，令所有其他角色各执行一个额外回合，
    // 然后视为对这些角色使用【杀】，并结束出牌阶段。
    bts_fanshi_slash: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8448）：手牌≥其他角色数、未用血棘（永久）、弑魂本回合未用、
            // 且（天裁本回合未用 || 天裁强化）
            const count = lib.bts.api.otherAlive(player).length;
            const slashUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_fanshi_slash')
                .length > 0;
            const drawUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_fanshi_draw')
                .length > 0;
            return (
                count > 0 &&
                !player.countMark('fanshi_duel-play') &&
                !slashUsed &&
                (!drawUsed || player.countMark('fanshi_draw-play') > 0) &&
                player.countCards('h') >= count
            );
        },
        filterCard() {
            return true; // 源 view_filter（L8435）：非装备牌
        },
        position: 'h',
        selectCard(event, player) {
            // 源 L8438：弃牌数 == 其他角色数
            return lib.bts.api.otherAlive(player).length;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_fanshi_slash');
            const targets = lib.bts.api.otherAlive(player);
            await player.discard(event.cards);
            // 弑魂"已用"以 useSkill 历史按回合跟踪（源 hasUsed("#fanshi_slash")），不设永久标记
            player.skip('phaseUse'); // 源 L8419：Global_PlayPhaseTerminated
            // 源 L8421-8425：其他角色各执行额外回合
            for (const target of targets) lib.bts.api.extraTurn(target, 'bts_extra_turn');
            // 源 L8426：ViewAsCard 对所有其他角色使用【杀】
            for (const target of targets.filter((target) => target.isAlive()))
                await player.useCard(
                    {
                        name: 'sha',
                        isCard: true,
                        storage: { bts_fanshi_slash: true },
                    },
                    target,
                );
        },
        ai: { order: 6, result: { player: 1, target: -1 } },
    },

    // ── 变身技·天裁（源 fanshi_draw = ZeroCardViewAsSkill + SkillCard，L8452-8484）──
    // 出牌阶段，你可以将手牌摸至七张（至多摸四张），然后等同摸牌数的次数令随机其他角色附加烈阳；
    // 所有处于烈阳的角色弃置一张手牌并移除1层烈阳。
    bts_fanshi_draw: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8482）：手牌<7、天裁/弑魂本回合未用、未用血棘（永久）
            const slashUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_fanshi_slash')
                .length > 0;
            const drawUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_fanshi_draw')
                .length > 0;
            return (
                !player.countMark('fanshi_duel-play') &&
                !slashUsed &&
                !drawUsed &&
                player.countCards('h') < 7 &&
                lib.bts.api.otherAlive(player).length > 0
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_fanshi_draw');
            // 源 L8456：x = min(7-手牌, 4)，摸 x 张
            const amount = Math.min(7 - player.countCards('h'), 4);
            await player.draw(player, amount);
            // 源 L8458-8462：x 次令随机其他角色附加烈阳
            for (let index = 0; index < amount; index++) {
                const targets = lib.bts.api.otherAlive(player);
                if (!targets.length) break;
                const target =
                    targets[Math.floor(Math.random() * targets.length)];
                lib.bts.api.addAbnormal(target, 'lieyang', 1, player);
            }
            // 源 L8464-8469：所有烈阳角色弃1手牌并移除1层烈阳
            for (const target of game.filterPlayer(
                (target) =>
                    lib.bts.api.getAbnor(target, 'lieyang') && target.countCards('h'),
            )) {
                await target.chooseToDiscard(
                    '天裁：弃置一张手牌',
                    'h',
                    1,
                    true,
                );
                lib.bts.api.removeAbnormal(target, 'lieyang', 1);
            }
            // 源 L8470-8472：星启且摸满4张时记录 fanshi_draw-play（可保留出牌阶段）
            if (lib.bts.api.god(player) && amount === 4)
                player.addMark('fanshi_draw-play', 1);
            else player.skip('phaseUse');
        },
        ai: { order: 5, result: { player: 2, target: -1 } },
    },
};

export const translate = {
    bts_baie: '白厄',
    bts_kaesilanna: '卡厄斯兰那',
    bts_st_fanshi: '神躯',
    bts_st_fanshi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，弃12枚${get.poptip('bts_glossary_huozhong_faq')}（若你为${get.poptip('bts_glossary_xingqi_faq')}且首次发动则改为6枚），变形为卡厄斯兰那（继承当前体力）。选择任意名其他角色除名（移出游戏，不可选、无任何回合），你的体力上限增至除名数的倍数并回复体力；然后令场内其余角色（至多8个，自你起逆时针的顺序）各排队一个插入回合——每当这些角色完成回合，你（卡厄斯兰那）续一个额外回合。变身期间你进入濒死状态时，回复至1点体力（不会死亡）并提前终止。当场上无存活已排队的角色，或你死亡时，被除名者回归，你变回白厄并扣回体力上限，体力取白厄体力上限与你当前生命值的较小者，夺未除名在场者各一张牌，并获得一个额外的出牌阶段（不是回合）。若你拥有${get.poptip('bts_st_aishi')}，每次波次结束时你可以弃置所有手牌重复燔世流程，否则获得6枚${get.poptip('bts_glossary_huozhong_faq')}并终止。`,

    bts_st_fanshi_chuwai: '燔世',
    bts_st_fanshi_buff: '燔世·续',
    bts_st_shenju: '身炬',
    bts_st_shenju_info: `锁定技，其他角色令你回复体力、回复${get.poptip('bts_glossary_nuqi_faq')}、附加祝福或${get.poptip('bts_glossary_hudun_faq')}、获得牌后，你受到伤害后，或你弃置【杀】后，若${get.poptip('bts_glossary_huozhong_faq')}少于15枚，你获得1枚${get.poptip('bts_glossary_huozhong_faq')}。`,
    bts_st_pidi: '辟地',
    bts_st_pidi_info: `当你造成伤害后，你可以弃置一张【杀】获得1枚${get.poptip('bts_glossary_huozhong_faq')}。`,
    bts_st_fanshi_huanyuan: '燔世',
    bts_st_fanshi_huanyuan_info:
        '锁定技，变身期间，每当已排队的角色完成回合，你续一个额外回合；变身期间你进入濒死状态时，回复至1点体力（不会死亡）并提前终止；当场上无存活已排队角色时，或你死亡时，变回白厄并扣回体力上限（体力取白厄体力上限与当前生命值的较小者），夺未除名在场者各一张牌，并获得一个额外的出牌阶段（不是回合）。若你拥有爱诗，波次结束时你可以弃置所有手牌重复燔世流程，否则获得6枚火种并终止。',
    bts_fanshi_duel: '血棘',
    bts_fanshi_duel_info:
        '出牌阶段，你可以弃置两张手牌，视为使用【决斗】，然后结束出牌阶段。',
    bts_fanshi_slash: '弑魂',
    bts_fanshi_slash_info:
        '出牌阶段，你可以弃置等同于其他角色数的手牌，令所有其他角色各执行一个额外回合，然后视为对这些角色使用【杀】，并结束出牌阶段。',
    bts_fanshi_draw: '天裁',
    bts_fanshi_draw_info: `出牌阶段，你可以将手牌摸至七张（至多摸四张），然后等同于摸牌数的次数令随机其他角色附加${get.poptip('bts_glossary_abnormal_lieyang_faq')}；所有处于${get.poptip('bts_glossary_abnormal_lieyang_faq')}的角色弃置一张手牌并移除1层${get.poptip('bts_glossary_abnormal_lieyang_faq')}。若你不为${get.poptip('bts_glossary_xingqi_faq')}或以此法获得的牌数小于4，结束出牌阶段。`,
    bts_huozhong: '火种',
    bts_abnormal_lieyang: '烈阳',
    bts_st_fanshi_used: '燔世已发动',
    bts_fanshi_active: '燔世状态',

    '$bts_st_fanshi1': "亿万火种之怒，燃尽此身！",
    '$bts_st_fanshi2': "赐你，众星俱焚的曙光",
    '$bts_st_shenju1': "无论等待多久，我都不会放弃",
    '$bts_st_shenju2': "点燃黎明！",
    '$bts_st_pidi1': "新世界，终将到来！",
    '$bts_st_pidi2': "为了，下一个明天！",
    '$bts_fanshi_draw1': "以新生的烈阳，撕裂长空！",
    '$bts_fanshi_duel1': "一具空壳而已",
    '$bts_fanshi_slash1': "以血，淬火！",
    '$bts_st_fanshi_huanyuan1': "熔毁长夜吧！",
    '$bts_fanshi_draw2': "以旧日余烬，为来世破晓！",
    '$bts_fanshi_duel2': "徒有虚表的灵魂",
    '$bts_fanshi_slash2': "铭记这道痛楚！",
    '$bts_st_fanshi_huanyuan2': "挣脱囚笼吧！",
    '$bts_fanshi_slash3': "烙印纷争之名！",
    '~bts_baie': "我不会…忘记……",
    '~bts_kaesilanna': "我不会…忘记……",
};
export const simpleTranslate = {
    bts_st_fanshi_info: `${get.poptip('bts_glossary_bisha_faq')}；弃${get.poptip('bts_glossary_huozhong_faq')}变身卡厄斯兰那（继承当前体力），自选要除名的角色（把队友除名可免其被夺牌所伤）并涨体力上限回血，其余在场者各排队一个插入回合（至多8，自你起逆时针），谁完成回合你就续一个额外回合；变身期濒死回1不死亡并提前收尾；等排队的都出完手（或你死亡）才变回白厄并夺未除名者各一张牌，取体力较小者并额外出牌（非回合）；${get.poptip('bts_st_aishi')}时可弃手牌重复流程或+6${get.poptip('bts_glossary_huozhong_faq')}收手`,
    bts_st_shenju_info: `锁；别人奶你/给你牌、你受伤或弃杀后+1${get.poptip('bts_glossary_huozhong_faq')}（封顶15）`,
    bts_st_pidi_info: `造成伤害后，可弃杀+1${get.poptip('bts_glossary_huozhong_faq')}`,
    bts_st_fanshi_huanyuan_info: '锁；变身时排队的角色打完回合你续一个额外回合，全部排完（或你死亡/濒死回1提前收）才还原白厄，夺未除名者各一张牌并额外出牌（非回合）；爱诗可弃手牌重复或+6火种',
    bts_fanshi_duel_info: '弃2手牌当决斗用完就收手',
    bts_fanshi_slash_info: '按场上人数弃手牌，等他们额外回合走完再一人一发虚拟杀',
    bts_fanshi_draw_info: `摸到7张（至多4），随机给人挂${get.poptip('bts_glossary_abnormal_lieyang_faq')}，带${get.poptip('bts_glossary_abnormal_lieyang_faq')}的角色挨个弃牌；非${get.poptip('bts_glossary_xingqi_faq')}或摸不足4结束出牌阶段`,
};
export const pinyins = { bts_baie: 'baie', bts_kaesilanna: 'kaesilanna' };
