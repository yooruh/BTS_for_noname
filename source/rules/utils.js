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

// 本对象只保留通用规则 API（怒气/祝福/护盾/诅咒/异常/元素/回合/变形等）；角色技能特化方法
// 按叁岛范式挂到对应技能的 util 字段（如 bts_sk_fanshi.util / bts_sk_canmeng.util）。
export const bts = {
    /**
     * 派发崩铁杀自定义事件（技能效果自注册的基建）：以 content='emptyEvent' 的子事件裸名派发，
     * 技能侧以 `trigger: { player/global: '<事件名>' }` 监听；事件名须经 rules/index.js
     * installCustomEventHooks 登记 lib.hookmap，否则被引擎门禁吞掉。
     * 时序：不 await → 监听者下一泵点执行；需监听者先于后续代码完成时 await（无死锁）。
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
     * 全场结算遍历顺序（定夺统一）：从当前回合角色（_status.currentPhase）起按座次展开
     *（对齐源 getAllPlayers() 与引擎 sortBySeat 惯例）；全体/多名角色的依次结算一律经此排序。
     * @param {Player[]} list 待排序玩家集合（不修改原数组）
     * @returns {Player[]} 从当前回合角色起按座次展开的新数组
     */
    seatOrder(list) {
        return Array.from(list).sortBySeat(_status.currentPhase);
    },

    /**
     * 额外回合工具集。无名杀回合 = name==='phase' 的 GameEvent，排在父事件（通常 phaseLoop）的 .next：
     * 正常回合由 event.player.phase() 生成（无 .skill）；额外回合由 insertPhase() 生成（必带 .skill）。
     * 故 .skill 是额外回合的判别标记；本工具集据此判「是否额外回合 / 谁发动 / 队列剩几个」。
     */

    /** 
     * 额外回合：插入 count 个额外回合（turnName 建议填技能名 event.name）；count<=0 不入队。
     * @param player 执行额外回合的玩家
     * @param turnName 额外回合的名字
     * @param count 插入数量，默认 1
     */
    extraTurn(player, turnName, count = 1) {
        if (count <= 0) return;
        for (let i = 0; i < count; i++) player.insertPhase(turnName);
    },
    /** 
     * 额外阶段：传入 trigger 时在其所在回合内插入阶段，否则插入新回合后执行。
     * @param player 执行额外阶段的玩家
     * @param phases 阶段名或阶段名数组
     * @param trigger 调用处的时机对象；传入 → 拼入其回合的 phaseList
     * @param turnName 阶段/回合的名字，建议填技能名 event.name
     */
    extraPhase(player, phases, trigger, turnName) {
        phases = Array.isArray(phases) ? phases : [phases];
        turnName = turnName ? turnName : _status.event.name

        if (trigger) { // 回合内：拼入当前回合的 phaseList
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

    // 合颂/恩赐/再现等技能的额外回合判断均走本家族方法（判别统一基于「额外回合 = phase 事件带 .skill」）。
    /** 当前回合是否是额外回合 */
    isExtraTurn() {
        const phaseEvent = _status.event?.getParent("phase");
        return !!phaseEvent?.skill;
    },

    /**
     * 指定角色是否处在其自身的额外回合内（源 @extra_turn 语义）：较 isExtraTurn() 多核对归属者；
     * 供合颂等「伤害来源是否处于额外回合」判定使用。
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
     * 统计从当前回合起的排队回合数（默认含当前；「只剩之后几个」用 includeCurrent: false）。
     * 当前回合单独判一次（不在自己的 .next 里），其余向上遍历各祖先事件的 .next 队列。
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

    // 常用口径直接传参：额外回合总数 = { extra: true }；「当前结束后还剩几次」再加 includeCurrent: false；
    // 正常回合 = { extra: false }。

    getAngry(player, amount, maxskill = true) {
        const value = player.countMark(MARKS.ANGRY);
        return amount == null
            ? value
            : (maxskill && player.countMark(MARKS.EXTRA_MAX) > 0) ||
            value >= amount;
    },
    // ── 怒气获取门控（定夺）：仅拥有「以怒气发动的必杀技」的角色获得怒气 ——
    //  ① 无任何 bts_bisha 技能 → 不获得（怒气无用，免 UI/日志噪声）；
    //  ② 资源型必杀（燔世/残梦/凿荒/誓约/亡哮/无启等）标 bts_bisha_angry: false → 不获得。
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
        // 他人令你获得怒气 → 广播 bts_resource_add（身炬/寸强等监听结算；按定夺补源描述含此法）。
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

    // 星启（源 God = isLord() or @bless_god）：主公以 isZhu 判断（身份模式）且受 bts_god_condition 门控
    //（isLordGodEnabled，见 markRegistry.js）；技能星启（bless_god 层数）不受门控。
    god(player) {
        // 防御非 Player 对象传入（如技能按钮评估期）。
        if (!player || typeof player.countMark !== 'function') return false;
        return (
            (player.isZhu === true && isLordGodEnabled()) ||
            player.countMark(MARKS.bless('god')) > 0
        );
    },

    // 统一标记来源同步（规则见 markRegistry.js SOURCE_TRACKABLE_MARKS：来源并集、耗尽归空；
    // 其它标记启用来源只需注册并传 trackSource）。保留 godSync 命名供 content.js 钩子调用。
    godSync(player) {
        syncMarkSources(player);
    },

    getBless(player, name, amount) {
        // 残梦结算期间所有祝福无效（源 GetBless 返回 false/0；canmengActive 挂 bts_sk_canmeng.util）。
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
    // 雨过天晴「快门」（源 st_qingkong 快照）：任一存活角色持有即全场生效（残梦期间 getBless 恒 false）；
    // 体力上限祝福的翻倍与首入补差/末出补收均以此为准。
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
        // 他人令你附加祝福 → 广播 bts_resource_add，由身炬等技能监听结算（源身炬描述含此法）。
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
            // 源 AddBless L431-437：全场首个雨过天晴入场 → 为持有体力上限祝福者补足翻倍差额
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
            // 源 L436-438：热意祝福加层同时附赠等量笑点（欢愉子系统）。
            player.addMark('bts_mk_funnypoint', amount);
        }
        return amount;
    },
    async removeBless(player, name, amount = 1, from = player) {
        if (name === 'allbless') {
            // 源 allbless（L534-546）：先移除 maxhp（自持雨过天晴+上限祝福时须先取 ×2 快照，再顺序
            // 移除其余；不可并发——翻倍快照依赖前项已移除的次序）。
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
        // 不死祝福归零且体力<1 → 立即濒死（源 MarkChanged L570-571）。放本处而非 busi 技能内：
        // 层数归零时其技能已卸载、收不到 bts_mark_remove；覆盖衰减/倏忽等全部移除路径
        //（倏忽移除前已先回血，hp>0 不触发）。
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

    // 崩铁杀护盾（异于本体护甲）：shield 标记层数；抵扣在 rules/globalBuffs.js bts_shield
    //（damageBegin4；贯通不抵扣）；残梦期间无效（源 GetShield L725-733）。
    getShield(player, amount) {
        if (lib.skill['bts_sk_canmeng']?.util?.canmengActive?.()) {
            return amount == null ? 0 : false;
        }
        const value = player.countMark(MARKS.SHIELD);
        return amount == null ? value : value >= amount;
    },
    addShield(player, amount = 1, from = player) {
        player.addMark(MARKS.SHIELD, amount);
        // 他人令你附加护盾 → 广播 bts_resource_add，由身炬/寸强等技能监听结算（源身炬/寸强描述含此法）。
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

    // 「不可被其他角色指定为目标」状态（貊泽·掠袭·潜行，源 alive=false 语义）。三处封锁共用：
    // ① 卡牌选目标 targetEnabled mod；② 技能选目标候选守卫（Check.processSelection）；
    // ③ 自动「视为使用」useCard 首步（见 rules/index.js installUntargetableGuard）。
    untargetable(target) {
        return Boolean(
            target?.hasSkill?.('bts_sk_lvexi') &&
                target.countMark('bts_mk_moze_stealth'),
        );
    },

    // 存活角色数（掠袭「全场仅剩2人」退出判据，定夺恢复源版条件；源 getAllPlayers(true) 口径）。
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
        // 无名杀特化：体力上限减少异常保底 1——只施加实际可扣层数（源 L8192 同思路）；未生效层
        // 不入账、移除按入账回补（账目自洽）。引擎 loseMaxHp 在 maxHp≤0 时直接令玩家死亡（content.js）。
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
        // await 驱动（无名杀惯例）：有父事件随链执行，无父事件主动执行（then→start）；不可 fire-and-forget。
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
        // 按入账层数对称回补（账目自洽）；await 原因同 addAbnormal（不可 fire-and-forget）。
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

    // 伤害 reason 后缀为崩铁杀特有，统一命名空间 _bts_reason_<tag>
    //（_common/_fatal/_critical/_through/_nature），避免与本体/其他扩展 reason 经 includes 误撞（定夺 #2）。
    // API 收短标签（'_fatal' 等）并在内部映射；元素名后缀（_frost 等）属技能基名，不在此列。
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
        // 空 reason（本体/其他扩展伤害）不提前排除（源 getReason 语义；无后缀自然判 false）；
        // 仅显式 _bts_reason_common 豁免（定夺）。
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

    // 伤害原因串是否必杀技伤害（源 AddNew(damage,"max_")）：以 bts_bisha 标签判定——从尾往前逐段
    // 剥 "_后缀"，命中 lib.skill[id]?.bts_bisha 即真（兼容 markDamage 追加的多级后缀）。
    isBishaReason(reason) {
        if (typeof reason !== 'string' || !reason) return false;
        let base = reason;
        while (base.includes('_')) {
            if (lib.skill[base]?.bts_bisha === true) return true;
            base = base.slice(0, base.lastIndexOf('_'));
        }
        return false;
    },

    // 本次体力净变化量：正=恢复、负=丢失（changeHp/recover 的 num 即净变化；damage/loseHp 的 num 与
    // loseMaxHp 的 loseHp 为正失量取负；符号对齐叁岛 hupan.js）。事件名取基名（event.name），
    // 后缀在 triggername——勿写 'damageEnd'/'loseHpEnd'。
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
        // 源 RemoveAbnormal(player,"choice",1,chooser)：由 chooser（默认被移除者）任选一种异常移除
        // 1 层；选面用技能选择界面（弃用 chooseControl——键序不稳定，定夺 F-05）。
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

    // 技能选择界面（左慈化身式：列出技能、带描述）——从异常内部名中选一个。
    // 联机适配：chooseButton + createDialog（选项 [键, html]，tdnodes 渲染）；远程玩家经 event.send()
    // 到其客户端执行——选项全为可序列化原语、无需回调（filterButton/ai 用默认）。
    async chooseAbnormal(picker, names, prompt) {
        // 同 chooseSkill：仅列出有描述的技能（全无描述 → 按旧行为缺省首个）。
        const options = [];
        for (const name of names) {
            const key = `bts_abnormal_${name}`;
            const desc =
                (lib.skill[key]?.glossaryId &&
                    lib.translate[lib.skill[key].glossaryId + '_info']) ||
                lib.translate[key + '_info'];
            if (!desc) continue;
            options.push([
                key,
                `<div class="skill">【${get.translation(key)}】</div><div>${desc}</div>`,
            ]);
        }
        if (!options.length) return names[0];
        const result = await picker
            .chooseButton({
                createDialog: [
                    prompt || '请选择移除一种异常',
                    [options, 'tdnodes'],
                ],
                selectButton: 1,
                forced: true,
            })
            .forResult();
        const link =
            result?.links?.[0] ??
            result?.buttons?.[0]?.link ??
            result?.button?.[0]?.link;
        return typeof link === 'string' && link.startsWith('bts_abnormal_')
            ? link.slice('bts_abnormal_'.length)
            : names[0];
    },

    // ── 无名杀特化：移除体力上限保底 1 ─────────────────────────────────────
    // 引擎 loseMaxHp 在 maxHp≤0 时直接令玩家死亡（content.js），源 sgs 允许扣至低值；
    // 故所有「移除体力上限」统一保底：最多扣到 1 点（按调用时刻 maxHp 计算；同刻连扣由调用方顺序化）。
    maxHpDeductable(player, amount) {
        return Math.min(
            Math.max(amount, 0),
            Math.max(0, player.maxHp - 1),
        );
    },
    // 保底扣除：返回 loseMaxHp 事件（可 await）；无点可扣时返回 null。
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
        // 换将（源 ChangeHero L125-149）：保留「额外上限」(当前 maxHp − 本将默认上限) 沿续；
        // hp = min(新上限, 旧hp)。忆灵召唤/消失不走本方法（见 changePetForm）。
        // reinit 第三参 [hp,maxHp] 可显式设体力与上限（null 只调上限、不动体力）。
        const oldHp = player.hp;
        const fromDef = get.infoMaxHp(lib.character[from][2]);
        const toDef = get.infoMaxHp(lib.character[to][2]);
        const newMaxHp = toDef + (player.maxHp - fromDef);
        if (Array.isArray(maxHp)) {
            // 显式 [hp, maxHp]：原样透传
            player.reinit(from, to, maxHp);
        } else if (maxHp != null) {
            // 数字 = 指定目标上限；hp 取原体力与上限较小者（源 Math.min）
            player.reinit(from, to, [Math.min(maxHp, oldHp), maxHp]);
        } else {
            player.reinit(from, to, [Math.min(newMaxHp, oldHp), newMaxHp]);
        }
        game.log(`#b【${lib.translate[from] || from}】`, '变为了', `#b【${lib.translate[to] || to}】`);
        return player;
    },
    // 忆灵换卡（A↔C 组合形态；源 ChangeHero L125-149，定夺统一）：
    //   ① 召唤 A→C：C_h = A_h*+B_h、C_m = A_m*+B_m（主公 +1，源 L132-137）
    //   ② 消失 C→A：A_h = Min(C_h*, A_m*)、A_m* = C_m*-B_m（主公 -1，源 L134-135）
    // reinit 换卡：基础技能逐个移除/补上（不触发 changeSkills）；超出基础的临时/授予技能与 storage 天然保留。
    // 与 changeHero 区分：卡厄斯兰那换角色走 changeHero（不继承技能、继承血量）。
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
    // 忆灵/组合形态生命周期：组合角色经 transformCharacter 注册；宠物标记为唯一状态源，基础角色 ID 写入
    // storage 以便还原。opts 可省略：base 取当前武将名，combined 按 bts_ch_<base>_and_<pet> 派生，
    // petHp 取 bts_ch_<pet> 体力（可显式覆盖）。
    getPet(player, pet) {
        return player.countMark(MARKS.pet(pet)) > 0;
    },
    // 召唤忆灵（源 AddPet/RemovePet 全量对齐，定夺）：小伊卡每次 +1 怒气、乐手首召 +1 怒气/重召 +6
    // 气氛、长夜重召 +1 体力——由各形态技能（漆黑/心跳/展落）监听 bts_pet_add（repeated）结算；
    // await 保证监听者先于后续代码完成。重复召唤不变形、返回 false。
    async addPet(player, pet, { base, combined, petHp } = {}) {
        if (!player) throw new Error(`无法召唤忆灵 ${pet}`);
        // 死人不获得忆灵：changePetForm 按 hp+petHp 重算体力，先失体致死（咒礼 loseHp）后继续执行
        // 会把尸体 hp 重算为 1；离场侧忆灵技能 filter 亦有 isAlive 门。
        if (!player.isAlive()) return false;
        // 重复召唤（源 AddPet else + 尾块）：已在场不变形，广播 bts_pet_add 由各技能结算
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
        // 首次登场结算（源 AddPet 首起分支 + 尾块）：乐手/小伊卡 +1 怒气——由形态技能监听结算。
        await this.emit('bts_pet_add', { player, pet, repeated: false });
        return true;
    },
    async removePet(player, pet, { base } = {}) {
        if (!player || !this.getPet(player, pet)) return false;
        const record = player.storage.btsPets?.[pet];
        base ??= record?.base;
        if (!base || !lib.character[base])
            throw new Error(`忆灵 ${pet} 缺少可还原的基础角色`);
        // 先广播 bts_pet_remove（此刻形态技能仍挂载、标记仍在场，离场技能才能命中），再变形还原 +
        // 清标记——须前置，置于还原之后触发器收不到。
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
    // 忆灵生命池（源 HpChanged L1354-1396，定夺统一）：受伤等量扣、回复等量回补（封顶 GetPetMaxHp），
    // 归零自动 RemovePet。
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
                    // 归零：交 removePet 统一处理（清零标记 + 变形还原 + 离场结算）；勿先清零——
                    // 否则 removePet 的前置 getPet 检查直接 return false。
                    await this.removePet(player, pet);
                } else {
                    player.removeMark(mark, dec);
                }
            }
        }
    },

    // ── 欢愉子系统（源 L11072-11205）────────────────────────────────────
    // 欢愉行动（FunnyAct）：按技能 bts_funny 注册表泛化派发；欢愉时刻令全场各执行一次；
    // 笑点（bts_mk_funnypoint）与欢愉祝福（bts_bless_funny）决定层数/概率。

    /** 是否拥有欢愉技能（源 FunnyPlayer L11072-11074） */
    funnyPlayer(player) {
        // 技能命名 bts_sk_*_funny（花火/砂金·熙郎/银狼999）；阿哈（原创）亦视为拥有欢愉行动
        //（使用/视为使用【无中生有】或【欢愉万相】），计入源术语「拥有欢愉行动的角色」判定。
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

    /** 欢愉行动后置（源 AfterFunnyAct L11137-11192）：+1 笑点并广播 bts_funny_act_after；
     * 花手弃牌等效果由各技能监听该事件结算。 */
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
     * 各技能声明 `bts_funny: { order, act(ctx), late? }`，按 order 泛化执行：
     * act 阶段 → 欢愉祝福步（funnytime）→ late 阶段（爆射）→ 收束（afterFunnyAct 广播）。
     * ctx = { player, target, funny, funnytime, after, done, aborted }；act 可改写 ctx.funny/after。
     * 日志：行动技能 ≠ initiator（发起技能由引擎自动记）时补 logSkill，保证日志/音频归因完整。
     * @param {object} player 执行欢愉行动的角色
     * @param {number|null} funny 层数/类型（null=自发行动）
     * @param {object} [target] 行动对象（默认 player 自身）
     * @param {string} [initiator] 发起技能 id（重复日志豁免；缺省=全部执行者记日志）
     * @returns {boolean} done（ctx.done；任一步 aborted 时为 false）
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

    /** 视为使用【欢愉万相】（阿哈·原创）：万相为 bts_cd 包衍生物牌（效果见 lib.card 定义）。 */
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
        // 技能命名 bts_sk_*；列表未移植者经 hasSkill 自然返回 false，不影响已移植部分。
        for (const name of maxSkills)
            if (player.hasSkill(`bts_sk_${name}`) && this.getAngry(player, 5))
                return true;
        for (const name of yesSkills)
            if (player.hasSkill(`bts_sk_${name}`)) return true;
        return false;
    },

    /**
     * 结束出牌阶段（源 Global_PlayPhaseTerminated）。phaseUse 运行中 player.skip('phaseUse') 无效
     *（checkSkipped 只在阶段事件创建前查 skipList，且残留标记会误跳下一回合）；正确做法是给当前
     * 运行中的 phaseUse 事件设 skipped=true（content.js 的 `!event.skipped` 判断）。
     * 查找：① 扫 eventManager.eventStack 找未完成 phaseUse（权威、不依赖 parent 链——getParent
     * 找不到时返回 {}，`if (evt)` 恒真）；② 兜底 getParent('phaseUse', true)。
     * 失败不设残留标记；仅用于出牌中/出牌后的技能结算（准备阶段等提前跳出不适用）。
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
