// 白厄（源 animal.lua L8223-8485）—— 火种变身为卡厄斯兰那。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';

// 查看白厄变化前，请查看git变动和文档变动，部分底层以更改，如ID命名方法

// 重要修改，需同步全项目的对应内容：修改export中各条目的顺序为以下顺序
export const sort = 'huangjinyi';
export const title = '物理·毁灭·无名的英雄'; // 属性·命途
export const intro = `${B('白厄')}攒${get.poptip('bts_glossary_huozhong_faq')}除名场上任意数量角色后，变身满血${get.poptip('bts_ch_kaesilanna')}（点击即可查看变身后的技能），令其余角色依次各执行一个额外回合，或阵亡后，再变回白厄并获得出牌阶段。`;
export const character = {
    bts_ch_baie: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_fanshi', 'bts_sk_shenju', 'bts_sk_pidi'],
    },
};
export const transformCharacter = {
    bts_ch_kaesilanna: {
        isUnseen: true,
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        // 注意：子技默认随父技聚合注册；变身期 bts_sk_fanshi 本体被 reinit 移除，
        // 故“变身期延后结算”类子技（波次驱动/推进、弑魂收尾）须显式列入本表。
        skills: [
            'bts_sk_fanshi_huanyuan',
            'bts_sk_fanshi_drive',
            'bts_sk_fanshi_drive_skip',
            'bts_sk_xueji',
            'bts_sk_shihun',
            'bts_sk_shihun_tail',
            'bts_sk_tiancai',
        ],
    },
};

// 替代形态注册：让引擎识别「卡厄斯兰那」为白厄的 substitute/换形。
export const characterSubstitute = {
    bts_ch_baie: [['bts_ch_kaesilanna', []]],
};

// 燔世延后结算的“发回合/夺牌/收尾/还原”逻辑在本文件上方导出、经 bts_sk_fanshi.util 挂载
// （叁岛 util 字段范式），跨文件以 lib.skill['bts_sk_fanshi'].util.<fn> 访问；技能 content 只经
// lib.bts.* / lib.skill.* 访问。util 成员：
//   fanshiOthers / issueFanshiTurn / advanceFanshiChain / pushFanshiEvent /
//   stealFanshi / settleFanshi / endFanshi。

// 燔世·在场余众排队（源 L8441-8452）：从白厄起按逆时针（无名杀 getNext 即回合顺序方向）
// 收集在场的其他角色；跳过已被除名（离场）与非存活者，不含白厄自己。
export function fanshiOthers(player) {
    const others = [];
    const seen = new Set([player.playerid]);
    let current = player;
    while (true) {
        // 真实引擎 game.findNext 用 `>= position` 比较会返回玩家自己（非“下一位”），
        // 故逆时针迭代改走 player.getNext()：沿 .next 环找下一位，跳过 undist（除名/离场）者，
        // 回到自己或场上无其他可遍历者时返回 null，配合 seen 兜底成环即停。
        current = current.getNext();
        const pid = current?.playerid;
        if (!current || seen.has(pid)) break;
        seen.add(pid);
        if (current.isAlive() && !current.hasSkill('bts_sk_fanshi_chuwai')) {
            others.push(current);
        }
    }
    return others;
}

// 燔世·链事件（推进步骤）：把自定义事件排入“当前回合的父事件队列”（与 insertPhase 相同的父级
// 定位逻辑），从而与白厄伪回合（extraPhase 排入同一队列）保持 FIFO：伪回合先执行、推进步骤紧随其后。
// content 允许 async，可 await settleFanshi 的交互（夺牌/爱诗问询）。
export function pushFanshiEvent(player, content, name = 'bts_fanshi_step') {
    const current = _status.event?.getParent?.('phase');
    let host = null;
    if (current && current.parent && current.parent.next) {
        host = current.parent;
    } else if (_status.event?.parent && _status.event.parent.next) {
        host = _status.event.parent;
    }
    if (!host) return null; // 非预期调用场景（无宿主队列）：宁可留待 huanyuan 兜底，也不落成孤儿事件
    const next = game.createEvent(name, false, host);
    next.player = player;
    next.forceDie = true;
    next.includeOut = true;
    next.setContent(content);
    return next;
}

// 燔世·波次链推进（每个波次回合结束时调用，入口：drive / drive_skip）：
// ① 给白厄排一个“只有出牌阶段”的伪回合（源 ExtraPhase(Play)：每当一个燔世回合结束，卡厄斯兰那执行
//    一个额外出牌阶段，阶段而非回合、无摸牌）；② 其后排一个推进步骤事件：濒死中断 → 收尾；
//    名单已尽（每名未除名者各已执行一个额外回合）→ 收尾；否则发下一个波次回合。
// 两步都排入当前回合的父级队列（FIFO：伪回合 → 步骤），不再依赖白厄出牌阶段结束的触发锚点
// （原 progress 的 phaseUseEnd/phaseAfter 双锚点实机去重失效、且会在真实回合末误发，已删除）。
// 链中标记 bts_fanshi_chain：伪回合结束到步骤执行之间为 true，供 huanyuan 的 phaseEnd 兜底避让。
export function advanceFanshiChain(player) {
    if (player.getStorage('bts_mk_fanshi_active', 0) <= 0) return;
    lib.bts.api.extraPhase(player, 'phaseUse', null, 'bts_sk_fanshi');
    player.storage.bts_fanshi_chain = true;
    pushFanshiEvent(player, async (event, trigger, owner) => {
        delete owner.storage.bts_fanshi_chain; // 推进步骤已到：解除兜底避让
        if (owner.getStorage('bts_mk_fanshi_active', 0) <= 0) return;
        if (owner.getStorage('bts_mk_fanshi_ending', 0) > 0) {
            // 濒死中断：不再发放新回合，转入收尾（源 L8776 起 break → 收尾段）。
            // 收尾门控：弑魂链未完成时先等待（tail 完成时补触发），避免抢先还原吞掉追斩。
            await maybeSettleFanshi(owner);
            return;
        }
        if (!lib.skill['bts_sk_fanshi'].util.issueFanshiTurn(owner)) {
            // 名单已尽 → 波次结束，进入收尾（夺牌→爱诗→还原）；门控同上（等弑魂链完成）。
            await maybeSettleFanshi(owner);
        }
    });
}

// 燔世·夺牌（源 L8454-8462：每轮波次结束时白厄夺在场未除名者各一张 he 牌）。
// 由 settleFanshi（波次结束/中断后的收尾）调用；名单一律取 fanshiOthers（存活且未除名）。
export async function stealFanshi(player) {
    if (!player.isAlive()) return;
    for (const p of fanshiOthers(player)) {
        if (p.countCards('he') > 0) await player.gainPlayerCard(p, 'he');
    }
}

// 白厄·燔世·只读查看下一名可发目标（不发回合、不动队列）：名单取尽（其余候选均死亡/除名）时
// 返回 null。供收尾门控（maybeSettleFanshi）判定“名单已尽”而不产生副作用。
export function peekFanshiTarget(player) {
    const queue = player.storage.bts_fanshi_queue || [];
    return (
        queue.find(
            (candidate) =>
                candidate && candidate.isAlive() && !candidate.hasSkill('bts_sk_fanshi_chuwai'),
        ) || null
    );
}

