// 崩铁杀规则辅助 API（对应 animal.lua L33-857）。挂载为 lib.bts.api，并由 shared.js 导出为 bts。
import { lib, game, ui, get, _status } from '../../../../noname.js';
import { MARKS, syncMarkSources, isLordGodEnabled } from './markRegistry.js';
import { NATURES } from './natures.js';

function markName(name, prefix) {
    const normalized = name?.startsWith('bts_') ? name.slice(4) : name;
    const prefixed = normalized?.startsWith(`${prefix}_`)
        ? normalized
        : `${prefix}_${normalized}`;
    return prefixed?.startsWith('bts_')
        ? prefixed
        : `bts_${prefixed}`;
}

function allMarks(player, prefix) {
    const prefixToFind = prefix?.startsWith('bts_') ? prefix : `bts_${prefix}`;
    return Object.keys(player.storage || {}).filter(
        (key) => key.startsWith(prefixToFind) && player.hasMark(key),
    );
}

// 已迁移：角色技能特化方法已移出本对象，按叁岛 util 字段范式挂载到对应技能的 util
//（bts_sk_fanshi.util：fanshiOthers/issueFanshiTurn/advanceFanshiChain/pushFanshiEvent/stealFanshi/settleFanshi/endFanshi；
//  bts_sk_mosuo.util：kafuka；bts_sk_canmeng.util：canmengActive；2026-09-02 TODO 整改，
//  白厄延后层（波次/收尾）重构 2026-09-26）。
// 本对象只保留通用规则 API（怒气/祝福/护盾/诅咒/异常/元素/回合/变形等）。
export const bts = {
    /**
     * 派发崩铁杀自定义事件（2026-10-02 技能效果自注册重构的基建）。
     * 范式与 bts_mark_add/bts_mark_remove 一致：构造 content='emptyEvent' 的子事件
     *（emptyEvent → event.trigger(event.name) 裸名派发），技能侧以
     * `trigger: { player/global: '<事件名>' }` 监听；事件名须在安装期登记
     * lib.hookmap（rules/index.js installCustomEventHooks），否则引擎门禁直接吞掉。
     * 时序：不 await 时监听者在「下一泵点」（当前同步段结束后）执行；需要
     *「监听者先于调用点后续代码完成」时 await 返回的事件（await 子事件会泵父
     * 事件队列——引擎 gameEvent.js then()/waitNext()，无死锁）。
     * @param {string} name 事件名（bts_ 前缀）
     * @param {object} fields 事件字段（如 { player, pet, repeated }）
     * @returns {object} 事件本体（可 await；forceDie/includeOut 保证死者/离场者照发）
     */
    emit(name, fields = {}) {
        const next = game.createEvent(name, false, get.event());
        Object.assign(next, fields);
        next.forceDie = true;
        next.includeOut = true;
        next.setContent('emptyEvent');
        return next;
    },

    /**
     * 全场结算遍历顺序（2026-09-29 用户定夺统一）：从当前回合角色（_status.currentPhase）
     * 起按座次展开，参照「属性杀触发铁索连环的结算顺序」。
     * 依据：源版 getAllPlayers() 从当前回合角色开始逐座次取全体；无名杀引擎同款实现——
     * `_lianhuan`（铁索连环传导）`lib.tempSortSeat = _status.currentPhase || player`、
     * useCard 目标排序 `targets.sortBySeat(_status.currentPhase || player)`。
     * 本扩展所有「对全体/多名角色的依次结算遍历」一律经本函数排序，不再从固定 1 号位开始。
     * @param {Player[]} list 待排序玩家集合（不修改原数组）
     * @returns {Player[]} 从当前回合角色起按座次展开的新数组
     */
    seatOrder(list) {
        return Array.from(list).sortBySeat(_status.currentPhase);
    },

    /**
     * 额外回合（额外出牌机会）工具集
     *
     * 无名杀的回合模型：一个回合 = 一个 name === "phase" 的 GameEvent，
     * 实际排队在它的父事件（通常是 phaseLoop 根事件）的 .next 队列里。
     *   - 正常回合：由 event.player.phase() 生成，不带 .skill
     *   - 额外回合：由 player.insertPhase() 生成，"一定"带 .skill
     *     （insertPhase 内 next.skill = skill || _status.event.name）
     * 因此 .skill 就是"额外回合"的天然判别标记，本文件围绕它封装三件事：
     *   当前是否额外回合 / 额外回合由谁发动 / 队列里还剩几个回合。
     */

    /** 
     * 额外回合
     * @param player 执行额外回合的玩家
     * @param turnName 额外回合的名字，建议填技能名event.name
     * @param count 插入的额外回合数量，默认为1
     */
    extraTurn(player, turnName, count = 1) {
        // 修：原首行误判未定义的 value → 永远 return，extraTurn 即成空操作（白厄续回合被吞）。
        if (count <= 0) return;
        for (let i = 0; i < count; i++) player.insertPhase(turnName);
    },
    // 已迁移：原兼容别名 grantExtraTurn（= extraTurn(player,'bts_extra_turn')）的调用方已全部
    // 改为显式 extraTurn(player, 'bts_extra_turn')，别名已删除（2026-09-02 TODO 整改）。
    // 历史注：合颂改走 inExtraTurn() 判伤害来源是否正处额外回合后，旧 storage
    // bts_extra_turn_granted 与 resolver 的清理一并删除（见 resolver.js phaseZhunbeiBegin 注释）。
    /** 
     * 额外阶段
     * @param player 执行额外阶段的玩家
     * @param phases 可传阶段字符串名，也可传数组生成多个阶段
     * @param trigger 调用处所在的时机对象，传入时在trigger对应的“回合内”执行额外阶段，否则插入一个新回合执行额外阶段
     * @param turnName 额外阶段或回合的名字，建议填技能名event.name
     */
    extraPhase(player, phases, trigger, turnName) {
        phases = Array.isArray(phases) ? phases : [phases];
        turnName = turnName ? turnName : _status.event.name

        if (trigger) { // 处理在回合内进行的额外回合
            phases.reverse();
            for (const ph of phases) {
                trigger.phaseList.splice(trigger.num, 0, turnName ? `${ph}|${turnName}` : ph);
            }

            return;
        }
        const phaseName = turnName ? turnName :
            phases.length > 1 ? undefined : phases[0];

        const ph = player.insertPhase(phaseName);
        ph._noTurnOver = true;
        ph.phaseList = [].addArray(phases);
        return ph;
    },

    // 已迁移：知更鸟·合颂 inExtraTurn(event.source)、星期日·恩赐 inExtraTurn(player)、
    // 希儿·再现 getExtraSkill()==='bts_sk_zaixian' 等与额外回合判断的相关技能均改用本家族方法
    //（2026-09-02 TODO 整改）；判别统一基于「额外回合 = phase 事件带 .skill」。
    /** 当前回合是否是额外回合 */
    isExtraTurn() {
        const phaseEvent = _status.event?.getParent("phase");
        return !!phaseEvent?.skill;
    },

    /**
     * 指定角色是否正处在其自身的额外回合内。
     * 对应源 @extra_turn 标记语义（内核 gamerule.cpp：额外回合 TurnStart 置 1、回合结束清 0，
     * 即"整个额外回合期间为 1"）；无名杀额外回合由 insertPhase 生成、phase 事件带 .skill，
     * 当前运行的 phase 事件之 player 即正在行使回合的角色。供知更鸟·合颂等
     * "伤害来源是否处于额外回合"判定使用（较 isExtraTurn() 多核对该 phase 的归属者）。
     */
    inExtraTurn(player) {
        const phaseEvent = _status.event?.getParent("phase");
        return Boolean(
            player && phaseEvent?.skill && phaseEvent.player === player,
        );
    },

    /** 当前额外回合由哪个技能发动；正常回合返回 undefined */
    getExtraSkill() {
        const phaseEvent = _status.event?.getParent("phase");
        return phaseEvent?.skill;
    },

    /** 单个回合事件是否命中筛选（player / 额外属性 / 来源技能） */
    phaseMatches(phase, { player, extra, skill } = {}) {
        if (!phase || phase.name !== "phase") return false;
        if (player && phase.player !== player) return false;
        if (extra === true && !phase.skill) return false;
        if (extra === false && phase.skill) return false;
        if (skill && phase.skill !== skill) return false;
        return true;
    },

    /**
     * 统计"从当前回合起、从头到尾"的回合数量。
     * 默认【包含当前回合】；明确排除才不计入（includeCurrent: false）。
     * 当前回合需要单独判一次因为它不在自己的 .next 队列里；
     * 其余回合通过向上遍历所有祖先事件的 .next 队列统计（覆盖嵌套插回合的场景）。
     *
     * @param {object}  [opts]
     * @param {object}  [opts.player=null]      只统计该玩家的回合；不传为所有人
     * @param {boolean} [opts.extra]            true=只算额外回合；false=只算正常回合；不传=都算
     * @param {string}  [opts.skill]            只统计由指定技能发动的额外回合
     * @param {boolean} [opts.includeCurrent=true] 是否把当前回合也算进去
     */
    countPendingPhases({ player = null, extra, skill, includeCurrent = true } = {}) {
        let n = 0;
        const cur = _status.event?.getParent("phase");
        if (includeCurrent && this.phaseMatches(cur, { player, extra, skill })) {
            n++;
        }
        let evt = cur;
        while (evt) {
            for (const queued of evt.next || []) {
                if (this.phaseMatches(queued, { player, extra, skill })) {
                    n++;
                }
            }
            evt = evt.parent;
        }
        return n;
    },

    // —— 快捷封装示例 ——
    // // 含当前：#current 额外回合总数
    // countExtraRounds(opts = {}) {
    //     return this.countPendingPhases({ ...opts, extra: true });
    // },
    // // 不含当前：当前回合结束后还没打的额外回合数（"还剩几次机会"）
    // countRemainingExtraRounds(opts = {}) {
    //     return this.countPendingPhases({ ...opts, extra: true, includeCurrent: false });
    // },
    // // 含当前：#正常回合总数
    // countNormalRounds(opts = {}) {
    //     return this.countPendingPhases({ ...opts, extra: false });
    // },
    // // 不含当前：#正常回合剩余数
    // countRemainingNormalRounds(opts = {}) {
    //     return this.countPendingPhases({ ...opts, extra: false, includeCurrent: false });
    // },
    // // 含当前：#总回合数
    // countRounds(opts = {}) {
    //     return this.countPendingPhases(opts);
    // },
    // // 不含当前：#总回合剩余数
    // countRemainingRounds(opts = {}) {
    //     return this.countPendingPhases({ ...opts, includeCurrent: false });
    // },

    getAngry(player, amount, maxskill = true) {
        const value = player.countMark(MARKS.ANGRY);
        return amount == null
            ? value
            : (maxskill && player.countMark(MARKS.EXTRA_MAX) > 0) ||
            value >= amount;
    },
    // ── 怒气获取门控（2026-09-26 用户定夺）────────────────────────────────────
    // 仅拥有「以怒气发动的必杀技」的角色获得怒气：
    //  ① 无任何 bts_bisha 技能 → 不获得（怒气对其无用，避免 UI/日志噪声）；
    //  ② 必杀技不以怒气发动者（资源型必杀：白厄·燔世/黄泉·残梦/飞霄·凿荒/昔涟·誓约/
    //     霞蝶·亡哮/银狼999·无启）→ 不获得——这些必杀在技能对象上标 bts_bisha_angry: false。
    hasAngryBisha(player) {
        const skills = player.getSkills(null, false).slice();
        game.expandSkills(skills);
        return skills.some((skill) => {
            const info = lib.skill[skill];
            return info?.bts_bisha === true && info.bts_bisha_angry !== false;
        });
    },
    addAngry(player, amount = 1, from = player) {
        if (!this.hasAngryBisha(player)) return 0;
        player.addMark(MARKS.ANGRY, amount);
        // 2026-10-02 自注册重构：他人令你获得怒气/祝福/护盾（源身炬/寸强描述含此法；
        // 源代码未实现，按用户定夺补）统一广播 bts_resource_add，由身炬/寸强等技能
        // 监听自注册结算（原按 hasSkill 内联代执行的挂钩已删除）。
        this.emit('bts_resource_add', {
            player,
            from,
            kind: 'angry',
            markName: MARKS.ANGRY,
            num: amount,
        });
        return amount;
    },
    loseAngry(player, amount = 1) {
        if (player.countMark(MARKS.EXTRA_MAX) > 0)
            player.removeMark(MARKS.EXTRA_MAX, 1);
        else player.removeMark(MARKS.ANGRY, amount);
        return amount;
    },

    // 通用标记读写（原 getOther/addOther/loseOther，2026-09-02 改名为更规范合理的 getMark/addMark/removeMark，
    // 与 getAngry/getBless/getShield/getCurse/getAbnor 家族命名对齐）。
    getMark(player, mark, amount, maxskill = false) {
        const value = player.countMark(mark);
        return amount == null
            ? value
            : (maxskill && player.countMark(MARKS.EXTRA_MAX) > 0) ||
            value >= amount;
    },
    addMark(player, mark, amount = 1) {
        player.addMark(mark, amount);
        return amount;
    },
    removeMark(player, mark, amount = 1, from, maxskill = false) {
        if (maxskill && player.countMark(MARKS.EXTRA_MAX) > 0)
            player.removeMark(MARKS.EXTRA_MAX, 1);
        else player.removeMark(mark, amount);
        return amount;
    },

    // 主公星启启用条件已在 config.js 设定（bts_god_condition：均启用/仅崩铁在场/仅崩铁为主公/不启用），
    // 由 isLordGodEnabled()（markRegistry.js）门控本方法 isZhu 分支（2026-09-02 TODO 整改）。
    god(player) {
        // 星启（源 God = isLord() or @bless_god）：无名杀没有 isLord() 方法，
        // 主公以 isZhu 属性判断（身份模式）；并防御非 Player 对象（如技能按钮评估期）传入。
        // 主公星启（isZhu 分支）按 config bts_god_condition 门控（isLordGodEnabled，见 markRegistry.js）；
        // 技能星启（bless_god 层数）不受 config 影响。
        if (!player || typeof player.countMark !== 'function') return false;
        return (
            (player.isZhu === true && isLordGodEnabled()) ||
            player.countMark(MARKS.bless('god')) > 0
        );
    },

    // 统一标记来源同步（星启来源维护的具体注册见 markRegistry.js SOURCE_TRACKABLE_MARKS，
    // 含主公星启/技能星启并集、来源耗尽归空等规则）。其它标记如启用来源只需在
    // SOURCE_TRACKABLE_MARKS 注册并在 markIntro 传 trackSource。这里保留 godSync 命名
    // 供 content.js 的增删层钩子调用，实际逻辑委托给 markRegistry.js 的通用 syncMarkSources。
    godSync(player) {
        syncMarkSources(player);
    },

    getBless(player, name, amount) {
        // 残梦结算期间所有祝福无效（源 GetBless 返回 false/0）。
        // canmengActive 已移出本对象，挂载在黄泉 bts_sk_canmeng.util（角色技能特化方法）。
        if (lib.skill['bts_sk_canmeng']?.util?.canmengActive?.())
            return amount === -1 ? 0 : false;
        const mark = markName(name, 'bless');
        const value = player.countMark(mark);
        return amount == null
            ? value > 0
            : amount === -1
                ? value
                : value >= amount;
    },
    blessCount(player) {
        return allMarks(player, 'bts_bless_').length;
    },
    // 雨过天晴全场快门（源 AddBless/RemoveBless 的 st_qingkong 快照）：任一存活角色持有即全场
    // 生效（残梦结算期间 getBless 全局返回 false → 自动视为无）。体力上限祝福的翻倍判定
    // 与首入补差/末出补收均以此为准。
    yuguotianqingActive() {
        return game.hasPlayer(
            (target) =>
                target.isAlive() && this.getBless(target, 'yuguotianqing'),
        );
    },
    async addBless(player, name, amount = 1, from = player) {
        const mark = markName(name, 'bless');
        // 快照须在标记变更前取（源 AddBless：先算 st_qingkong 再 addPlayerMark）
        const qingkong = this.yuguotianqingActive();
        player.addMark(mark, amount);
        // 2026-10-02 自注册重构：他人令你附加祝福（源身炬描述含此法）广播 bts_resource_add，
        // 由身炬等技能监听自注册结算（原按 hasSkill 内联代执行的挂钩已删除）。
        this.emit('bts_resource_add', {
            player,
            from,
            kind: 'bless',
            markName: mark,
            num: amount,
        });
        if (mark === MARKS.bless('maxhp')) {
            // 源 AddBless L427-430：全场存在雨过天晴 → 翻倍
            await this.gainMaxHp(player, amount * (qingkong ? 2 : 1));
        }
        if (mark === MARKS.bless('yuguotianqing')) {
            // 源 AddBless L431-437：全场首个雨过天晴入场（添加前无人持有、且自己是首个
            // 持有者——添加后层数恰为本次量）→ 为所有持有体力上限祝福者补足翻倍差额
            if (
                !qingkong &&
                this.getBless(player, 'yuguotianqing', -1) === amount
            ) {
                for (const holder of this.seatOrder(
                    game.filterPlayer(
                        (target) =>
                            target.isAlive() &&
                            this.getBless(target, 'maxhp'),
                    ),
                )) {
                    await this.gainMaxHp(
                        holder,
                        this.getBless(holder, 'maxhp', -1),
                    );
                }
            }
        }
        if (mark === MARKS.bless('reyi')) {
            // 源 AddBless（animal.lua L436-438）：热意祝福加层同时附赠等量笑点（欢愉子系统）。
            player.addMark('bts_mk_funnypoint', amount);
        }
        return amount;
    },
    async removeBless(player, name, amount = 1, from = player) {
        if (name === 'allbless') {
            // 源 allbless（L534-546）：先移除 maxhp——自己同时持有雨过天晴与体力上限祝福时，
            // 其移除须拿到含雨过天晴的快照（×2 结算）；随后顺序移除其余祝福。
            // 不可并发（原 Promise.all）：翻倍快照依赖“前一项标记已移除”的确定次序。
            let maxhpCleared = false;
            if (
                player.countMark(MARKS.bless('yuguotianqing')) > 0 &&
                player.countMark(MARKS.bless('maxhp')) > 0
            ) {
                await this.removeBless(
                    player,
                    'maxhp',
                    amount === -1
                        ? player.countMark(MARKS.bless('maxhp'))
                        : amount,
                    from,
                );
                maxhpCleared = true;
            }
            for (const mark of allMarks(player, 'bts_bless_')) {
                if (maxhpCleared && mark === MARKS.bless('maxhp')) continue;
                await this.removeBless(player, mark, amount, from);
            }
            return;
        }
        const mark = markName(name, 'bless');
        // 快照须在标记变更前取（源 RemoveBless：先算 st_qingkong 再 removePlayerMark）
        const qingkong = this.yuguotianqingActive();
        const removed =
            amount === -1
                ? player.countMark(mark)
                : Math.min(amount, player.countMark(mark));
        player.removeMark(mark, removed);
        if (mark === MARKS.bless('maxhp') && removed) {
            // 源 RemoveBless L556-560：按移除前快照翻倍扣减
            await this.gainMaxHp(player, -removed * (qingkong ? 2 : 1));
        }
        if (
            mark === MARKS.bless('yuguotianqing') &&
            qingkong &&
            !this.getBless(player, 'yuguotianqing')
        ) {
            // 源 RemoveBless L561-576：最后一份雨过天晴被移除（自己归零，且含离场角色在内
            // 再无他人持有）→ 为所有持有体力上限祝福者收回翻倍差额（每层 -1 上限）
            const others = game.filterPlayer2(
                (target) =>
                    target !== player &&
                    this.getBless(target, 'yuguotianqing'),
                [],
                true,
            );
            if (!others.length) {
                for (const holder of this.seatOrder(
                    game.filterPlayer(
                        (target) =>
                            target.isAlive() &&
                            this.getBless(target, 'maxhp'),
                    ),
                )) {
                    await this.gainMaxHp(
                        holder,
                        -this.getBless(holder, 'maxhp', -1),
                    );
                }
            }
        }
        // 不死祝福归零且体力<1 → 立即进入濒死（源 MarkChanged animal.lua L570-571）。
        // 放本处而非 busi 技能内：busi 层数归零时其技能已被生命周期卸载，收不到自身
        // bts_mark_remove 事件；此钩子覆盖衰减/倏忽等全部移除路径（倏忽移除前已先回血，hp>0 不触发）。
        if (
            mark === MARKS.bless('busi') &&
            removed &&
            player.countMark(mark) === 0 &&
            player.hp < 1
        ) {
            await player.dying({});
        }
        return removed;
    },

    // 护盾：崩铁杀特殊护盾（与无名杀本体护甲不同），以 shield 标记层数实现，
    // 抵扣逻辑在 resolver.damageBegin2（贯通伤害不抵扣）。
    // 残梦期间护盾无效（源 GetShield L725-733 含 max_canmeng 检查；2026-10-02 补齐）。
    getShield(player, amount) {
        if (lib.skill['bts_sk_canmeng']?.util?.canmengActive?.()) {
            return amount == null ? 0 : false;
        }
        const value = player.countMark(MARKS.SHIELD);
        return amount == null ? value : value >= amount;
    },
    addShield(player, amount = 1, from = player) {
        player.addMark(MARKS.SHIELD, amount);
        // 2026-10-02 自注册重构：他人令你附加护盾（源身炬/寸强描述含此法）广播
        // bts_resource_add，由身炬/寸强等技能监听自注册结算
        //（原按 hasSkill 内联代执行的挂钩已删除）。
        this.emit('bts_resource_add', {
            player,
            from,
            kind: 'shield',
            markName: MARKS.SHIELD,
            num: amount,
        });
        return amount;
    },
    removeShield(player, amount = 1) {
        const removed = Math.min(amount, player.countMark(MARKS.SHIELD));
        player.removeMark(MARKS.SHIELD, removed);
        return removed;
    },

    // 「不可被其他角色指定为目标」状态判定（2026-10-01；貊泽·掠袭·潜行，源 alive=false 语义）。
    // 三处封锁共用本判据（rules/index.js installUntargetableGuard）：
    //   ① 卡牌选目标：moze.js 的 targetEnabled mod（引擎 canUse/chooseToUse 默认过滤器）；
    //   ② 技能选目标：候选守卫（Check.processSelection，UI 与 AI 名单同源）；
    //   ③ 自动「视为使用」：useCard 内容首步（技能固定目标直发，如黑塔·效率）。
    untargetable(target) {
        return Boolean(
            target?.hasSkill?.('bts_sk_lvexi') &&
                target.countMark('bts_mk_moze_stealth'),
        );
    },

    // 存活角色数（掠袭退出条件「全场仅剩2人」判据，2026-10-02 用户定夺恢复源版条件。
    // 源为 room:getAllPlayers(true):length()==2；计数口径同视界等既有实现：
    // game.players 中 isAlive() 者）。
    alivePlayerCount() {
        return game.players.filter((p) => p.isAlive()).length;
    },

    getCurse(player, amount) {
        const value = player.countMark(MARKS.CURSE);
        return amount == null ? value : value >= amount;
    },
    addCurse(player, amount = 1) {
        player.addMark(MARKS.CURSE, amount);
        return amount;
    },
    removeCurse(player, amount = 1) {
        const removed = Math.min(amount, player.countMark(MARKS.CURSE));
        player.removeMark(MARKS.CURSE, removed);
        return removed;
    },

    getAbnor(player, name, amount) {
        if (name == null) return allMarks(player, 'bts_abnormal_').length > 0;
        if (name === 'all' || name === 'allabnormal') {
            const count = allMarks(player, 'bts_abnormal_').length;
            return amount == null ? count : count >= amount;
        }
        const value = player.countMark(markName(name, 'abnormal'));
        return amount == null
            ? value > 0
            : amount === -1
                ? value
                : value >= amount;
    },
    abnormalCount(player) {
        return allMarks(player, 'bts_abnormal_').length;
    },
    async addAbnormal(player, name, amount = 1, from = player) {
        const mark = markName(name, 'abnormal');
        // 无名杀特化：体力上限减少异常保底 1——只施加实际可扣的层数（源 L8192 注释代码即
        // 此思路：min(原上限, 上限-1)）；未生效层不入账，移除时按入账层数回补（见
        // removeAbnormal），账目自洽。引擎 loseMaxHp 在 maxHp≤0 时直接令玩家死亡
        //（content.js loseMaxHp），源 sgs 建属性、允许扣至低值——特化差异点。
        if (mark === MARKS.abnormal('losemaxhp')) {
            amount = this.maxHpDeductable(player, amount);
            if (!amount) return 0;
        }
        player.addMark(mark, amount);
        if (mark === MARKS.abnormal('lieyang') && player.countMark(mark) >= 2) {
            player.removeMark(mark, 2);
            const damage = player.damage(1, 'nosource');
            damage.reason = 'bts_gamerule_bts_reason_fatal';
        }
        // await 驱动（无名杀事件惯例）：无父事件时主动执行（GameEvent.then→start），
        // 有父事件时随链执行；不可 fire-and-forget（孤事件在链停摆时延迟/不执行）。
        if (mark === MARKS.abnormal('losemaxhp'))
            await this.loseMaxHpGuarded(player, amount);
        return amount;
    },
    async removeAbnormal(player, name, amount = 1) {
        if (name === 'allabnormal') {
            for (const mark of allMarks(player, 'bts_abnormal_'))
                await this.removeAbnormal(player, mark, amount);
            return;
        }
        const mark = markName(name, 'abnormal');
        const removed =
            amount === -1
                ? player.countMark(mark)
                : Math.min(amount, player.countMark(mark));
        player.removeMark(mark, removed);
        // 层数=实际扣除量（add 侧保底后入账），按层回补即对称（账目自洽）；await 驱动
        // 回补事件（同 addAbnormal：不可 fire-and-forget）。
        if (mark === MARKS.abnormal('losemaxhp') && removed)
            await this.gainMaxHp(player, removed);
        return removed;
    },

    getNature(damage, player) {
        if (player)
            return (
                NATURES.find(
                    (nature) => player.countMark(MARKS.nature(nature)) > 0,
                ) ?? null
            );
        if (damage?._btsNature) return damage._btsNature;
        if (damage?.card?.storage?._btsNature)
            return damage.card.storage._btsNature;
        return (
            NATURES.find((nature) => damage?.reason?.includes(nature)) ?? null
        );
    },
    async addNature(player, nature, shenghua = false) {
        if (!NATURES.includes(nature))
            throw new Error(`未知崩铁元素：${nature}`);
        const previous = this.getNature(null, player);
        if (previous) {
            this.removeNature(player);
            if (previous === nature) {
                const abnormal = {
                    flame: 'burn',
                    wind: 'poison',
                    light: 'numb',
                    earth: 'fossilize',
                    frost: 'freeze',
                    dark: 'sleep',
                }[nature];
                this.addAbnormal(player, abnormal);
                return 'NatureXYZ';
            }
            await player.recover('nosource'); // 源 L331：RecoverStruct(nil) 无来源（原误作自源，G-01）
            player.addMark(MARKS.nature(nature)); // 替换为不同属性时补上新属性标记
        } else {
            player.addMark(MARKS.nature(nature));
        }
        // 败谢：附加元素时弃置一张手牌（源 AddNature L330-333；升华递归路径不重复结算）。
        if (!shenghua && this.getAbnor(player, 'baixie') && player.countCards('h'))
            await player.chooseToDiscard('败谢：弃置一张手牌', 'h', 1, true);
        if (!shenghua && this.getAbnor(player, 'shenghua'))
            await this.addNature(player, nature, true);
        return null;
    },
    removeNature(player, nature) {
        if (nature) {
            const mark = MARKS.nature(nature);
            player.removeMark(mark, player.countMark(mark));
            return;
        }
        for (const element of NATURES) {
            const mark = MARKS.nature(element);
            player.removeMark(mark, player.countMark(mark));
        }
    },

    // 定夺 2026-09-12（#2）：伤害 reason 后缀为崩铁杀特有，统一命名空间为
    // `_bts_reason_<tag>`（_common/_fatal/_critical/_through/_nature），避免与
    // 无名杀本体/其他扩展的 reason 字符串（如 _critical）经 includes 误撞。
    // API 仍收短标签（'_fatal' 等），内部映射；元素名后缀（_frost 等）为技能基名
    // 一部分（bts_sk_* 已命名空间化）不在此列。
    markDamage(damage, suffix) {
        if (!damage) return damage;
        const tag = `_bts_reason_${suffix.replace(/^_/, '')}`;
        if (
            damage.reason?.includes('_bts_reason_common') ||
            damage.reason?.includes(tag)
        )
            return damage;
        damage.reason = `${damage.reason || 'bts'}${tag}`;
        return damage;
    },
    setDamageNature(damage, nature) {
        if (!NATURES.includes(nature))
            throw new Error(`未知崩铁元素：${nature}`);
        damage._btsNature = nature;
        if (damage.card) {
            damage.card.storage ??= {};
            damage.card.storage._btsNature = nature;
        }
        return damage;
    },
    isSpecialDamage(damage, suffix) {
        // 无 reason（无名杀本体/其他扩展伤害）按源 getReason() 语义视为非 common：
        // 空 reason 无特殊后缀，走正常后缀判定自然为 false，不做提前排除
        //（用户定夺 2026-09-12 回退；仅显式 _bts_reason_common 豁免）。
        if (!damage || damage.reason?.includes('_bts_reason_common'))
            return false;
        if (suffix === '_allspecial')
            return [
                '_bts_reason_fatal',
                '_bts_reason_critical',
                '_bts_reason_through',
            ].some((key) => damage.reason?.includes(key));
        return Boolean(
            damage.reason?.includes(`_bts_reason_${suffix.replace(/^_/, '')}`),
        );
    },

    // 伤害原因串是否为必杀技（终结技）伤害。源 AddNew(damage,"max_") 语义 = reason 含
    // 必杀技技能名；无名杀以 bts_bisha 标签判定：reason 从尾向前往剥 "_后缀"，
    // 命中某必杀技技能对象（lib.skill[id]?.bts_bisha）即为真。兼容
    // markDamage 追加的 _bts_reason_fatal/_critical/_nature 等多级后缀（逐段剥回技能基名）。
    isBishaReason(reason) {
        if (typeof reason !== 'string' || !reason) return false;
        let base = reason;
        while (base.includes('_')) {
            if (lib.skill[base]?.bts_bisha === true) return true;
            base = base.slice(0, base.lastIndexOf('_'));
        }
        return false;
    },

    // 本次体力净变化量：正=恢复、负=丢失（伤害/直接失去体力/失去体力上限所致的当前
    // 体力扣减/changeHp 净变化）。对齐叁岛 hupan.js shichou filter 的符号约定
    // （changeHp→event.num、loseMaxHp→-event.loseHp）：changeHp/recover 的 num 本身
    // 即净变化（负=失去/正=恢复）；damage/loseHp 的 num 与 loseMaxHp 的 loseHp 均为
    // 正失量（失上限所致的当前体力扣减），取负得净变化。事件名取基名——event.name
    // 为基名，触发点后缀在 triggername（参见 baie.js 注释），勿再写 'damageEnd'/'loseHpEnd'。
    getChangedHp(event) {
        if (!event) return 0;
        const name = event.name;
        if (name === 'changeHp' || name === 'recover')
            return event.num || 0;
        if (name === 'damage' || name === 'loseHp')
            return -(event.num || 0);
        if (name === 'loseMaxHp') return -(event.loseHp || 0);
        return 0;
    },

    // 本次丢失的体力量（绝对值），由 getChangedHp 派生：净变化为负则取正、否则 0。
    getLostHp(event) {
        return -Math.min(0, this.getChangedHp(event));
    },

    async removeAbnormalChoice(player, chooser) {
        // 源 RemoveAbnormal(player, "choice", 1, chooser)：由 chooser（默认被移除者自己）
        // 选择移除一种异常各1层。定夺 2026-09-12（F-05）：改用技能选择界面（左慈化身式，
        // 直接列出异常技能、带描述），弃用 chooseControl 列表/自动取首键（对象键序近似随机）。
        const names = this.abnormalNames(player);
        if (!names.length) return;
        if (names.length === 1) {
            this.removeAbnormal(player, names[0], 1);
            return;
        }
        const chosen = await this.chooseAbnormal(
            chooser || player,
            names,
            `请选择移除${get.translation(player)}的一种异常`,
        );
        if (chosen) this.removeAbnormal(player, chosen, 1);
    },

    // 目标当前拥有的异常内部名列表（bts_abnormal_ 前缀、层数>0）。
    abnormalNames(player) {
        return Object.keys(player.storage || {})
            .filter(
                (key) =>
                    key.startsWith('bts_abnormal_') && player.countMark(key) > 0,
            )
            .map((key) => key.slice('bts_abnormal_'.length));
    },

    // 技能选择界面（左慈化身式：直接列出技能、带描述，非幻化之战模式窗口）——从异常内部名中选一个。
    // 无名杀 chooseSkill 仅接受角色技能表，此处按 chooseSkill 同款展示（【异常名】+描述点击项），
    // 由 picker（玲可/被移除者）直接点击选择，返回所选异常内部名（AI/观战缺省取首个，同源缺省）。
    async chooseAbnormal(picker, names, prompt) {
        if (!picker.isMine()) return names[0]; // AI 缺省取首个（源 askForChoice 默认）
        const { promise, resolve } = Promise.withResolvers();
        const dialog = ui.create.dialog('forcebutton');
        dialog.add(prompt || '请选择移除一种异常');
        let shown = 0;
        for (const name of names) {
            const key = `bts_abnormal_${name}`;
            const desc =
                (lib.skill[key]?.glossaryId &&
                    lib.translate[lib.skill[key].glossaryId + '_info']) ||
                lib.translate[key + '_info'];
            if (!desc) continue; // 同 chooseSkill：仅列出有描述的技能
            const item = dialog.add(
                '<div class="popup pointerdiv" style="width:80%;display:inline-block">' +
                    `<div class="skill">【${get.translation(key)}】</div><div>${desc}</div></div>`,
            );
            item.firstChild.addEventListener('click', () => resolve(name));
            item.firstChild.link = name;
            shown++;
        }
        if (!shown) {
            dialog.close();
            return names[0];
        }
        dialog.add(ui.create.div('.placeholder'));
        _status.imchoosing = true;
        const result = await promise;
        _status.imchoosing = false;
        dialog.close();
        return result;
    },

    // ── 无名杀特化：移除体力上限保底 1 ─────────────────────────────────────
    // 引擎 loseMaxHp 在 maxHp≤0 时直接令玩家死亡（content.js loseMaxHp：`if (player.maxHp <= 0)
    // await player.die(event)`），源 sgs 仅改属性、允许扣至低值；故崩铁杀所有“移除体力上限”
    // （体力上限祝福扣减、失上限异常、燔世变身还原等）统一保底：最多扣到 1 点，不会扣死。
    // 注：可扣量按调用时刻的 maxHp 计算（同刻连扣需调用方自行顺序化）。
    maxHpDeductable(player, amount) {
        return Math.min(
            Math.max(amount, 0),
            Math.max(0, player.maxHp - 1),
        );
    },
    // 保底扣除：返回生成的 loseMaxHp 事件（可 await）；已到保底（无点可扣）时返回 null。
    loseMaxHpGuarded(player, amount) {
        const dec = this.maxHpDeductable(player, amount);
        return dec > 0 ? player.loseMaxHp(dec) : null;
    },
    async gainMaxHp(player, amount = 1) {
        if (amount >= 0) await player.gainMaxHp(amount);
        else await this.loseMaxHpGuarded(player, -amount);
        return amount;
    },
    changeHero(player, to, { from, maxHp = null } = {}) {
        if (!player || !lib.character[to])
            throw new Error(`无法变形：未找到目标武将 ${to}`);
        from ??= player.name1 || player.name;
        if (!lib.character[from])
            throw new Error(`无法变形：未找到当前武将 ${from}`);
        // 雨桐↔钟雨桐法（源 animal.lua ChangeHero L125-149）：
        // 保留「额外上限」(当前maxHp−本将默认上限) 跨形态沿续；hp=min(新上限,旧hp)。
        // 忆灵召唤/消失不走本方法（见 changePetForm），其血量按忆灵体系规范单独计算。
        // reinit 第三参传 [hp,maxHp] 数组可同时显式设体力与上限，
        // 规避无名杀 reinit 传 null 只调上限不动体力的默认行为。
        const oldHp = player.hp;
        const fromDef = get.infoMaxHp(lib.character[from][2]);
        const toDef = get.infoMaxHp(lib.character[to][2]);
        const newMaxHp = toDef + (player.maxHp - fromDef);
        if (Array.isArray(maxHp)) {
            // 调用方显式 [hp, maxHp]，原样透传
            player.reinit(from, to, maxHp);
        } else if (maxHp != null) {
            // 调用方给数字 = 指定目标上限，hp 取原体力与上限较小者（源 Math.min）
            player.reinit(from, to, [Math.min(maxHp, oldHp), maxHp]);
        } else {
            player.reinit(from, to, [Math.min(newMaxHp, oldHp), newMaxHp]);
        }
        game.log(`#b【${lib.translate[from] || from}】`, '变为了', `#b【${lib.translate[to] || to}】`);
        return player;
    },
    // 忆灵换卡（A↔C 组合形态），遵循忆灵体系规范（用户定夺 2026-09-02，源 ChangeHero L125-149）：
    //   ① 召唤 A→C：C_h = A_h*+B_h、C_m = A_m*+B_m（主公再 +1，源 L132-137 组合主公额外+1）
    //   ② 消失 C→A：A_h = Min(C_h*, A_m*)、A_m* = C_m*-B_m（主公再 -1，源 L134-135 离开组合主公-1）
    // 技能迁移：经 player.reinit 换卡——reinit 内部对基础技能逐个 removeSkill/addSkill
    //   （不触发 changeSkills/changeSkill 时机），移除 from 基础技能、补 to 基础技能；
    //   A_s* 超出基础的部分（临时/授予技能）天然保留，storage（含 temp_ban_* 的 ban 状态）
    //   不被清除 → 自动继承。与通用 changeHero 区分（卡厄斯兰那换角色不继承技能、但继承血量，走 changeHero）。
    changePetForm(player, to, { from, pet, petMaxHp, petHp } = {}) {
        if (!player || !lib.character[to] || !lib.character[from])
            throw new Error(`忆灵换卡失败：缺少武将 ${from}/${to}`);
        const petInfo = pet ? lib.character[`bts_ch_${pet}`] : null;
        petMaxHp ??= petInfo?.[2] ?? 0;
        petHp ??= petMaxHp;
        const isLord = player.isLord?.() || player.isZhu === true;
        let newMaxHp, newHp;
        if (to.includes('_and_')) {
            // ① 召唤：C_h = A_h*+B_h、C_m = A_m*+B_m
            newMaxHp = player.maxHp + petMaxHp + (isLord ? 1 : 0);
            newHp = player.hp + petHp + (isLord ? 1 : 0);
        } else {
            // ② 消失：A_h = Min(C_h*, A_m*)、A_m* = C_m*-B_m
            newMaxHp = player.maxHp - petMaxHp - (isLord ? 1 : 0);
            newHp = Math.min(player.hp, newMaxHp);
        }
        player.reinit(from, to, [newHp, newMaxHp]);
        game.log(player, '变形为', `#g【${lib.translate[to] || to}】`);
        return player;
    },
    // 忆灵/组合形态生命周期。组合角色由角色模块以 transformCharacter 注册，
    // 宠物标记作为唯一状态源，基础角色 ID 写入 storage 以保证变形后可准确还原。
    // opts 可省略：base 取当前武将名，combined 按 `bts_ch_<base>_and_<pet>` 约定派生，
    // petHp 取 `bts_ch_<pet>` 角色体力（调用方可显式覆盖）。
    getPet(player, pet) {
        return player.countMark(MARKS.pet(pet)) > 0;
    },
    // 2026-10-02 用户定夺：登场/重复召唤结算按源代码全量对齐（animal.lua AddPet/RemovePet）——
    //   首次召唤：小伊卡 +1怒气、乐手 +1怒气；重复召唤（已在场再召）：长夜 +1体力、
    //   乐手 +6气氛、小伊卡 +1怒气（源尾块对每次召唤都结算）；重复召唤退回 false 不重复变形。
    // 2026-10-02 自注册重构：本函数只广播 bts_pet_add（字段 player/pet/repeated），上述效果由
    //   各忆灵形态技能（漆黑/心跳/展落）监听自注册结算；await 保证监听者先于调用点后续代码完成。
    async addPet(player, pet, { base, combined, petHp } = {}) {
        if (!player) throw new Error(`无法召唤忆灵 ${pet}`);
        // 2026-09-28 修复（咒礼召唤链·死者 hp=1 非法态）：召唤走 changePetForm 重算体力
        // （newHp = hp + petHp），若调用方先失体致死（咒礼 loseHp）后代码继续执行，会把
        // 尸体重算成 hp=1。死人不获得忆灵——语义门（离场侧忆灵技能 filter 亦有 isAlive 门）。
        // 实机 4 局：09-27 15:44 j2hlar / 17:55 co0tzs / 19:24 454yak / 23:06 2ggxef。
        if (!player.isAlive()) return false;
        // 重复召唤（源 AddPet else 分支 + 尾块）：忆灵已在场时不变形，广播 bts_pet_add 由各技能结算
        if (this.getPet(player, pet)) {
            await this.emit('bts_pet_add', { player, pet, repeated: true });
            return false;
        }
        base ??= player.name1 || player.name;
        combined ??= `bts_ch_${base.replace(/^bts_ch_/, '')}_and_${pet}`;
        if (!lib.character[combined])
            throw new Error(`忆灵 ${pet} 缺少可用组合形态 ${combined}`);
        if (!lib.character[base])
            throw new Error(`忆灵 ${pet} 缺少基础角色 ${base}`);
        const petInfo = lib.character[`bts_ch_${pet}`];
        petHp ??= petInfo?.[2] ?? 1;
        player.storage.btsPets ??= {};
        player.storage.btsPets[pet] = {
            base,
            combined,
            petHp,
            petMaxHp: petInfo?.[2] ?? petHp,
        };
        this.changePetForm(player, combined, {
            from: base,
            pet,
            petHp,
            petMaxHp: petInfo?.[2] ?? petHp,
        });
        // 源 L788-790：@pet_<pet> 初始 = 忆灵上限（主公再 +1），与 GetPetMaxHp 回补封顶一致
        const petLordBonus =
            player.isLord?.() || player.isZhu === true ? 1 : 0;
        player.setMark(MARKS.pet(pet), petHp + petLordBonus);
        // 首次登场结算（源 AddPet 首起分支 + 尾块）：乐手/小伊卡 +1怒气——由忆灵形态技能
        // 监听 bts_pet_add 自注册结算。原「此前召唤过→+6」近似口径已废弃。
        await this.emit('bts_pet_add', { player, pet, repeated: false });
        return true;
    },
    async removePet(player, pet, { base } = {}) {
        if (!player || !this.getPet(player, pet)) return false;
        const record = player.storage.btsPets?.[pet];
        base ??= record?.base;
        if (!base || !lib.character[base])
            throw new Error(`忆灵 ${pet} 缺少可还原的基础角色`);
        // 2026-10-02 自注册重构：先广播 bts_pet_remove（此刻忆灵形态技能仍挂载、忆灵标记仍在场），
        // 各忆灵技能（晚风/展落/晦翼）据此自注册结算离场效果；再变形还原 + 清标记。
        //（原内联效果在还原之后结算、不经技能；重构后必须前置到还原之前，触发器才能命中。）
        await this.emit('bts_pet_remove', { player, pet });
        const from = player.name1 || player.name;
        this.changePetForm(player, base, {
            from,
            pet,
            petMaxHp: record?.petMaxHp,
        });
        player.setMark(MARKS.pet(pet), 0);
        if (player.storage.btsPets) delete player.storage.btsPets[pet];
        // 衣匠：回怒气（源 RemovePet AddAngry；该忆灵无对应角色技能壳，保留为忆灵系统机制）
        if (pet === 'yijiang' && player.isAlive()) lib.bts.api.addAngry(player);
        return true;
    },
    // 忆灵生命池（源全局 HpChanged L1354-1396，用户定夺 2026-09-02 统一实现）：
    // 组合形态受伤等量扣忆灵生命、回复等量回补（封顶 GetPetMaxHp），归零自动 RemovePet。
    getPetLostHp(player, pet) {
        // 源 GetPetLostHp（L884-888）= 忆灵上限 − 当前忆灵生命（主公 +1 补偿初值 +1）
        const petInfo = lib.character[`bts_ch_${pet}`];
        const max = petInfo?.[2] ?? 1;
        const lordBonus = player.isLord?.() || player.isZhu === true ? 1 : 0;
        return Math.max(0, max - player.countMark(MARKS.pet(pet)) + lordBonus);
    },
    async petLifeDelta(player, delta) {
        // delta > 0 = 回复回补；delta < 0 = 承伤扣减；归零触发 removePet（含各自离场结算）
        if (!player || !delta) return;
        const marks = Object.keys(player.storage || {}).filter(
            (key) => key.startsWith('bts_pet_') && player.countMark(key) > 0,
        );
        for (const mark of marks) {
            const pet = mark.slice('bts_pet_'.length);
            const petInfo = lib.character[`bts_ch_${pet}`];
            const max =
                (petInfo?.[2] ?? 1) +
                (player.isLord?.() || player.isZhu === true ? 1 : 0);
            const cur = player.countMark(mark);
            if (delta > 0) {
                player.setMark(mark, Math.min(max, cur + delta));
            } else {
                const dec = Math.min(cur, -delta);
                const remaining = cur - dec;
                if (remaining < 1) {
                    // 归零：交 removePet 统一处理（其内部清零标记 + 变形还原 + 离场结算），
                    // 勿先 removeMark 清零，否则 removePet 的 getPet 前置检查会直接 return false
                    await this.removePet(player, pet);
                } else {
                    player.removeMark(mark, dec);
                }
            }
        }
    },

    // ── 欢愉子系统（源 animal.lua L11072-11205）──────────────────────────────
    // 欢愉行动（FunnyAct）：按持有者技能对象上的 bts_funny 注册表泛化派发（2026-10-02 自注册
    // 重构，原按技能 id 硬编码 if 链）；欢愉时刻（FunnyTime）令全场各执行一次欢愉行动；
    // 笑点（bts_mk_funnypoint）与欢愉祝福（bts_bless_funny）决定层数/概率。

    /** 是否拥有欢愉技能（源 FunnyPlayer L11072-11074；2026-09-29 阿哈（原创）亦计入） */
    funnyPlayer(player) {
        // 2026-09-28 修复：原查 `bts_st_${name}_funny` 恒 false（实际技能命名 bts_sk_*_funny，
        // 见 huohua/shajin_xilang/yinlang_lv999）→ 欢愉时刻授予祝福、afterFunnyAct 笑点链路从未触发。
        // 2026-09-29：阿哈（原创角色）拥有欢愉行动（使用/视为使用【无中生有】或【欢愉万相】），
        // 计入源术语「拥有欢愉行动的角色」（伤害约束、欢愉升格、“鉴映”类计数同此判定）。
        return (
            player &&
            (player.hasSkill('bts_sk_aha') ||
                ['paozhu', 'lianxian', 'qianguang', 'buzhui', 'baoshe', 'langzun'].some(
                    (name) => player.hasSkill(`bts_sk_${name}_funny`),
                ))
        );
    },

    /** 欢愉概率判定（源 FunnyNumber L11199-11205）：随机 1..100 ≤ num + 欢愉祝福层数×10 */
    funnyNumber(player, num) {
        const roll = Math.floor(Math.random() * 100) + 1;
        return roll <= num + this.getBless(player, 'funny', -1) * 10;
    },

    /** 忙盒（源 manghe L11356-11372）：随机 1..3 → 摸2 / +3 笑点 / 对伤过你的角色各失去1点体力 */
    async manghe(player, tim = 1) {
        for (let i = 0; i < tim; i++) {
            const n = Math.floor(Math.random() * 3) + 1;
            if (n === 1) {
                await player.draw(player, 2);
            } else if (n === 2) {
                player.addMark('bts_mk_funnypoint', 3);
            } else {
                const ids = new Set(
                    player
                        .getAllHistory('damage')
                        .map((e) => e.source?.playerid)
                        .filter(Boolean),
                );
                for (const p of this.seatOrder(
                    game.filterPlayer((p) => ids.has(p.playerid)),
                ))
                    await p.loseHp();
            }
        }
    },

    /** 欢愉行动后置（源 AfterFunnyAct L11137-11192）：+1 笑点；花手弃牌由其技能监听
     * bts_funny_act_after 自注册结算（本函数只广播，不再按 hasSkill 代执行）。 */
    afterFunnyAct(player) {
        player.addMark('bts_mk_funnypoint', 1);
        this.emit('bts_funny_act_after', { player });
    },

    /** 欢愉时刻（源 FunnyTime L11193-11205）：全场各执行一次欢愉行动。
     * @param {number|null} funny 传 -1/空=按笑点换算；其余按 funny/10
     * @param {*} num 'max_changyao' 时附带 0.0116 概率连发 9 次
     * @param {string} [initiator] 发起技能 id（透传给 funnyAct 做日志去重） */
    async funnyTime(room, funny, num, initiator) {
        if (funny == null) funny = -1;
        else funny = funny / 10;
        for (const p of this.seatOrder(game.filterPlayer((p) => p.isAlive()))) {
            p.storage.bts_funny_time = true;
            await this.funnyAct(p, funny, null, initiator);
            if (num === 'max_changyao' && this.funnyNumber(p, 0.0116))
                for (let i = 0; i < 9; i++)
                    await this.funnyAct(p, funny, null, initiator);
            delete p.storage.bts_funny_time;
        }
    },

    /**
     * 欢愉行动（源 FunnyAct L11079-11136）：funny 为层数/类型，target 为行动对象（默认自身）。
     * 2026-10-02 自注册重构：不再按技能 id 硬编码 if 链——各欢愉技能在技能对象上声明
     * `bts_funny: { order, act(ctx), late? }`，本函数泛化收集（getSkills 过滤，尊重封锁）并执行：
     *   act 阶段（late 非真，按 order 升序）→ 欢愉祝福步（funnytime）→ late 阶段（爆射）
     *   → 收束（ctx.after → afterFunnyAct 广播 bts_funny_act_after）。
     * ctx = { player, target, funny, funnytime, after, done, aborted }；执行顺序与旧 if 链
     * 1:1（阿哈→连线→抛注→…→祝福→爆射→收束），各 act 内对 ctx.funny/after 的改写语义不变。
     * 日志：行动技能 ≠ initiator（发起技能，其日志由引擎自动记录）时补 logSkill
     *（2026-10-02 用户定夺：欢愉时刻等非技能驱动路径的日志/音频归因完整）。
     * @param {object} player 执行欢愉行动的角色
     * @param {number|null} funny 层数/类型（null=自发行动）
     * @param {object} [target] 行动对象（默认 player 自身）
     * @param {string} [initiator] 发起技能 id（重复日志豁免；缺省=无发起技能，全部执行者记日志）
     * @returns {boolean} done（旧 if 链返回值语义）
     */
    async funnyAct(player, funny, target, initiator) {
        if (target == null) target = player;
        let funnytime = false;
        if (funny != null) {
            funnytime = true;
            if (funny === -1) {
                // 欢愉时刻：消耗全部笑点换算层数；抛注已发动时把热意一并替换为欢愉（仪式）
                funny = Math.ceil(player.countMark('bts_mk_funnypoint') / 10);
                if (player.getStorage('bts_mk_paozhu_funny_used', false)) {
                    player.setStorage('bts_mk_paozhu_funny_used', false, true);
                    funny += this.getBless(player, 'reyi', -1);
                    await this.removeBless(player, 'reyi', -1);
                }
                player.setMark('bts_mk_funnypoint', 0);
            }
        }
        const ctx = {
            player,
            target,
            funny,
            funnytime,
            after: true,
            done: false,
            aborted: false,
        };
        // 收集已注册的欢愉行动（须已挂载且未被封锁——getSkills 已滤 skillBlocker）。
        const skills = player.getSkills(null, false).slice();
        game.expandSkills(skills);
        const handlers = skills
            .filter(
                (skill) =>
                    typeof lib.skill[skill]?.bts_funny?.act === 'function',
            )
            .map((skill) => ({ ...lib.skill[skill].bts_funny, skill }))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const run = async (handler) => {
            // 非发起技能的行动补日志（含音频/动画）；发起技能由引擎自动日志，避免重复。
            if (handler.skill !== initiator && !lib.skill[handler.skill]?.silent)
                player.logSkill(handler.skill);
            await handler.act(ctx);
            return !ctx.aborted;
        };
        for (const handler of handlers)
            if (!handler.late && !(await run(handler))) return false;
        if (ctx.funnytime && this.funnyPlayer(player))
            await this.addBless(player, 'funny', ctx.funny);
        for (const handler of handlers)
            if (handler.late && !(await run(handler))) return false;
        if (ctx.after && this.funnyPlayer(player)) this.afterFunnyAct(player);
        return ctx.done;
    },

    /** 视为使用【欢愉万相】（2026-09-29 阿哈·原创）：万相为 bts_cd 包衍生物牌
     *（效果见 lib.card 定义——摸牌结构与「欢愉升格」授予）。阿哈体系统一入口。 */
    async useHuanjuWanxiang(player) {
        await player.useCard(
            { name: 'bts_cd_huanju_wanxiang', isCard: false },
            [],
        );
    },

    // ── 欢愉 AI 辅助（源 animal.lua L11075-11078 / StarRail-ai.lua L3706 NaturePlayer）──

    /** 伤害牌判定（源 DamageCardForFun L11075-11078）：万箭/南蛮/决斗/杀 */
    damageCardForFun(card) {
        return ['wanjian', 'nanman', 'juedou', 'sha'].includes(card?.name);
    },

    /** 元素/属性相关角色判定（源 NaturePlayer StarRail-ai.lua L3706-3728）：用于摇风/舔舐等 AI 选目标。
     *  未移植的技能经 hasSkill 自然返回 false，不影响已移植部分。 */
    naturePlayer(player) {
        if (!player) return false;
        if (
            player.hasSkill('bts_sk_tianzhui') ||
            (player.hasSkill('bts_sk_kuaiyu') && this.getAngry(player, 4))
        )
            return true;
        if (player.hasSkill('bts_sk_xiaomofa') && this.getAngry(player, 3))
            return true;
        if (player.hasSkill('bts_sk_shuoya') && player.countMark('bts_sk_shuoya') > 4)
            return true;
        if (player.hasSkill('bts_sk_yebao') && player.countMark('bts_mk_ebao') > 5)
            return true;
        if (player.hasSkill('bts_sk_wangxiao') && player.countMark('bts_mk_xinrui') > 4)
            return true;
        if (this.getBless(player, 'cifu')) return true;
        const maxSkills = [
            'wansi', 'huoying', 'mofa', 'yuqi', 'wushen', 'tianhe', 'zoukai', 'xinrou',
        ];
        const yesSkills = [
            'geju', 'zidian', 'lvexi', 'longli', 'yingyue', 'ciwen', 'quxu',
            'zoukai', 'zhouli', 'fengwang', 'fennu', 'yuanzheng',
        ];
        // 2026-09-28 修复：原查 bts_st_ 前缀恒 false（实际技能命名 bts_sk_*，同类于 funnyPlayer）；
        // 列表中含未移植技能者，经 hasSkill 自然返回 false，不受影响。
        for (const name of maxSkills)
            if (player.hasSkill(`bts_sk_${name}`) && this.getAngry(player, 5))
                return true;
        for (const name of yesSkills)
            if (player.hasSkill(`bts_sk_${name}`)) return true;
        return false;
    },

    /**
     * 结束出牌阶段（源 Global_PlayPhaseTerminated）。
     * 无名杀中出牌阶段已开始后（phaseUse 事件运行中）调用 player.skip('phaseUse') 无效：
     * checkSkipped 只在阶段事件创建前检查 skipList（gameEvent.js loop 起始），且残留标记会
     * 致下一回合出牌阶段被误跳。正确做法：找到**当前运行中的 phaseUse 事件**设 skipped=true，
     * phaseUse content 据此不再 goto(3)（content.js「if (result.bool && !event.skipped)」；
     * 官方主动技同款写法，如 character/collab/skill.js oldingbao）。
     * 查找策略（2026-09-26 加固，二段）：
     *   ① 首选直接扫描事件管理器执行栈（eventStack）自顶向下找未完成的 phaseUse——
     *      权威且不依赖 parent 链（getParent 找不到时返回空对象 {}，旧写法 `if (evt)` 因 {}
     *      恒真而静默失效；官方近年写法亦皆以 `phase?.name == 'phaseUse'` 防御）；
     *   ② 兜底 getParent('phaseUse', true)（forced=true，找不到返回 undefined）。
     * 返回是否成功设置；失败时不设置任何残留标记（避免 skipList 误跳下回合）。
     * 仅用于出牌中/出牌后的技能结算内；准备阶段等提前跳出不适用（彼时应直接 skip()）。
     */
    endPlayPhase(player) {
        const stack = _status.eventManager?.eventStack;
        if (Array.isArray(stack)) {
            for (let i = stack.length - 1; i >= 0; i--) {
                const evt = stack[i];
                if (evt && evt.name === 'phaseUse' && !evt.finished) {
                    evt.skipped = true;
                    return true;
                }
            }
        }
        const evt = _status.event?.getParent?.('phaseUse', true);
        if (evt && evt.name === 'phaseUse') {
            evt.skipped = true;
            return true;
        }
        return false;
    },
};
