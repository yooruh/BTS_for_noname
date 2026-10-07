// 白厄（源 animal.lua L8223-8485）—— 火种变身为卡厄斯兰那。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';

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
        // 变身期 bts_sk_fanshi 本体被 reinit 移除；延后结算类子技（波次驱动/推进、弑魂收尾）须显式列入本表。
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

// 燔世延后结算（发回合/夺牌/收尾/还原）经 bts_sk_fanshi.util 挂载（叁岛 util 范式）；
// 跨文件以 lib.skill['bts_sk_fanshi'].util.<fn> 访问。

// 燔世·在场余众排队（源 L8441-8452）：自白厄按回合顺序（getNext）收集在场其他角色，
// 跳过除名（离场）/非存活者，不含自己。
export function fanshiOthers(player) {
    const others = [];
    const seen = new Set([player.playerid]);
    let current = player;
    while (true) {
        // game.findNext 的 `>= position` 会返回自己（非「下一位」），故改走 player.getNext() 沿 .next
        // 环找下一位；seen 兜底成环即停。
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

// 燔世·链事件：排入当前回合父事件队列（与 insertPhase 同定位），与伪回合（extraPhase 同队列）
// 保持 FIFO——伪回合先、推进步骤后；content 可 async。
export function pushFanshiEvent(player, content, name = 'bts_fanshi_step') {
    const current = _status.event?.getParent?.('phase');
    let host = null;
    if (current && current.parent && current.parent.next) {
        host = current.parent;
    } else if (_status.event?.parent && _status.event.parent.next) {
        host = _status.event.parent;
    }
    if (!host) return null; // 无宿主队列（非预期调用）：留待 huanyuan 兜底，不落孤儿事件
    const next = game.createEvent(name, false, host);
    next.player = player;
    next.forceDie = true;
    next.includeOut = true;
    next.setContent(content);
    return next;
}

// 燔世·波次链推进（drive/drive_skip 入口）：① 排伪回合（源 ExtraPhase(Play)：仅出牌阶段、无摸牌）；
// ② 排推进步骤（濒死中断/名单已尽 → 收尾，否则发下一波次回合）。两步同入父级队列 FIFO。
// bts_fanshi_chain（伪回合结束→步骤执行间为 true）供 huanyuan 的 phaseEnd 兜底避让。
export function advanceFanshiChain(player) {
    if (player.getStorage('bts_mk_fanshi_active', 0) <= 0) return;
    lib.bts.api.extraPhase(player, 'phaseUse', null, 'bts_sk_fanshi');
    player.storage.bts_fanshi_chain = true;
    pushFanshiEvent(player, async (event, trigger, owner) => {
        delete owner.storage.bts_fanshi_chain; // 推进步骤已到：解除兜底避让
        if (owner.getStorage('bts_mk_fanshi_active', 0) <= 0) return;
        if (owner.getStorage('bts_mk_fanshi_ending', 0) > 0) {
            // 濒死中断 → 转收尾（源 L8776 起 break）；门控：弑魂链未完成先等待（tail 完成补触发）。
            await maybeSettleFanshi(owner);
            return;
        }
        if (!lib.skill['bts_sk_fanshi'].util.issueFanshiTurn(owner)) {
            // 名单已尽 → 收尾（夺牌→爱诗→还原）；门控同上。
            await maybeSettleFanshi(owner);
        }
    });
}

// 燔世·夺牌（源 L8454-8462）：波次结束时夺在场未除名者各一张 he 牌；由 settleFanshi 调用。
export async function stealFanshi(player) {
    if (!player.isAlive()) return;
    for (const p of fanshiOthers(player)) {
        if (p.countCards('he') > 0) await player.gainPlayerCard(p, 'he');
    }
}

// 只读查看下一名可发目标（不发回合、不动队列）；供收尾门控判定「名单已尽」，无副作用。
export function peekFanshiTarget(player) {
    const queue = player.storage.bts_fanshi_queue || [];
    return (
        queue.find(
            (candidate) =>
                candidate && candidate.isAlive() && !candidate.hasSkill('bts_sk_fanshi_chuwai'),
        ) || null
    );
}

// 收尾门控：名单已尽或濒死中断 → 收尾（夺牌→爱诗→还原）；须晚于已发结算——弑魂链未完成时
// 先等（抢先还原会让 tail 随变身摘除、追斩被吞），tail 末尾补触发。防重：settling/active 已清直接返回。
export function maybeSettleFanshi(player) {
    if (!player.getStorage('bts_mk_fanshi_active', 0)) return;
    if (player.storage.bts_fanshi_settling) return;
    if (player.storage.bts_shihun_waiting?.length) return; // 弑魂链未完成：等 tail 回调
    if (player.getStorage('bts_mk_fanshi_ending', 0) > 0 || !peekFanshiTarget(player)) {
        return lib.skill['bts_sk_fanshi'].util.settleFanshi(player);
    }
}

// 发一个波次回合：从 bts_fanshi_queue 取下一名存活未除名者，排 bts_sk_fanshi 完整额外回合；
// 取尽返回 false（转收尾）。队列由 content / restartFanshiWave 快照，发放时实时过滤死者/除名者。
// 目标置 bts_fanshi_pending 自记账标记：drive/drive_skip 据此判定波次回合（勿依赖引擎标签）。
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
    target.addSkill('bts_sk_fanshi_wave'); // 显示标记：持有“燔世·续”，回合结束由 drive 移除
    return true;
}

// 重开一波（爱诗『负世』）：清“中断”标记、重快照名单并发首个波次回合；无目标返回 false（转收尾）。
export function restartFanshiWave(player) {
    player.setStorage('bts_mk_fanshi_ending', 0, true);
    delete player.storage.bts_fanshi_settling;
    player.storage.bts_fanshi_queue = fanshiOthers(player); // 重开一波：重新快照名单（一人一次）
    return issueFanshiTurn(player);
}

// 收尾链（源 max_fanshiCard.on_use 尾段 L8786-8805）：①夺牌；②爱诗『负世』问询（曾濒死则不可
// 重复、直接退出+6）；③+6 火种（仅爱诗）；④还原（endFanshi）。选择重复则弃全手牌重开一波、不还原。
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

// 变身还原（源 on_use 尾段 L8807-8815、st_fanshi Death）：除名恢复 →（存活）变回白厄、扣回上限、
// 体力取「上限与当前较小者」、额外出牌阶段。restoreHero=false：仅恢复除名与清态（源 Death 分支）。
// 幂等：重复调用安全。
export async function endFanshi(player, { restoreHero = true } = {}) {
    const exitHp = player.hp; // 还原前体力（供“取小”）
    const gain = player.getStorage('bts_mk_fanshi_gain', 0);
    // ① 除名恢复（源：alive=true）。removeSkill 第二参 true 绕过 fixed 保护并清理技能集合
    //（只按 hasSkill 守卫跳过会漏掉离场角色，变不回）；随后校正离场态。
    for (const p of player.storage.bts_fanshi_excluded || []) {
        if (!p || typeof p.removeSkill !== 'function') continue;
        p.removeSkill('bts_sk_fanshi_chuwai', true);
        if (typeof p.isOut === 'function' && p.isOut()) {
            game.broadcastAll((x) => x.classList.remove('out'), p);
            game.log(p, '因【燔世】除名结束，移回了游戏');
        }
    }
    // 兜底扫尾（走 game.players 全量——filterPlayer 不含离场者）：清仍持有的除名技与波次显示标记。
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
    // 纯记录键：清态用 setStorage(0)；active 另摘「燔」显示角标。
    player.setStorage('bts_mk_fanshi_active', 0, true);
    player.unmarkSkill('bts_mk_fanshi_active');
    player.setStorage('bts_mk_fanshi_counter', 0, true);
    player.setStorage('bts_mk_fanshi_ending', 0, true);
    if (gain) player.setStorage('bts_mk_fanshi_gain', 0, true);
    if (!restoreHero) return;
    // ③ 变身还原：源顺序先 ChangeHero、后 loseMaxHp；体力取「上限与当前较小者」。扣上限走
    // loseMaxHpGuarded（保底 1：扣除不得超当前上限-1，防引擎扣死）。
    if ((player.name1 || player.name) === 'bts_ch_kaesilanna') {
        lib.bts.api.changeHero(player, 'bts_ch_baie');
    }
    if (gain) await lib.bts.api.loseMaxHpGuarded(player, gain);
    if (player.isAlive()) {
        player.hp = Math.min(player.maxHp, exitHp);
        if (player.hp < 0) player.hp = 0;
        // 退出留痕：供实机核对体力/上限（手牌上限=体力，若仍异常可据此定位）
        game.log(player, `退出【燔世】：体力上限 ${player.maxHp}，体力 ${player.hp}`);
        // 源：退出后于原出牌阶段继续行动；以插入出牌阶段等效（active 已清，不再触发波次链）。
        lib.bts.api.extraPhase(player, 'phaseUse', null, 'bts_sk_fanshi');
    }
}

export const skill = {
    // ── 必杀技·燔世（源 max_fanshiCard + st_fanshi，L8750-8991）──
    // 即时 content：扣火种 → 变身 → 除名 → 上限/回满 → 快照名单并发首个波次回合。延后（名单驱动）：
    // drive/drive_skip 被吞 → advanceFanshiChain 补链（判据 bts_fanshi_pending，勿依赖 event.skill）；
    // settle 夺牌→爱诗→还原；huanyuan 兜底濒死/死亡/链停滞与神躯限制。源为单笔同步流程、不可嵌套回合，
    // 故拆「即时 + 外部挂起回合/阶段」（跨回合结算审计·白厄范式）；波次 = 未除名者依次各一个额外回合。
    bts_sk_fanshi: {
        bts_bisha: true, // 终结技
        bts_bisha_angry: false, // 资源型必杀（火种发动、不消耗怒气）→ 拥有者不获得怒气（utils.hasAngryBisha 门控）
        // 引擎约定：非 multitarget 技能的 content 按每名目标各跑一次（useSkill 对 targets[num] 建
        // 子事件）；燔世为一次性全局结算，须 multitarget:true；event.targets 仍为全量
        //（除名名单 = 全集 − 选择）。
        multitarget: true,
        // 发动线自绘：multitarget 默认 line2 链式（白厄→目标1→目标1→…）不符「对各留场者发动」，关闭引擎线。
        line: false,
        // 特化方法（叁岛 util 范式）：见上方导出。
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
            // 发动线自绘：同时指向全部留场目标；依次延迟变体可用
            // `setTimeout(() => player.line(t,'green'), lib.config.duration * i)`。
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

            // 源 L8437（@@st_fanshi_chuwai!）：除名 = 真离场（无法选中、无回合）。名单 = 其他角色 −
            // 留场者；必须滤死者（filterPlayer 不排除死者，否则 count 虚高、上限增益与日志全错——F1）。
            const excluded = game.filterPlayer((target) => {
                return (
                    target !== player &&
                    target.isAlive() &&
                    !event.targets.includes(target)
                );
            });
            for (const p of excluded) p.addSkill('bts_sk_fanshi_chuwai');
            player.setStorage('bts_fanshi_excluded', excluded);

            // 源 L8438-8440：上限 += maxHp*(count-1) 再补满至新上限；recover 两写法均溢出/无效
            //（hp*count 溢出、hp*(count-1) 除名1人时无变化），故以 maxHp-hp 补满（对齐描述）。
            const count = excluded.length;
            if (count > 0) {
                const gain = player.maxHp >= 1 ? player.maxHp * (count - 1) : 0;
                if (gain > 0) {
                    await lib.bts.api.gainMaxHp(player, gain);
                    player.setStorage('bts_mk_fanshi_gain', player.getStorage('bts_mk_fanshi_gain', 0) + gain, true);
                }
            }
            await player.recover(player, player.maxHp - player.hp);

            // 源 L8772-8783 原为「预算 8、按趟轮转」；定夺改为「未除名者依次各一个额外回合」（一人一次）。
            // 此处只启动（记 active、快照名单、发首个回合）；不可嵌套回合，其后由 drive/drive_skip 链推进。
            player.setStorage('bts_mk_fanshi_active', 1, true);
            player.setStorage('bts_mk_fanshi_ending', 0, true);
            delete player.storage.bts_fanshi_settling;
            delete player.storage.bts_fanshi_chain;
            player.storage.bts_fanshi_queue = lib.skill['bts_sk_fanshi'].util.fanshiOthers(player);
            if (!lib.skill['bts_sk_fanshi'].util.issueFanshiTurn(player)) {
                // 理论不可达（filter 已保证其他存活者≥1 且选出≥1 留场者）；兜底立即还原。
                await lib.skill['bts_sk_fanshi'].util.endFanshi(player);
            }

            // 恢复/变回不在此：收尾链由 settleFanshi / endFanshi 承担。
        },
        ai: {
            // ai-guard: skip：发动即变身移除本体（reinit 换技）、火种扣除 12/6——同阶段不可能再入选；
            // content 直落结算（无内层选择/早退），无重复空转路径（§8 豁免）。
            // AI 口径：火种达线（12；星启首融 6）且场上有敌方存活才发动；收益=除名换上限体力池 +
            // 每名留场敌人一轮额外出牌期 + 收尾夺各 1 牌，星启首融档资源效率翻倍、残血时回满救命
            //（源 animal.lua L8223-8485；留场名单=敌方，友方除名=离场保护）
            order(item, player) {
                const firstGod =
                    lib.bts.api.god(player) &&
                    !player.getStorage('bts_mk_fanshi_used', 0);
                const need = firstGod ? 6 : 12;
                if (player.countMark('bts_mk_huozhong') < need) return -1; // filter 同门（火种线）
                const enemies = game.countPlayer(
                    (t) =>
                        t.isAlive() &&
                        t !== player &&
                        get.attitude(player, t) < 0,
                );
                if (!enemies) return -1; // 无敌方：留场名单无处可落，不发动
                let value = 8; // 底：变身+除名上限池+波次额外出牌期+收尾夺牌一体结算
                if (enemies >= 2) value += 1; // 波次多轮、追斩多目标
                if (firstGod) value += 1; // 6 火种档：资源效率翻倍（此后回归 12）
                if (player.hp <= 2) value += 1; // 残血：除名后回满=救命兼反打
                return Math.min(9, value);
            },
            result: {
                // 施动方基线（供目标选择计分）：须≤2，否则友方（态度+1）也会被选入
                player: 1,
                // 留场名单（多目标，区分函数）：敌方（态度<0）留场参战——收尾被夺 1 牌+成为波次/
                // 追斩对手，残血更易被击杀；友方取负分排除（除名=离场保护、结算后回归）
                //（final = player×态度施动 + target×态度目标，源 L8437-8462）
                target(player, target) {
                    if (get.attitude(player, target) >= 0) return -2;
                    let v = -2;
                    if (target.hp <= 2) v -= 0.5; // 残血敌方优先留场：波次/追斩窗口内可击杀
                    return v;
                },
            },
        },
        subSkill: {
            // ── 除名·离场（源 st_fanshi_chuwai alive=false，L8401-8422）──
            // group:'undist' 令其从回合与目标选择中消失；init 加 out class，结算终止 removeSkill 恢复。
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

            // ── 燔世·波次标记（显示）：波次回合持有者用；纯表现——回合结束由 drive 移除、收尾由 endFanshi 扫尾。──
            wave: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
                silent: true,
                nopop: true,
                charlotte: true,
            },

            // ── 燔世·波次驱动（回合被吞保护）：被取消/跳过的回合不触发 phaseEnd，链会停摆。
            // 用官方时机响应：① phaseCancelled（任何 event.cancel()，含翻面跳过）；② phaseSkipped
            //（player.skip('phase')）。补偿 = 照常 advanceFanshiChain（被吞视同已执行，名单照常推进）。──
            drive_skip: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
                trigger: { global: ['phaseCancelled', 'phaseSkipped'] },
                forced: true,
                silent: true,
                nopop: true,
                charlotte: true,
                filter(event, player) {
                    // 名单驱动（同 drive）：只补偿带 bts_fanshi_pending 标记的回合。
                    return (
                        player.getStorage('bts_mk_fanshi_active', 0) > 0 &&
                        event.player?.storage?.bts_fanshi_pending === true
                    );
                },
                async content(event, trigger, player) {
                    if (!trigger) return;
                    if (trigger._bts_fanshi_compensated) return; // 同一回合被重复取消时防重
                    trigger._bts_fanshi_compensated = true;
                    // 触发技约定：trigger 是回合事件（数据读 trigger.*）。清「燔世·续」显示标记与
                    // 自记账标记（后者防残留使普通回合被误判为波次回合）。
                    const skipped = trigger.player;
                    if (skipped && skipped !== player) {
                        if (typeof skipped.removeSkill === 'function') skipped.removeSkill('bts_sk_fanshi_wave');
                        if (skipped.storage) delete skipped.storage.bts_fanshi_pending;
                    }
                    // 与 drive 相同的补链（被吞回合视同已执行，不影响名单推进）。
                    lib.skill['bts_sk_fanshi'].util.advanceFanshiChain(player);
                },
            },

            // ── 燔世·波次驱动（延后结算①）──
            // 源 st_fanshi（L8880-8884）：燔世回合结束 → ExtraPhase(p, Player_Play)——卡厄斯兰那执行
            // 一个额外出牌阶段（阶段而非回合、无摸牌）。本技挂卡厄斯兰那（变身期持有；白厄基础技能
            // 已被 reinit 移除）。判据：被结束回合者带 bts_fanshi_pending 自记账标记（勿依赖引擎回合
            // 标签）；弑魂/普通回合天然不触发（对应源 fanshi_slash 压制 L8881）。
            drive: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
                trigger: { global: 'phaseEnd' },
                forced: true,
                silent: true,
                nopop: true,
                charlotte: true,
                filter(event, player) {
                    // 判据 = 被结束回合者带 bts_fanshi_pending（发放时写入、处理时清除）；勿依赖引擎侧
                    // 标签（event.skill/getExtraSkill 时序不可靠）。伪回合不带该标记，天然排除自连锁。
                    return (
                        event.player !== player &&
                        player.getStorage('bts_mk_fanshi_active', 0) > 0 &&
                        event.player?.storage?.bts_fanshi_pending === true
                    );
                },
                async content(event, trigger, player) {
                    // 回合结束：清其「燔世·续」显示标记与自记账标记（event 是技能事件，event.player=白厄）。
                    const ended = trigger.player;
                    if (ended?.storage) delete ended.storage.bts_fanshi_pending; // 清除自记账标记（本轮回合已消费）
                    if (ended && typeof ended.removeSkill === 'function') {
                        ended.removeSkill('bts_sk_fanshi_wave');
                    }
                    // 源 ExtraPhase(Play) + 续发/收尾：伪回合与推进步骤同队 FIFO（先伪回合、后步骤）。
                    lib.skill['bts_sk_fanshi'].util.advanceFanshiChain(player);
                },
            },

            // ── 锁定技·燔世·还原（源 st_fanshi EnterDying/Death，L8880-8890；另含链停滞兜底）──
            // ① dying（源 L8884-8887）：回复至 1 点、nodying 阻断濒死（busi 范式）、标记中断波次；后续转收尾。
            // ② dieAfter（源 L8888-8890）：仅恢复除名与清态（不还原/不扣上限/不授阶段）。
            // ③ phaseEnd 兜底：活跃中且无待执行波次/弑魂回合、不在链推进中 → 链停滞，收尾。
            //（不用 phaseZhunbeiBegin——白厄自续阶段伪回合也以其开始，会误触。）
            huanyuan: {
                sub: true,
                sourceSkill: 'bts_sk_fanshi',
                trigger: { player: ['dying', 'phaseEnd', 'dieAfter'] },
                forced: true,
                // dieAfter 分支（自己阵亡）在标 dead 后派发，须 forceDie；dying/phaseEnd 不受影响
                forceDie: true,
                filter(event, player, triggername) {
                    if (!player.getStorage('bts_mk_fanshi_active', 0)) return false;
                    // filter 第 3 参 triggername 为带后缀完整触发名（event.name 是基名）
                    if (triggername === 'dieAfter') return event.player === player;
                    // 源 L8884-8887：燔世期间进入濒死即触发（神躯防御：回1不死）
                    if (triggername === 'dying') return true;
                    // 兜底：无待执行波次/弑魂回合且未在收尾/链推进中 → 链停滞，收尾。
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
                        // 源 L8884-8887：回复至 1 点（不死）。对致死父事件设 nodying 阻断濒死（busi 范式：
                        // 不 cancel 濒死事件，否则结算不完、_status.dying 不清）；hp>0 后 dying step2 自然收尾。
                        const evt = trigger.getParent();
                        if (evt && (evt.name === 'damage' || evt.name === 'loseHp')) evt.nodying = true;
                        if (player.hp < 1) await player.recover(player, 1 - player.hp);
                        player.setStorage('bts_mk_fanshi_ending', 1, true); // 中断波次：后续推进步骤转收尾
                        return;
                    }
                    if (event.triggername === 'dieAfter') {
                        // 源 st_fanshi Death（L8888-8890）：仅恢复除名（不还原变身/不扣上限/不授阶段）
                        await lib.skill['bts_sk_fanshi'].util.endFanshi(player, {
                            restoreHero: false,
                        });
                        return;
                    }
                    // phaseEnd 兜底：链停滞（如携带波次回合者阵亡致队列静默、锚点事件未触达等）→ 收尾
                    await lib.skill['bts_sk_fanshi'].util.settleFanshi(player);
                },
                // 神躯限制（源描述 + 定夺）：变身期间只能用技能（视为/转化，如血棘/弑魂/天裁）或响应
                // 他人的牌，不能主动用非转化实体牌。引擎在 mod 前已 get.autoViewAs 转 VCard（card 恒为
                // vcard、无 card.isVirtual），统一按 get.is.convertedCard / virtualCard 判定。
                mod: {
                    cardEnabled(card, player) {
                        if (player.getStorage('bts_mk_fanshi_active', 0) <= 0) return;
                        if (get.is.convertedCard(card) || get.is.virtualCard(card)) return;
                        return false;
                    },
                },
            },
        },
    },

    // ── 锁定技·身炬（源 st_shenju，L8322-8352）──
    // 其他角色令你回复体力/怒气、附加祝福或护盾、获得牌后，你受到伤害后，或你弃置【杀】后，
    // 若火种<15 则 +1（怒气/祝福/护盾三源按定夺补：addAngry/addBless/addShield 广播
    // bts_resource_add，本技能监听结算）。锁定技（forced）无询问 → 不配 ai；火种为燔世资源来源。
    bts_sk_shenju: {
        // 均以你为当事人（event.player === 你），故用 player: 触发；filter 第 3 参 triggername 为完整触发名。
        trigger: {
            player: [
                'gainAfter',
                'recoverEnd',
                'damageEnd',
                'loseAfter',
                'bts_resource_add',
            ],
        },
        forced: true,
        filter(event, player, triggername) {
            // 源 L8345：火种<15 才触发
            if (player.countMark('bts_mk_huozhong') >= 15) return false;
            // 源 L8341-8344：你受到伤害
            if (triggername === 'damageEnd') return event.num > 0;
            // 他人令你获得怒气/祝福/护盾 → bts_resource_add（自注册）。
            if (triggername === 'bts_resource_add') return event.from !== player;
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
    },

    // ── 触发技·辟地（源 st_pidi = TriggerSkill Damage，L8353-8363）──
    // 当你造成伤害后，你可以弃置一张【杀】获得1枚火种。
    bts_sk_pidi: {
        // 源以 damage.from 触发、描述「造成伤害后」；用 player: 会误在受伤时触发，须 source:。
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
                // cost 型触发技：发动决策=本处弃牌分值（引擎不询顶层 check）。火种为燔世资源
                //（12 线），弃【杀】（价值≈4-5）换 +1 枚≈纯赚——对齐虹光「6-价值」口径，
                // 仅高价【杀】保留（源 animal.lua L8353-8363）
                .set('ai', (card) => 6 - get.value(card))
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌在技能事件 event.cards（标准约定）
            if (event.cards) await player.discard(event.cards);
            // 源 L8359：player:gainMark("@huozhong")
            if (player.countMark('bts_mk_huozhong') < 15) player.addMark('bts_mk_huozhong', 1);
        },
        ai: {
            // 施动方：+1 火种（燔世资源循环）≈+1；发动决策在 cost 的 ai 分值（cost 型触发技）
            result: { player: 1 },
        },
    },

    // ── 变身技·血棘（源 fanshi_duel = ViewAsSkill n=2，L8394-8414）──
    // 出牌阶段，弃两张手牌视为使用【决斗】，然后结束出牌阶段。
    //（源 enabled_at_play 三技互斥：未用血棘〔永久〕&& 弑魂本回合未用 &&〔天裁本回合未用 || 强化〕；
    //  以 useSkill 历史按回合近似源 hasUsed）
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
        ai: {
            // ai-guard: skip：content 直落（弃牌→决斗→结束出牌阶段），无内层选择/早退；发动即置
            // bts_mk_fanshi_duel-play 永久锁 + usable:1 + 结束阶段，同阶段不可能重复入选（§8 豁免）。
            // AI 口径：弃 2 手牌视为使用【决斗】并结束出牌阶段；仅对敌方出手（友方决斗纯亏），
            // 无敌方不发（源 animal.lua L8394-8414；变身期出牌阶段富余，结束阶段代价≈0）
            order(item, player) {
                if (
                    !game.hasPlayer(
                        (t) =>
                            t.isAlive() &&
                            t !== player &&
                            get.attitude(player, t) < 0,
                    )
                )
                    return -1;
                return 7;
            },
            result: {
                player: 1,
                // 目标受损：决斗≈1 点伤害+破坏响应；残血目标接近击杀加分（负=受损，目标态度翻正）
                target: (player, target) => -2 - (target.hp <= 2 ? 0.5 : 0),
            },
        },
    },

    // ── 变身技·弑魂（源 fanshi_slash = ViewAsSkill n=999 + SkillCard，L8924-8960）──
    // 出牌阶段，弃等同于其他角色数的手牌：所有（未除名）其他角色各执行一个额外回合，然后视为对
    // 这些角色使用【杀】，并结束出牌阶段。
    // 插入回合只能排队、无法在 content 内同步跑完；为保「先回合、后杀」源顺序，「使用【杀】」移到
    // subSkill.tail（最后一个弑魂回合结束时执行）。
    bts_sk_shihun: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8957）：手牌≥其他角色数、未用血棘、弑魂本回合未用、且（天裁本回合
            // 未用 || 强化）。“其他角色数”= 未除名存活者（源 getAliveSiblings 排除 alive=false）。
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
            // 引擎对函数式 selectCard 零参调用（get.select(select)→select()），须从事件栈取 player
            //（官方范式 _status.event.player）；弃牌数 = 其他角色数（未除名存活者，源 L8438）。
            const player = _status.event?.player;
            if (!player) return 1; // 兜底：非预期调用场景不至崩溃（合法流程由 filter 保证 count≥1）
            return lib.skill['bts_sk_fanshi'].util.fanshiOthers(player).length;
        },
        async content(event, trigger, player) {
            const targets = lib.skill['bts_sk_fanshi'].util.fanshiOthers(player);
            await player.discard(event.cards);
            // 弑魂"已用"以 useSkill 历史按回合跟踪（源 hasUsed("#fanshi_slash")），不设永久标记
            lib.bts.api.endPlayPhase(player); // 源 L8928：Global_PlayPhaseTerminated
            // 源 L8929-8935：未除名者各执行一个额外回合（标签 bts_sk_shihun——与燔世波次回合
            // bts_sk_fanshi 区分：不触发白厄出牌阶段；追斩见 subSkill.tail）。
            player.storage.bts_shihun_targets = targets.slice();
            player.storage.bts_shihun_waiting = targets.slice();
            for (const target of targets) lib.bts.api.extraTurn(target, 'bts_sk_shihun');
        },
        ai: {
            // ai-guard: skip：content 直落（弃牌→结束出牌阶段→排队各目标额外回合），无内层选择/早退；
            // 发动即结束阶段 + usable:1/回合历史闸门，同阶段不可能重复入选（§8 豁免）。
            // AI 口径：弃 N 张（N=未除名其他角色数）令其各执行一个额外回合、随后各吃一张虚拟【杀】；
            // 收益随 N 放大（群斩围攻者），手牌不足由 filter 拦（源 animal.lua L8924-8960）
            order(item, player) {
                const targets =
                    lib.skill['bts_sk_fanshi'].util.fanshiOthers(player);
                if (targets.length === 0) return -1; // filter 同门（名单为空：无追斩目标）
                if (player.countCards('h') < targets.length) return -1; // filter 同门（弃牌数=名单数）
                let value = 5; // 底：追斩群袭（先各自回合、后每人一张虚拟【杀】）
                if (targets.length >= 2) value += 1; // 多目标：群斩收益叠加
                if (targets.some((t) => t.hp <= 1)) value += 1; // 有残血目标：追斩可收割
                return value;
            },
            result: {
                player: 1,
                // 目标受损：回合后各吃一张虚拟【杀】；残血者更近击杀（负=受损，目标态度翻正）
                target: (player, target) => -1 - (target.hp <= 1 ? 0.5 : 0),
            },
        },
        subSkill: {
            // ── 弑魂·追斩（延后结算）：最后一个弑魂回合结束后，视为对全部目标使用【杀】──
            // 源 L8935：ViewAsCard(..., "_fanshi_slash") 于他人回合跑完后执行。阵亡（dieAfter）/被吞
            //（cancel/skip）的回合从待列表剔除；清空即结算追斩（幂等）。
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
                        // 回合被吞保护：cancel/skip 的弑魂回合不触发 phaseEnd，在此视同已过并剔除，避免追斩永不结算。
                        return event.skill === 'bts_sk_shihun' && waiting.includes(event.player);
                    }
                    // 剔除判据 = 回合自身标签 + getExtraSkill() 兜底（同 drive；单用 event.skill 时序不可靠）。
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
                    // 弑魂链完成（含追斩）：为燔世的收尾等待补触发（门控见 maybeSettleFanshi）。
                    await maybeSettleFanshi(player);
                },
            },
        },
    },

    // ── 变身技·天裁（源 fanshi_draw = ViewAsSkill / SkillCard，L8460+）──
    // 出牌阶段，若手牌少于7可摸至七张（至多摸四张），然后按摸牌数令随机其他角色附加烈阳；
    // 处于烈阳的角色弃一张手牌并移除1层烈阳。
    bts_sk_tiancai: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8482）：手牌<7、天裁/弑魂本回合未用、未用血棘（永久）；
            //“其他角色”= 未除名存活者数（排除死者与离场者）。
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
            for (const target of lib.bts.api.seatOrder(
                game.filterPlayer(
                    (target) =>
                        lib.bts.api.getAbnor(target, 'lieyang') &&
                        target.countCards('h'),
                ),
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
        ai: {
            // ai-guard: skip：content 直落（摸牌→随机附加烈阳→持有者各弃 1 牌），无内层选择/早退；
            // 摸牌恒≥1 + usable:1/回合历史闸门，同阶段不可能重复入选（§8 豁免）。
            // AI 口径：手牌<7 时摸至七（至多 4 张）并按摸牌数向随机其他角色附加烈阳（≈弃 1 手牌的
            // 骚扰）；星启摸满 4 张可不结束出牌阶段（保留连招窗口）显著加分（源 animal.lua L8450 起）
            order(item, player) {
                if (
                    lib.skill['bts_sk_fanshi'].util.fanshiOthers(player)
                        .length === 0
                )
                    return -1; // filter 同门（无其他角色：烈阳无处可附）
                const amount = Math.min(7 - player.countCards('h'), 4);
                if (amount <= 0) return -1; // filter 同门（手牌≥7 不可用）
                let value = 3 + amount; // 每张摸牌≈1 分，随附的烈阳为骚扰增益（4~7）
                if (lib.bts.api.god(player) && amount === 4) value += 1.5; // 星启满档：保留出牌阶段
                return Math.min(9, value);
            },
            result: {
                player: 2,
                // 目标受损：附 1 层烈阳（满 2 层触发致命伤害），持有者下次结算弃 1 手牌——
                // 附加目标随机，故不做逐目标细分
                target: -1,
            },
        },
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
    // 一律不写 log（定夺；active 显式 markLog:false 双保险——record 类由 shouldLogMark 静默）。
    // 读写经 setStorage/getStorage（-play 键仍由全局阶段清理 removeMark 清零）；def 保留供词条表。
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

// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_lieyang_faq',
        name: '|烈阳|',
        // 补「致命」（源文本 L14421「受到1点致命伤害」；实现走致命 reason——utils.js addAbnormal 分支）。
        info: `异常状态：由技能效果赋予；每满2层移除2层并对持有者造成1点${get.poptip('bts_glossary_bless_fatal_faq')}伤害。`,
    },
    {
        id: 'bts_glossary_huozhong_faq',
        name: '|火种|',
        info: `白厄专属：${get.poptip('bts_sk_shenju')}获牌/治疗、${get.poptip('bts_sk_pidi')}受伤弃杀各+1枚；满6/12由${get.poptip('bts_sk_fanshi')}变身${get.poptip('bts_sk_fanshi')}。`,
    },
    {
        id: 'bts_glossary_fanshi_active_faq',
        name: '|燔世状态|',
        info: `白厄变身状态：发动${get.poptip('bts_sk_fanshi')}（耗${get.poptip('bts_glossary_huozhong_faq')}）后变身${get.poptip('bts_ch_kaesilanna')}；场上其余角色依次各执行一个额外回合，每当这些回合之一结束你执行一个额外出牌阶段（${get.poptip('bts_sk_shihun')}等技能授予的回合不触发）；濒死时回复至1点并中断波次。`,
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
        + `变身为${get.poptip('bts_ch_kaesilanna')}。变身期间你不能正常使用牌，只能使用转化/虚拟牌或响应他人的牌。选择至少1名其他角色作为敌人保留在场，其余角色被除名（移出游戏），你的${get.poptip('bts_glossary_bless_maxhp_faq')}增至除名数的倍数，体力回复至上限；场上其余角色依次各执行一个额外回合，每当这些回合之一结束，你执行一个额外的出牌阶段（${get.poptip('bts_sk_shihun')}等技能授予的回合不触发）。变身期间进入濒死状态时，你回复至1点体力并中断波次。`
        + `波次结束后，你获得未除名者各一张牌，然后退出变身；退出时被除名者回归，你扣回此前增加的${get.poptip('bts_glossary_bless_maxhp_faq')}，体力取${get.poptip('bts_glossary_bless_maxhp_faq')}与你当前生命值的较小者，并获得一个额外的出牌阶段。`
        + `<li>若你拥有${get.poptip('bts_sk_aishi')}，波次结束时若流程内未进入过濒死状态，你可选择：①弃置所有手牌重复${get.poptip('bts_sk_fanshi')}流程，②获得6枚${get.poptip('bts_glossary_huozhong_faq')}`,

    bts_sk_fanshi_chuwai: '燔世·除名',
    bts_sk_fanshi_wave: '燔世·续',
    bts_sk_fanshi_drive: '燔世·续',
    bts_sk_fanshi_drive_skip: '燔世·续',
    bts_sk_shihun_tail: '弑魂·斩',
    bts_sk_shenju: '身炬',
    bts_sk_shenju_info: `锁定技，其他角色令你回复体力、回复${get.poptip('bts_glossary_nuqi_faq')}、附加${get.poptip('bts_glossary_bless_faq')}或${get.poptip('bts_glossary_hudun_faq')}、获得牌后，你受到伤害后，或你弃置【杀】后，若${get.poptip('bts_glossary_huozhong_faq')}少于15枚，你获得1枚${get.poptip('bts_glossary_huozhong_faq')}。`,
    bts_sk_pidi: '辟地',
    bts_sk_pidi_info: `当你造成伤害后，你可以弃置一张【杀】获得1枚${get.poptip('bts_glossary_huozhong_faq')}。`,
    bts_sk_fanshi_huanyuan: '燔世·还原',
    bts_sk_fanshi_huanyuan_info: `锁定技，每当一个因“${get.poptip('bts_sk_fanshi')}”获得的回合结束，你执行一个额外的出牌阶段（${get.poptip('bts_sk_shihun')}等技能授予的回合不触发）；变身期间你进入濒死状态时，回复至1点体力（不会死亡）并中断波次，波次随后结束时你获得未除名者各一张牌；若你拥有${get.poptip('bts_sk_aishi')}且流程内未进入过濒死状态，波次结束时你可以弃置所有手牌重复${get.poptip('bts_sk_fanshi')}流程，或获得6枚${get.poptip('bts_glossary_huozhong_faq')}并退出；退出变身时，被除名者回归，你扣回此前增加的${get.poptip('bts_glossary_bless_maxhp_faq')}（体力取${get.poptip('bts_glossary_bless_maxhp_faq')}与当前生命值的较小者）并获得一个额外的出牌阶段（不是回合）。你死亡时，仅令被除名者回归。`,
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
// dynamicTranslate 已覆盖的键无需在 simpleTranslate 重复。
export const simpleTranslate = {
    bts_sk_shenju_info: `锁；别人奶你/给你牌、你受伤或弃杀后+1${get.poptip('bts_glossary_huozhong_faq')}（封顶15）`,
    bts_sk_pidi_info: `造成伤害后，可弃杀+1${get.poptip('bts_glossary_huozhong_faq')}`,
    bts_sk_fanshi_huanyuan_info: `锁；每个${get.poptip('bts_sk_fanshi')}回合结束你执行额外出牌阶段（${get.poptip('bts_sk_shihun')}回合不触发），每名未除名者各1回合；濒死回1并中断；波次后夺未除名者各1牌，${get.poptip('bts_sk_aishi')}未濒死可弃手牌重复或+6${get.poptip('bts_glossary_huozhong_faq')}；退出取小还原并+1额外出牌阶段`,
    bts_sk_xueji_info: '弃2手牌当决斗用完就收手',
    bts_sk_shihun_info: '按场上剩余的其他角色数弃手牌，等他们额外回合走完再一人一发虚拟杀',
    bts_sk_tiancai_info: `摸到7张（至多4），随机给人挂${get.poptip('bts_glossary_abnormal_lieyang_faq')}，带${get.poptip('bts_glossary_abnormal_lieyang_faq')}的角色挨个弃牌；非${get.poptip('bts_glossary_xingqi_faq')}或摸不足4结束出牌阶段`,
};
export const dynamicTranslate = {
    bts_sk_fanshi(player) {
        const xingqiStr = (lib.bts.api.god(player) && !player.getStorage('bts_mk_fanshi_used', 0)) ? `-6` : `-12`;
        return `${get.poptip('bts_glossary_bisha_faq')}，${xingqiStr}枚${get.poptip('bts_glossary_huozhong_faq')}，变身为${get.poptip('bts_ch_kaesilanna')}，`
            + `变身后只能用转化/虚拟牌，或响应他人的牌。选至少1名敌人留场，其余除名；血量与上限增至除名数的倍数。场上其余角色依次各执行一个额外回合，每个这类回合结束你执行额外出牌阶段（${get.poptip('bts_sk_shihun')}回合不触发）。濒死时回至1血并中断波次。`
            + `波次后夺未除名者各1牌，还原变身（体力取较小者），+1额外出牌阶段`
            + `<li>若你拥有${get.poptip('bts_sk_aishi')}，波次结束未濒死可弃所有手牌重复${get.poptip('bts_sk_fanshi')}，否则+6${get.poptip('bts_glossary_huozhong_faq')}`;
    },
};
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音