// 白厄·燔世·收尾门控（对齐源版同步语义：收尾必晚于全部已发结算——尤其弑魂链）：
// 名单已尽或濒死中断时进入收尾（夺牌→爱诗→还原）；但若弑魂链（额外回合+追斩）尚未完成
//（bts_shihun_waiting 非空），先等待、不得抢先还原（否则 tail 随变身摘除而失效、追斩被吞）。
// 链完成时由 tail 末尾再次调用本函数补触发。防重：settling 中/active 已清时直接返回。
export function maybeSettleFanshi(player) {
    if (!player.getStorage('bts_mk_fanshi_active', 0)) return;
    if (player.storage.bts_fanshi_settling) return;
    if (player.storage.bts_shihun_waiting?.length) return; // 弑魂链未完成：等 tail 回调
    if (player.getStorage('bts_mk_fanshi_ending', 0) > 0 || !peekFanshiTarget(player)) {
        return lib.skill['bts_sk_fanshi'].util.settleFanshi(player);
    }
}

// 白厄·燔世·发一个波次回合（名单队列）：从波次名单 storage.bts_fanshi_queue 依次取出下一名
// “存活且未除名”者，给其排一个 bts_sk_fanshi 完整额外回合并返回 true；名单取尽（每名未除名者
// 各已执行一个额外回合）时返回 false（调用方转入收尾）。队列在 content / restartFanshiWave 中
// 以 fanshiOthers 快照建立；发放时实时过滤死亡/除名者（快照后名单可能变动）。
// 目标置 `bts_fanshi_pending` 自记账标记：drive/drive_skip 以该标记判定“这是本轮波次回合”
//（不再依赖引擎侧 skill 标签读取——其在本环境时序下不可靠）。
export function issueFanshiTurn(player) {
    const queue = player.storage.bts_fanshi_queue || [];
    let target = null;
    while (queue.length) {
        const candidate = queue.shift();
        if (candidate && candidate.isAlive() && !candidate.hasSkill('bts_sk_fanshi_chuwai')) {
            target = candidate;
            break;
        }
    }
    if (!target) return false;
    lib.bts.api.extraTurn(target, 'bts_sk_fanshi');
    target.storage.bts_fanshi_pending = true; // 逻辑标记（名单驱动）：下一回合归属本轮波次
    // [诊断] 波次链打点（定案后移除）
    console.log('[bts-fanshi] 发放波次回合 →', target.name || target.playerid);
    target.addSkill('bts_sk_fanshi_wave'); // 显示标记：持有“燔世·续”，回合结束由 drive 移除
    return true;
}

// 白厄·燔世·重开一波（爱诗『负世』）：清“中断”标记、重新快照波次名单并发放第一个波次回合。
// 返回 false 表示已无可用目标（调用方转入收尾）。
export function restartFanshiWave(player) {
    player.setStorage('bts_mk_fanshi_ending', 0, true);
    delete player.storage.bts_fanshi_settling;
    player.storage.bts_fanshi_queue = fanshiOthers(player); // 重开一波：重新快照名单（一人一次）
    return issueFanshiTurn(player);
}

// 白厄·燔世·收尾链（源 max_fanshiCard.on_use 尾段，L8786-8805）：
// ①夺未除名存活者各一张牌；②爱诗『负世』问询（流程内曾濒死则不可重复、直接走退出 +6）；
// ③+6 火种（仅爱诗路径）；④还原变身（endFanshi）。选择重复则弃所有手牌重开一波、不还原。
export async function settleFanshi(player) {
    if (!player.getStorage('bts_mk_fanshi_active', 0)) return;
    if (player.storage.bts_fanshi_settling) return; // 防重入（夺牌/问询含交互等待）
    player.storage.bts_fanshi_settling = true;
    await stealFanshi(player);
    const died = player.getStorage('bts_mk_fanshi_ending', 0) > 0; // 流程内曾进入濒死
    if (player.hasSkill('bts_sk_aishi')) {
        let repeat = false;
        if (!died) {
            const choice = await player
                .chooseBool('负世：弃置所有手牌，重复燔世流程？')
                .set('ai', () => false)
                .forResult();
            repeat = !!choice.bool;
        }
        if (repeat) {
            // 源 L8787：throwAllHandCards() 弃所有手牌后重开一波（不还原、不结算 +6）
            const hands = player.getCards('h');
            if (hands.length) await player.discard(hands);
            if (restartFanshiWave(player)) return;
        }
        player.addMark('bts_mk_huozhong', 6); // 源 L8799：不弃置 / 曾濒死 → 退出并 +6
    }
    await endFanshi(player);
}

// 白厄·燔世·变身还原（源 on_use 尾段 L8807-8815、st_fanshi Death）：
// 除名恢复 →（存活路径）变回白厄、扣回上限、体力取“上限与当前生命值的较小者”、额外出牌阶段。
// restoreHero=false：仅恢复除名与清态（源 Death 分支：死亡时不还原变身、不扣上限、不授阶段）。
// 幂等：重复调用安全（各标记/暂存清空后为空操作）。
export async function endFanshi(player, { restoreHero = true } = {}) {
    const exitHp = player.hp; // 还原前体力（供“取小”）
    const gain = player.getStorage('bts_mk_fanshi_gain', 0);
    // ① 除名恢复（源：alive=true、st_fanshi 标记清零）。removeSkill 第二参传 true：绕过 fixed 保护，
    // 并一并清理 skills/hiddenSkills/invisibleSkills/tempSkills/additionalSkills 各集合——不能只按
    // hasSkill 守卫后跳过（2026-09-26 实机回归：离场角色未变回）；随后校正离场态兜底恢复。
    for (const p of player.storage.bts_fanshi_excluded || []) {
        if (!p || typeof p.removeSkill !== 'function') continue;
        p.removeSkill('bts_sk_fanshi_chuwai', true);
        if (typeof p.isOut === 'function' && p.isOut()) {
            game.broadcastAll((x) => x.classList.remove('out'), p);
            game.log(p, '因【燔世】除名结束，移回了游戏');
        }
    }
    // 兜底扫尾（走 game.players 全量，game.filterPlayer 可能不含离场者）：清理名单外的残留——
    // 除名技仍持有、或波次显示标记未及移除。
    for (const p of game.players || []) {
        if (!p || p === player || typeof p.hasSkill !== 'function') continue;
        const ownsChuwai =
            p.hasSkill('bts_sk_fanshi_chuwai') || p.hasSkill('bts_sk_fanshi_chuwai', true);
        if (ownsChuwai) {
            p.removeSkill('bts_sk_fanshi_chuwai', true);
            if (typeof p.isOut === 'function' && p.isOut()) {
                game.broadcastAll((x) => x.classList.remove('out'), p);
                game.log(p, '因【燔世】除名结束，移回了游戏');
            }
        }
        if (p.hasSkill('bts_sk_fanshi_wave') || p.hasSkill('bts_sk_fanshi_wave', true)) {
            p.removeSkill('bts_sk_fanshi_wave');
        }
    }
    // ② 清态（含中断/名单/链中标记）
    delete player.storage.bts_fanshi_excluded;
    delete player.storage.bts_fanshi_queue;
    delete player.storage.bts_fanshi_settling;
    delete player.storage.bts_fanshi_chain;
    // 纯记录键（八轮迁移）：清态用 setStorage(0)；active 另摘“燔”显示角标。
    player.setStorage('bts_mk_fanshi_active', 0, true);
    player.unmarkSkill('bts_mk_fanshi_active');
    player.setStorage('bts_mk_fanshi_counter', 0, true);
    player.setStorage('bts_mk_fanshi_ending', 0, true);
    if (gain) player.setStorage('bts_mk_fanshi_gain', 0, true);
    if (!restoreHero) return;
    // ③ 变身还原：源顺序为先 ChangeHero、后 loseMaxHp；体力取上限与当前生命值的较小者（描述）。
    // 扣上限走 loseMaxHpGuarded（无名杀特化保底 1：还原扣除不得超过当前上限-1，防引擎扣死）。
    if ((player.name1 || player.name) === 'bts_ch_kaesilanna') {
        lib.bts.api.changeHero(player, 'bts_ch_baie');
    }
    if (gain) await lib.bts.api.loseMaxHpGuarded(player, gain);
    if (player.isAlive()) {
        player.hp = Math.min(player.maxHp, exitHp);
        if (player.hp < 0) player.hp = 0;
        // 退出留痕：供实机核对体力/上限（手牌上限=体力，若仍异常可据此定位）
        game.log(player, `退出【燔世】：体力上限 ${player.maxHp}，体力 ${player.hp}`);
        // 源：退出后于原出牌阶段继续行动；无名杀以“插入一个出牌阶段”等效（turnName 显式传入，
        // 使该阶段事件可被识别；复原后再发的阶段不再触发波次链——active 标记已清）。
        lib.bts.api.extraPhase(player, 'phaseUse', null, 'bts_sk_fanshi');
    }
}

export const skill = {
    // ── 必杀技·燔世（源 max_fanshiCard + st_fanshi 触发器，L8750-8991）──
    // 即时结算（content）：扣火种 → 变身 → 除名 → 上限/回满 → 快照波次名单（未除名者）并发首个波次回合。
    // 延后结算（名单驱动；判据核心：`target.storage.bts_fanshi_pending` 自记账标记——发放者知道
    //  发给了谁，无需事后猜引擎回合标签/上下文；本环境实测 event.skill 判据第 2 轮起恒 false）：
    //   drive    —— 波次回合结束 → advanceFanshiChain：先给白厄排一个额外出牌阶段伪回合
    //                （源 ExtraPhase(Play)：阶段而非回合、无摸牌），再排“推进步骤”自定义事件
    //                （濒死中断/名单已尽 → settleFanshi；否则发下一个波次回合）；两步同队 FIFO。
    //   drive_skip —— 波次回合被取消/跳过（无 phaseEnd）同样走 advanceFanshiChain 补链。
    //   settle   —— 夺牌 → 爱诗问询（流程内曾濒死不可重复、退出 +6）→ endFanshi 还原；
    //   huanyuan —— 濒死（回1不死+中断波次）、死亡（仅恢复除名）、链停滞兜底收尾、神躯限制。
    // 源结构注记：源把整段流程同步跑在同一笔结算内（gainAnExtraTurn 同步执行整回合）；
    // 无名杀不能嵌套回合，故拆为“即时 content + 外部挂起的波次回合与阶段”（跨回合结算审计 白厄范式）。
    // 2026-09-26 八轮：波次 = 未除名者依次各一个额外回合（一人一次、队列快照）；删除 progress 子技
    //  （其 phaseUseEnd/phaseAfter 双锚点在实机中去重失效，并会误在白厄真实回合末重复发回合）。
    bts_sk_fanshi: {
        bts_bisha: true, // 终结技
        bts_bisha_angry: false, // 资源型必杀（火种发动、不消耗怒气）→ 拥有者不获得怒气（utils.hasAngryBisha 门控）
        // 引擎约定（2026-09-26 实机定案）：非 multitarget 技能的 content 会「按每名目标各执行一次」
        //（引擎 useSkill 内容为每个 targets[num] 创建一个技能子事件，event.target=当前目标）。
        // 燔世为一次性全局结算（扣火种→变身→除名→快照名单→首发波次），若按目标执行三目标会跑 3 次
        //（实机复现：首个未除名者被连发 3 个额外回合）。标记 multitarget 后 content 只执行一次，
        // event.targets 仍保留全量选择（除名名单=全集−选择）。
        multitarget: true,
        // 发动线由 content 自绘（见下）：引擎对 multitarget 技能默认走 line2 链式
        //（白厄→第一个目标→第一个目标→第二个…），不符合“白厄对各留场者发动”的指向关系，关闭引擎线。
        line: false,
        // 角色技能特化方法（叁岛 util 字段范式）：见文件上方导出与顶部 util 成员清单。
        util: {
            fanshiOthers,
            issueFanshiTurn,
            advanceFanshiChain,
            pushFanshiEvent,
            stealFanshi,
            settleFanshi,
            endFanshi,
        },
        enable: 'phaseUse',
        filter(event, player) {
            // 火种≥12（星启且首次则6）
            const threshold = (() => {
                if (lib.bts.api.god(player) && !player.getStorage('bts_mk_fanshi_used', 0)) {
                    return 6;
                }
                return 12;
            })();
            const otherAliveNum = game.countPlayer(
                (target) => target !== player && target.isAlive()
            );
            return (
                player.countMark('bts_mk_huozhong') >= threshold &&
                otherAliveNum > 0
            );
        },
        prompt: "选择至少1人作为敌人留在场上与你对战，其他人被除名离场，不会受到波及",
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            // 发动线（2026-09-26 用户定夺）：从发动者同时指向全部留场目标——
            // 引擎对 multitarget 技能默认走 line2 链式（白厄→第一个目标→第一个目标→第二个…），
            // 不符合“白厄对各留场者发动”的指向关系；已设 line:false 关闭引擎线，此处自绘。
            // 变体参考（可自定义）：依次延迟可在下方替换为
            //   event.targets.forEach((t, i) => setTimeout(() => player.line(t, 'green'), lib.config.duration * i));
            player.line(event.targets, 'green');
            const n = (() => {
                if (lib.bts.api.god(player) && !player.getStorage('bts_mk_fanshi_used', 0)) {
                    return 6;
                }
                return 12;
            })();
            player.removeMark('bts_mk_huozhong', n);
            if (!player.getStorage('bts_mk_fanshi_used', 0)) player.setStorage('bts_mk_fanshi_used', 1, true);
            lib.bts.api.changeHero(player, 'bts_ch_kaesilanna', { maxHp: player.maxHp });

            // 源 L8437（@@st_fanshi_chuwai!）：除名选择 → 真离场（无法选中、无任何回合）。
            // 目标（event.targets=留场者）已由技能级 filterTarget/selectTarget 于发动时选定，此处仅读。
            // 除名名单 = 其他角色 − 留场者，必须滤掉死者（game.filterPlayer 不排除死者，否则
            // count 虚高会连带体力上限增益/日志全错——F1）。
            const excluded = game.filterPlayer((target) => {
                return (
                    target !== player &&
                    target.isAlive() &&
                    !event.targets.includes(target)
                );
            });
            for (const p of excluded) p.addSkill('bts_sk_fanshi_chuwai');
            player.setStorage('bts_fanshi_excluded', excluded);

            // 源 L8438-8440：体力上限 += maxHp*(count-1)；recover 补满至新上限（满血变身）。
            // 对齐描述"变身满血卡厄斯兰那"：recover(hp*count) 会溢出浪费、recover(hp*(count-1))
            // 则除名1人时无变化，均非满血，改以 maxHp-hp 补满。
            const count = excluded.length;
            if (count > 0) {
                const gain = player.maxHp >= 1 ? player.maxHp * (count - 1) : 0;
                if (gain > 0) {
                    await lib.bts.api.gainMaxHp(player, gain);
                    player.setStorage('bts_mk_fanshi_gain', player.getStorage('bts_mk_fanshi_gain', 0) + gain, true);
                }
            }
            await player.recover(player, player.maxHp - player.hp);

            // 源 L8772-8783：波次 = 对未除名者“依次发放合计八个额外的回合”（预算 8、按趟轮转）；
            // 2026-09-26 八轮定夺：改为“未除名者依次各执行一个额外回合”（一人一次），预算 8 取消。
            // 无名杀不能嵌套回合，故此处只做“启动”：记 active、快照名单、发出第一个波次回合；
            // 其后由 drive / drive_skip（波次回合结束或被吞 → advanceFanshiChain）链式推进至收尾。
            player.setStorage('bts_mk_fanshi_active', 1, true);
            player.setStorage('bts_mk_fanshi_ending', 0, true);
            delete player.storage.bts_fanshi_settling;
            delete player.storage.bts_fanshi_chain;
            player.storage.bts_fanshi_queue = lib.skill['bts_sk_fanshi'].util.fanshiOthers(player);
            if (!lib.skill['bts_sk_fanshi'].util.issueFanshiTurn(player)) {
                // 理论上不可达（filter 已要求其他存活者 ≥1，且至少选出 1 名留场者）；兜底立即还原。
                await lib.skill['bts_sk_fanshi'].util.endFanshi(player);
            }

            // ★ 不在此恢复/变回：收尾链（夺牌→爱诗问询→还原）由 settleFanshi/endFanshi 承担，见文件上方 util。
        },
        ai: {
            order: 8,
            result: { player: 3, target: -1 },
        },
        subSkill: {
            // ── 除名·离场（源 st_fanshi_chuwai alive=false，L8401-8422）──
            // group:'undist' 使被除名者 getNext() 跳过其回合、且不可被选为目标；init 加 out class
            // 使其从场上消失。结算终止时 removeSkill 恢复
            chuwai: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
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

            // ── 燔世·波次标记（显示）：被发放“波次回合”的角色持有（旧版“燔世·续”buff 的可见性替代），
            // 纯表现无触发；其回合结束时由 drive 移除，收尾时由 endFanshi 扫尾。──
            wave: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
                silent: true,
                nopop: true,
                charlotte: true,
            },

            // ── 燔世·波次驱动（回合被跳过保护）：被取消/被跳过的波次回合不触发 phaseEnd，
            // 若不处理则 drive/progress 链停摆。改用引擎官方时机直接响应“回合被吞”：
            //   ① phaseCancelled —— 任何 event.cancel()（含翻面跳过：引擎对翻面回合先 turnOver
            //      再 cancel，content 提前终止、loop 因 _triggered=5 短路，均不再触发 phaseEnd；
            //      gameEvent.cancel() 统一发出本时机——官方角色技能即挂
            //      { player: ['phaseAfter', 'phaseCancelled'] } 处理“回合没正常结束”的收尾）；
            //   ② phaseSkipped —— player.skip('phase')（skipList 机制，loop 开头的 checkSkipped
            //      吞掉整回合并发出本时机；对决模式 versus.js 即用 skip('phase')）。
            // 补偿动作 = 照常走 advanceFanshiChain（伪回合 + 推进步骤；被吞回合视同已执行，不影响名单推进）。──
            drive_skip: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
                trigger: { global: ['phaseCancelled', 'phaseSkipped'] },
                forced: true,
                silent: true,
                nopop: true,
                charlotte: true,
                filter(event, player) {
                    // 名单驱动（同 drive）：只对被取消/跳过的“带 bts_fanshi_pending 标记”的回合补偿。
                    return (
                        player.getStorage('bts_mk_fanshi_active', 0) > 0 &&
                        event.player?.storage?.bts_fanshi_pending === true
                    );
                },
                async content(event, trigger, player) {
                    if (!trigger) return;
                    if (trigger._bts_fanshi_compensated) return; // 同一回合被重复取消时防重
                    trigger._bts_fanshi_compensated = true;
                    // [诊断] 波次链打点（定案后移除）
                    console.log('[bts-fanshi] drive_skip(名单)：回合被吞', trigger.player?.name || trigger.player?.playerid, '→ 补发白厄伪回合');
                    // 触发技约定：trigger 才是触发事件（回合 phase）——清其持有者的“燔世·续”显示标记
                    // 与自记账标记 bts_fanshi_pending（后者防残留使后续普通回合被误判为波次回合）。
                    const skipped = trigger.player;
                    if (skipped && skipped !== player) {
                        if (typeof skipped.removeSkill === 'function') skipped.removeSkill('bts_sk_fanshi_wave');
                        if (skipped.storage) delete skipped.storage.bts_fanshi_pending;
                    }
                    // 与 drive 相同的补链：伪回合 + 推进步骤（被吞回合视同已执行，不影响名单推进）。
                    lib.skill['bts_sk_fanshi'].util.advanceFanshiChain(player);
                },
            },

            // ── 燔世·波次驱动（延后结算①）──
            // 源 st_fanshi 触发器（L8880-8884）：EventPhaseStart + Player_NotActive（任意角色回合结束）
            // + 非弑魂窗口 → ExtraPhase(p, Player_Play)：**每当一个“因燔世获得的回合”结束，
            // 卡厄斯兰那执行一个额外的出牌阶段**（阶段而非完整回合、无摸牌）。
            // 本技挂卡厄斯兰那（变身期持有；白厄自身的基础技能已被 reinit 移除，不能挂在 bts_sk_fanshi 本体）。
            // 判据（七轮起）：被结束回合的持有者带自记账标记 `bts_fanshi_pending`——发放者知道自己发给了谁，
            // 不再依赖引擎回合标签/上下文（其实机时序下不可靠）；弑魂回合（bts_sk_shihun）与普通回合天然不触发
            //（对应源 fanshi_slash 标记压制 L8881）。
            drive: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
                trigger: { global: 'phaseEnd' },
                forced: true,
                silent: true,
                nopop: true,
                charlotte: true,
                filter(event, player) {
                    // 名单驱动（2026-09-26）：判据 = 被结束回合的持有者**带自记账标记**
                    // `bts_fanshi_pending`（issueFanshiTurn 发放时写入、本技处理时清除）——
                    // 不再依赖引擎侧标签（event.skill / getExtraSkill 在本环境时序下均不可靠，
                    // 五轮单用 event.skill 曾致第 2 轮起 drive 全失）。
                    // 白厄自己的伪回合不带该标记（标记只打在波次目标身上），天然排除自连锁。
                    return (
                        event.player !== player &&
                        player.getStorage('bts_mk_fanshi_active', 0) > 0 &&
                        event.player?.storage?.bts_fanshi_pending === true
                    );
                },
                async content(event, trigger, player) {
                    // 波次回合结束：移除其“燔世·续”显示标记（发放于 issueFanshiTurn）。
                    // 触发技约定：trigger 才是触发事件（回合 phase），读触发数据一律 trigger.*；
                    // event 是技能事件（event.player=技能拥有者白厄），不可用作“回合持有者”。
                    // [诊断] 波次链打点（定案后移除）
                    console.log('[bts-fanshi] drive(名单)：回合结束', trigger.player?.name || trigger.player?.playerid, '→ 补发白厄伪回合');
                    const ended = trigger.player;
                    if (ended?.storage) delete ended.storage.bts_fanshi_pending; // 清除自记账标记（本轮回合已消费）
                    if (ended && typeof ended.removeSkill === 'function') {
                        ended.removeSkill('bts_sk_fanshi_wave');
                    }
                    // 源 ExtraPhase(Play) + 续发/收尾：伪回合与推进步骤同队 FIFO（先伪回合、后步骤）。
                    lib.skill['bts_sk_fanshi'].util.advanceFanshiChain(player);
                },
            },

            // （2026-09-26 八轮：原“波次推进”子技 progress 已删除——其 phaseUseEnd/phaseAfter 双锚点
            //  在实机中去重失效（同一伪回合会连发两次），且会在白厄真实回合结束时误发波次回合；
            //  推进职责并入 drive/drive_skip 的 advanceFanshiChain 两步队列。）

            // ── 锁定技·燔世·还原（源 st_fanshi 触发器 EnterDying/Death 分支，L8880-8890）──
            // 三条触发各自的新归属：
            // ①dying（源 L8884-8887）→ 回复至1点、nodying 阻断濒死（不死，busi 范式）、标记“中断波次”；
            //   后续由波次链推进步骤检查点转入收尾（爱诗因流程内曾濒死不可重复、退出 +6）。
            // ②dieAfter（源 Death L8888-8890）→ 仅恢复除名与清态（不还原变身/不扣上限/不授阶段）。
            // ③phaseEnd（兜底）→ 波次链停滞时的安全收尾：活跃中但已无待执行的波次/弑魂回合，
            //   且不处于链推进中（bts_fanshi_chain：伪回合结束→推进步骤执行之间由步骤自身接管）。
            //   （正常收尾走 advanceFanshiChain 的推进步骤；不用 phaseZhunbeiBegin——白厄自续阶段的伪回合同样以其开始，会误触。）
            huanyuan: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
                trigger: { player: ['dying', 'phaseEnd', 'dieAfter'] },
                forced: true,
                filter(event, player, triggername) {
                    if (!player.getStorage('bts_mk_fanshi_active', 0)) return false;
                    // filter 第 3 参 triggername 为带后缀完整触发名（event.name 是基名）
                    if (triggername === 'dieAfter') return event.player === player;
                    // 源 L8884-8887：燔世期间进入濒死即触发（神躯防御：回1不死）
                    if (triggername === 'dying') return true;
                    // 兜底：活跃中但已无待执行的波次回合与弑魂回合，且未在收尾/链推进中 → 判定链停滞，收尾。
                    if (player.storage.bts_fanshi_settling) return false;
                    if (player.storage.bts_fanshi_chain) return false;
                    if (player.storage.bts_shihun_waiting?.length) return false; // 弑魂链未完成：非停滞（等 tail 收尾）
                    return (
                        lib.bts.api.countPendingPhases({
                            extra: true,
                            skill: 'bts_sk_fanshi',
                            includeCurrent: false,
                        }) === 0 &&
                        lib.bts.api.countPendingPhases({
                            extra: true,
                            skill: 'bts_sk_shihun',
                            includeCurrent: false,
                        }) === 0
                    );
                },
                async content(event, trigger, player) {
                    if (event.triggername === 'dying') {
                        // 源 L8884-8887：回复至1点（不死）。对致死父事件（伤害/失去体力）设 nodying 阻断濒死——
                        // busi 范式（见 rules/globalBuffs.js bts_bless_busi）：不 cancel 濒死事件，否则濒死未完成
                        // 结算、_status.dying 不移除（表现为酒会回血而非脱离濒死）。回复至 hp>0 后 dying step2 自然收尾。
                        const evt = trigger.getParent();
                        if (evt && (evt.name === 'damage' || evt.name === 'loseHp')) evt.nodying = true;
                        if (player.hp < 1) await player.recover(player, 1 - player.hp);
                        player.setStorage('bts_mk_fanshi_ending', 1, true); // 中断波次：progress 检查点转收尾
                        return;
                    }
                    if (event.triggername === 'dieAfter') {
                        // 源 st_fanshi Death（L8888-8890）：只恢复除名（死亡时不还原变身、不扣上限、不授阶段）
                        await lib.skill['bts_sk_fanshi'].util.endFanshi(player, {
                            restoreHero: false,
                        });
                        return;
                    }
                    // phaseEnd 兜底：链停滞（如携带波次回合者阵亡致队列静默、锚点事件未触达等）→ 收尾
                    await lib.skill['bts_sk_fanshi'].util.settleFanshi(player);
                },
                // 神躯限制（源 st_fanshi 描述"其他角色不是你使用非视为或非转化的牌的合法目标"，
                // 按用户定夺实现）：变身期间卡厄斯兰那只能使用技能（视为/转化，如血棘/弑魂/天裁）
                // 或响应他人使用的牌，不能主动使用非转化的实体牌。
                // 引擎 lib.filter.cardEnabled 在调用本 mod 前先 get.autoViewAs 转成 VCard，
                // 故 card 恒为 VCard（get.itemtype 返回 'vcard' 而非 'card'），不可用 itemtype 过滤；
                // 引擎亦无 card.isVirtual 属性。统一按 get.is.convertedCard / virtualCard 判定
                // 转化/虚拟牌放行、实体牌禁用（对应描述"只能使用转化/虚拟牌或响应他人的牌"）。
                mod: {
                    cardEnabled(card, player) {
                        if (player.getStorage('bts_mk_fanshi_active', 0) <= 0) return;
                        if (get.is.convertedCard(card) || get.is.virtualCard(card)) return;
                        return false;
                    },
                },
                ai: { noe: true },
            },
        },
    },

    // ── 锁定技·身炬（源 st_shenju = TriggerSkill Compulsory CardsMoveOneTime/Damaged/HpRecover，L8322-8352）──
    // 其他角色令你回复体力、回复怒气、附加祝福或护盾、获得牌后，你受到伤害后，或你弃置【杀】后，
    // 若火种少于15枚，你获得1枚火种。
    // （怒气/祝福/护盾三触发源代码未实现，按用户定夺补：在 lib.bts.api.addAngry/addBless/addShield
    //   以 from !== player 挂钩，见 rules/utils.js，与寸强 cunqiang 同款模式。）
    bts_sk_shenju: {
        // 四件事以你为当事人（event.player === 你）：用 player:，引擎只在 event.player===你 时触发
        // filter 第 3 参 triggername 是带 Before/After 后缀的完整触发名（event.name/filter 的 event 为基名）。
        trigger: {
            player: ['gainAfter', 'recoverEnd', 'damageEnd', 'loseAfter'],
        },
        forced: true,
        filter(event, player, triggername) {
            // 源 L8345：火种<15 才触发
            if (player.countMark('bts_mk_huozhong') >= 15) return false;
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
            if (player.countMark('bts_mk_huozhong') < 15) player.addMark('bts_mk_huozhong', 1);
        },
        ai: { noe: true },
    },

    // ── 触发技·辟地（源 st_pidi = TriggerSkill Damage，L8353-8363）──
    // 当你造成伤害后，你可以弃置一张【杀】获得1枚火种。
    bts_sk_pidi: {
        // 源 st_pidi events={sgs.Damage}，Damage 以 damage.from（来源）触发；描述"造成伤害后"，
        // player: 会误在受伤时触发，应 source:。
        trigger: { source: 'damageEnd' },
        filter(event, player) {
            // 源 L8357：造成伤害且火种<15、手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                event.num > 0 &&
                player.countMark('bts_mk_huozhong') < 15 &&
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
            if (player.countMark('bts_mk_huozhong') < 15) player.addMark('bts_mk_huozhong', 1);
        },
        ai: { result: { player: 1 } },
    },

    // ── 变身技·血棘（源 fanshi_duel = ViewAsSkill n=2，L8394-8414）──
    // 出牌阶段，你可以弃置两张手牌，视为使用【决斗】，然后结束出牌阶段。
    // （源 enabled_at_play 三技互斥：血棘/弑魂需"未用血棘（永久）&& 弑魂本回合未用 &&
    //   （天裁本回合未用 || 天裁强化）"；用 useSkill 历史按回合近似源 hasUsed）
    bts_sk_xueji: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8411）：手牌≥2、未用血棘（永久 -play）、弑魂本回合未用、
            // 且（天裁本回合未用 || 天裁强化 bts_mk_fanshi_draw-play）
            const slashUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_sk_shihun')
                .length > 0;
            const drawUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_sk_tiancai')
                .length > 0;
            return (
                !player.getStorage('bts_mk_fanshi_duel-play', 0) &&
                !slashUsed &&
                (!drawUsed || player.getStorage('bts_mk_fanshi_draw-play', 0) > 0) &&
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
            lib.bts.aiGuard.record(player, 'bts_sk_xueji');
            const target = event.targets[0];
            await player.discard(event.cards);
            player.setStorage('bts_mk_fanshi_duel-play', 1, true);
            // 源 L8403-8406：克隆 duel 并使用
            await player.useCard(
                {
                    name: 'juedou',
                    isCard: true,
                    storage: { bts_sk_xueji: true },
                },
                target,
            );
            // 源 L8419：Global_PlayPhaseTerminated 结束出牌阶段
            lib.bts.api.endPlayPhase(player);
        },
        ai: { order: 7, result: { target: -2 } },
    },

    // ── 变身技·弑魂（源 fanshi_slash = ViewAsSkill n=999 + SkillCard，L8924-8960）──
    // 出牌阶段，你可以弃置等同于其他角色数的手牌，令所有（未除名）其他角色各执行一个额外回合，
    // 然后视为对这些角色使用【杀】，并结束出牌阶段。
    // 无名杀插入回合只能排队、无法在 content 内同步跑完；为保“先回合、后杀”的源顺序，
    // “视为使用【杀】”改由 subSkill.tail 在最后一个弑魂回合结束时执行（回合标签 bts_sk_shihun）。
    bts_sk_shihun: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8957）：手牌≥其他角色数、未用血棘、弑魂本回合未用、
            // 且（天裁本回合未用 || 天裁强化）。“其他角色数”= 未除名存活者（源 getAliveSiblings 排除 alive=false）。
            const count = lib.skill['bts_sk_fanshi'].util.fanshiOthers(player).length;
            const slashUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_sk_shihun')
                .length > 0;
            const drawUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_sk_tiancai')
                .length > 0;
            return (
                count > 0 &&
                !player.getStorage('bts_mk_fanshi_duel-play', 0) &&
                !slashUsed &&
                (!drawUsed || player.getStorage('bts_mk_fanshi_draw-play', 0) > 0) &&
                player.countCards('h') >= count
            );
        },
        filterCard() {
            return true; // 源 view_filter（L8435）：任意手牌
        },
        position: 'h',
        selectCard() {
            // 引擎对函数式 selectCard 一律零参调用（get.select(select) → select()；game.check 与
            // chooseToUse 两条路径皆然），使用者须从事件栈取（官方范式 _status.event.player，
            // 见 character/extra/skill.js 等）。弃牌数 == 其他角色数（未除名存活者，源 L8438）。
            const player = _status.event?.player;
            if (!player) return 1; // 兜底：非预期调用场景不至崩溃（合法流程由 filter 保证 count≥1）
            return lib.skill['bts_sk_fanshi'].util.fanshiOthers(player).length;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_shihun');
            const targets = lib.skill['bts_sk_fanshi'].util.fanshiOthers(player);
            await player.discard(event.cards);
            // 弑魂"已用"以 useSkill 历史按回合跟踪（源 hasUsed("#fanshi_slash")），不设永久标记
            lib.bts.api.endPlayPhase(player); // 源 L8928：Global_PlayPhaseTerminated
            // 源 L8929-8935：未除名者各执行一个额外回合（标签 bts_sk_shihun——与燔世波次回合
            // bts_sk_fanshi 区分：不触发白厄出牌阶段、不计入波次预算）；追斩见 subSkill.tail。
            player.storage.bts_shihun_targets = targets.slice();
            player.storage.bts_shihun_waiting = targets.slice();
            for (const target of targets) lib.bts.api.extraTurn(target, 'bts_sk_shihun');
        },
        ai: { order: 6, result: { player: 1, target: -1 } },
        subSkill: {
            // ── 弑魂·追斩（延后结算）：最后一个弑魂回合结束后，视为对全部目标使用【杀】──
            // 源 L8935：ViewAsCard(player, getOtherPlayers, "_fanshi_slash") —— 在他人回合跑完后执行。
            // 目标在回合前阵亡（dieAfter）则从待列表剔除；被取消/跳过（phaseCancelled/phaseSkipped，
            // 见 drive_skip 的时机说明）的弑魂回合视同已过；待列表清空即结算追斩（幂等清场）。
            tail: {
                sub: true,
                sourceSkill: 'bts_sk_shihun',
                trigger: { global: ['phaseEnd', 'dieAfter', 'phaseCancelled', 'phaseSkipped'] },
                forced: true,
                silent: true,
                nopop: true,
                charlotte: true,
                filter(event, player, triggername) {
                    const waiting = player.storage.bts_shihun_waiting;
                    if (!waiting || !waiting.length) return false;
                    if (triggername === 'dieAfter') {
                        return waiting.includes(event.player);
                    }
                    if (triggername === 'phaseCancelled' || triggername === 'phaseSkipped') {
                        // 回合被吞保护：cancel/skip 的弑魂回合不触发 phaseEnd，在此视同已过、
                        // 剔除待斩名单，避免追斩永不结算（覆盖翻面及其他跳过来源）。
                        return event.skill === 'bts_sk_shihun' && waiting.includes(event.player);
                    }
                    // 弑魂回合结束剔除：判据 = 回合**自身的标签**，并集 getExtraSkill() 兜底
                    //（与 drive 同理，2026-09-26 五轮后实机回归修正）。
                    return (
                        (event.skill === 'bts_sk_shihun' ||
                            lib.bts.api.getExtraSkill() === 'bts_sk_shihun') &&
                        waiting.includes(event.player)
                    );
                },
                async content(event, trigger, player) {
                    const waiting = player.storage.bts_shihun_waiting || [];
                    // 触发技约定：trigger 才是触发事件（回合 phase）——event.player 是技能拥有者白厄。
                    const index = waiting.indexOf(trigger.player);
                    if (index >= 0) waiting.splice(index, 1);
                    if (waiting.length) return;
                    const targets = player.storage.bts_shihun_targets || [];
                    delete player.storage.bts_shihun_waiting;
                    delete player.storage.bts_shihun_targets;
                    if (!player.isAlive()) return;
                    // 追斩：对仍存活的目标逐个视为使用【杀】（源 L8935 ViewAsCard，先回合后杀）
                    for (const target of targets) {
                        if (target && target.isAlive()) {
                            await player.useCard(
                                {
                                    name: 'sha',
                                    isCard: true,
                                    storage: { bts_sk_shihun: true },
                                },
                                target,
                            );
                        }
                    }
                    // 弑魂链完成（含追斩）：若燔世正处于“名单已尽/濒死中断”的收尾等待，
                    // 由此补触发收尾（门控见 maybeSettleFanshi——waiting 已清、条件成立即进入）。
                    await maybeSettleFanshi(player);
                },
            },
        },
    },

    // ── 变身技·天裁（源 fanshi_draw = ViewAsSkill / SkillCard，L8460+）──
    // 出牌阶段，若你的手牌少于7，你可以摸至七张（至多摸四张），然后等同摸牌数的次数令随机其他角色附加烈阳；
    // 所有处于烈阳的角色弃置一张手牌并移除1层烈阳。
    bts_sk_tiancai: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8482）：手牌<7、天裁/弑魂本回合未用、未用血棘（永久）；
            // “其他角色”= 未除名存活者（名单=未除名存活者，排除死者与离场者）。
            const slashUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_sk_shihun')
                .length > 0;
            const drawUsed = player
                .getHistory('useSkill', (evt) => evt.skill === 'bts_sk_tiancai')
                .length > 0;
            return (
                !player.getStorage('bts_mk_fanshi_duel-play', 0) &&
                !slashUsed &&
                !drawUsed &&
                player.countCards('h') < 7 &&
                lib.skill['bts_sk_fanshi'].util.fanshiOthers(player).length > 0
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_tiancai');
            // 源 L8456：x = min(7-手牌, 4)，摸 x 张
            const amount = Math.min(7 - player.countCards('h'), 4);
            await player.draw(player, amount);
            // 源 L8458-8462：x 次令随机其他角色附加烈阳
            for (let index = 0; index < amount; index++) {
                const targets = lib.skill['bts_sk_fanshi'].util.fanshiOthers(player);
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
            // 源 L8470-8472：星启且摸满4张时记录 bts_mk_fanshi_draw-play（可保留出牌阶段）
            if (lib.bts.api.god(player) && amount === 4)
                player.setStorage('bts_mk_fanshi_draw-play', 1, true);
            else lib.bts.api.endPlayPhase(player);
        },
        ai: { order: 5, result: { player: 2, target: -1 } },
    },
};

export const buffSkills = {
    bts_abnormal_lieyang: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_lieyang_faq',
    },
};

export const marks = {
    bts_mk_huozhong: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_huozhong_faq',
    },
    // 燔世行政标记家族（active/used/gain/counter/ending/duel-play/draw-play）：仅内部簿记与计数，
    // 一律不写标记变更 log（2026-09-26 用户定夺）。active 为显示型角标“燔”故显式覆盖；
    // record 类由 markRegistry.shouldLogMark 的“仅记录类静默”策略兑底，此处再加双保险。
    // 存储迁移（2026-09-26 用户定夺）：以上键读写已由 addMark/countMark 改为
    // player.setStorage/getStorage（纯记录、不写 log）；数字存储保持——-play 键仍由
    // 全局阶段清理以 removeMark 清零（数字兼容）；active 显示改为 setStorage(…,true)
    // 刷新 + unmarkSkill 摘除。def 保留供命名/词条表。
    bts_mk_fanshi_active: {
        markKind: 'mark',
        markType: 'text',
        markLog: false,
        glossaryId: 'bts_glossary_fanshi_active_faq',
    },
    bts_mk_fanshi_used: {
        markKind: 'record',
        markLog: false,
    },
    bts_mk_fanshi_gain: {
        markKind: 'record',
        markLog: false,
    },
    bts_mk_fanshi_counter: {
        markKind: 'record',
        markLog: false,
    },
    bts_mk_fanshi_ending: {
        markKind: 'record',
        markLog: false,
    },
    'bts_mk_fanshi_duel-play': {
        markKind: 'record',
        markLog: false,
    },
    'bts_mk_fanshi_draw-play': {
        markKind: 'record',
        markLog: false,
    },
};

// 角色专属词条
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_lieyang_faq',
        name: '|烈阳|',
        info: `异常状态：由技能效果赋予；每满2层移除2层并对持有者造成1点无来源伤害。`,
    },
    {
        id: 'bts_glossary_huozhong_faq',
        name: '|火种|',
        info: `白厄专属：${get.poptip('bts_sk_shenju')}获牌/治疗、${get.poptip('bts_sk_pidi')}受伤弃杀各+1枚；满6/12由${get.poptip('bts_sk_fanshi')}变身燔世。`,
    },
    {
        id: 'bts_glossary_fanshi_active_faq',
        name: '|燔世状态|',
        info: `白厄变身状态：发动${get.poptip('bts_sk_fanshi')}（耗火种）后变身卡厄斯兰那；场上其余角色依次各执行一个额外回合，每当这些回合之一结束你执行一个额外出牌阶段（弑魂等技能授予的回合不触发）；濒死时回复至1点并中断波次。`,
    },
];

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_baie_skin1': '皮肤1',
    'bts_ch_baie_skin10': '皮肤10',
    'bts_ch_baie_skin11': '皮肤11',
    'bts_ch_baie_skin12': '皮肤12',
    'bts_ch_baie_skin2': '皮肤2',
    'bts_ch_baie_skin3': '皮肤3',
    'bts_ch_baie_skin4': '皮肤4',
    'bts_ch_baie_skin5': '皮肤5',
    'bts_ch_baie_skin6': '皮肤6',
    'bts_ch_baie_skin7': '皮肤7',
    'bts_ch_baie_skin8': '皮肤8',
    'bts_ch_baie_skin9': '皮肤9',
    'bts_ch_kaesilanna_skin1': '皮肤1',
    bts_ch_baie: '白厄',
    bts_ch_kaesilanna: '卡厄斯兰那',
    bts_sk_fanshi: '燔世',
    bts_sk_fanshi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，弃12枚${get.poptip('bts_glossary_huozhong_faq')}（若你为${get.poptip('bts_glossary_xingqi_faq')}且首次发动则改为6枚），`
        + `变身为${get.poptip('bts_ch_kaesilanna')}。变身期间你不能正常使用牌，只能使用转化/虚拟牌或响应他人的牌。选择至少1名其他角色作为敌人保留在场，其余角色被除名（移出游戏），你的体力上限增至除名数的倍数，体力回复至上限；场上其余角色依次各执行一个额外回合，每当这些回合之一结束，你执行一个额外的出牌阶段（弑魂等技能授予的回合不触发）。变身期间进入濒死状态时，你回复至1点体力并中断波次。`
        + `波次结束后，你获得未除名者各一张牌，然后退出变身；退出时被除名者回归，你扣回此前增加的体力上限，体力取体力上限与你当前生命值的较小者，并获得一个额外的出牌阶段。`
        + `<li>若你拥有${get.poptip('bts_sk_aishi')}，波次结束时若流程内未进入过濒死状态，你可选择：①弃置所有手牌重复燔世流程，②获得6枚${get.poptip('bts_glossary_huozhong_faq')}`,

    bts_sk_fanshi_chuwai: '燔世·除名',
    bts_sk_fanshi_wave: '燔世·续',
    bts_sk_fanshi_drive: '燔世·续',
    bts_sk_fanshi_drive_skip: '燔世·续',
    bts_sk_shihun_tail: '弑魂·斩',
    bts_sk_shenju: '身炬',
    bts_sk_shenju_info: `锁定技，其他角色令你回复体力、回复${get.poptip('bts_glossary_nuqi_faq')}、附加祝福或${get.poptip('bts_glossary_hudun_faq')}、获得牌后，你受到伤害后，或你弃置【杀】后，若${get.poptip('bts_glossary_huozhong_faq')}少于15枚，你获得1枚${get.poptip('bts_glossary_huozhong_faq')}。`,
    bts_sk_pidi: '辟地',
    bts_sk_pidi_info: `当你造成伤害后，你可以弃置一张【杀】获得1枚${get.poptip('bts_glossary_huozhong_faq')}。`,
    bts_sk_fanshi_huanyuan: '燔世·还原',
    bts_sk_fanshi_huanyuan_info: '锁定技，每当一个因“燔世”获得的回合结束，你执行一个额外的出牌阶段（弑魂等技能授予的回合不触发）；变身期间你进入濒死状态时，回复至1点体力（不会死亡）并中断波次，波次随后结束时你获得未除名者各一张牌；若你拥有爱诗且流程内未进入过濒死状态，波次结束时你可以弃置所有手牌重复燔世流程，或获得6枚火种并退出；退出变身时，被除名者回归，你扣回此前增加的体力上限（体力取体力上限与当前生命值的较小者）并获得一个额外的出牌阶段（不是回合）。你死亡时，仅令被除名者回归。',
    bts_sk_xueji: '血棘',
    bts_sk_xueji_info: '出牌阶段，你可以弃置两张手牌，视为使用【决斗】，然后结束出牌阶段。',
    bts_sk_shihun: '弑魂',
    bts_sk_shihun_info: '出牌阶段，你可以弃置等同于其他角色数的手牌，并结束出牌阶段，令所有其他角色各执行一个额外回合，然后视为对这些角色使用【杀】',
    bts_sk_tiancai: '天裁',
    bts_sk_tiancai_info: `出牌阶段，你可以将手牌摸至七张（至多摸四张），然后等同于摸牌数的次数令随机其他角色附加${get.poptip('bts_glossary_abnormal_lieyang_faq')}；所有处于${get.poptip('bts_glossary_abnormal_lieyang_faq')}的角色弃置一张手牌并移除1层${get.poptip('bts_glossary_abnormal_lieyang_faq')}。若你不为${get.poptip('bts_glossary_xingqi_faq')}或以此法获得的牌数小于4，结束出牌阶段。`,
    bts_mk_huozhong: '火种',
    bts_abnormal_lieyang: '烈阳',
    bts_mk_fanshi_used: '首次燔世已发动',
    bts_mk_fanshi_active: '燔世状态',
    bts_mk_fanshi_gain: '燔世·上限增益',
    bts_mk_fanshi_counter: '燔世·波次余量',
    bts_mk_fanshi_ending: '燔世·中断标记',

    '$bts_sk_fanshi1': "亿万火种之怒，燃尽此身！",
    '$bts_sk_fanshi2': "赐你，众星俱焚的曙光",
    '$bts_sk_shenju1': "无论等待多久，我都不会放弃",
    '$bts_sk_shenju2': "点燃黎明！",
    '$bts_sk_pidi1': "新世界，终将到来！",
    '$bts_sk_pidi2': "为了，下一个明天！",
    '$bts_sk_tiancai1': "以新生的烈阳，撕裂长空！",
    '$bts_sk_xueji1': "一具空壳而已",
    '$bts_sk_shihun1': "以血，淬火！",
    '$bts_sk_fanshi_huanyuan1': "熔毁长夜吧！",
    '$bts_sk_tiancai2': "以旧日余烬，为来世破晓！",
    '$bts_sk_xueji2': "徒有虚表的灵魂",
    '$bts_sk_shihun2': "铭记这道痛楚！",
    '$bts_sk_fanshi_huanyuan2': "挣脱囚笼吧！",
    '$bts_sk_shihun3': "烙印纷争之名！",
    '~bts_ch_baie': "我不会…忘记……",
    '~bts_ch_kaesilanna': "我不会…忘记……",
    'bts_mk_fanshi_duel-play': '血棘已用',
    'bts_mk_fanshi_draw-play': '天裁强化',
};
// 如果dynamic中出现了条目，则不用再写simpleTranslate的内容
export const simpleTranslate = {
    bts_sk_shenju_info: `锁；别人奶你/给你牌、你受伤或弃杀后+1${get.poptip('bts_glossary_huozhong_faq')}（封顶15）`,
    bts_sk_pidi_info: `造成伤害后，可弃杀+1${get.poptip('bts_glossary_huozhong_faq')}`,
    bts_sk_fanshi_huanyuan_info: '锁；每个燔世回合结束你执行额外出牌阶段（弑魂回合不触发），每名未除名者各1回合；濒死回1并中断；波次后夺未除名者各1牌，爱诗未濒死可弃手牌重复或+6火种；退出取小还原并+1额外出牌阶段',
    bts_sk_xueji_info: '弃2手牌当决斗用完就收手',
    bts_sk_shihun_info: '按场上剩余的其他角色数弃手牌，等他们额外回合走完再一人一发虚拟杀',
    bts_sk_tiancai_info: `摸到7张（至多4），随机给人挂${get.poptip('bts_glossary_abnormal_lieyang_faq')}，带${get.poptip('bts_glossary_abnormal_lieyang_faq')}的角色挨个弃牌；非${get.poptip('bts_glossary_xingqi_faq')}或摸不足4结束出牌阶段`,
};
export const dynamicTranslate = {
    bts_sk_fanshi(player) {
        const xingqiStr = (lib.bts.api.god(player) && !player.getStorage('bts_mk_fanshi_used', 0)) ? `-6` : `-12`;
        return `${get.poptip('bts_glossary_bisha_faq')}，${xingqiStr}枚${get.poptip('bts_glossary_huozhong_faq')}，变身为${get.poptip('bts_ch_kaesilanna')}，`
            + `变身后只能用转化/虚拟牌，或响应他人的牌。选至少1名敌人留场，其余除名；血量与上限增至除名数的倍数。场上其余角色依次各执行一个额外回合，每个这类回合结束你执行额外出牌阶段（弑魂回合不触发）。濒死时回至1血并中断波次。`
            + `波次后夺未除名者各1牌，还原变身（体力取较小者），+1额外出牌阶段`
            + `<li>若你拥有${get.poptip('bts_sk_aishi')}，波次结束未濒死可弃所有手牌重复燔世，否则+6${get.poptip('bts_glossary_huozhong_faq')}`;
    },
};
// 重要修改，需同步全项目的对应条目
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音