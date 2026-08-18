// 崩铁杀规则辅助 API（对应 animal.lua L33-857）。挂载为 lib.bts.api，并由 shared.js 导出为 bts。
import { lib, game, get } from '../../../../noname.js';
import {
    ABNORMALS,
    BLESSES,
    MARKS,
    NATURES,
    syncMarkSources,
    isLordGodEnabled,
} from './marks.js';

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
//（bts_st_fanshi.util：fanshiOthers/stealFanshi/endFanshi；bts_st_mosuo.util：kafuka；
//  bts_st_canmeng.util：canmengActive；2026-09-02 TODO 整改）。
// 本对象只保留通用规则 API（怒气/祝福/护盾/诅咒/异常/元素/回合/变形等）。
export const bts = {
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
    // 希儿·再现 getExtraSkill()==='bts_st_zaixian' 等与额外回合判断的相关技能均改用本家族方法
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
    addAngry(player, amount = 1, from = player) {
        player.addMark(MARKS.ANGRY, amount);
        // 身炬（源 st_shenju 描述"其他角色令你回复怒气后"）：他人令你获得怒气 → +1 火种
        // （源代码未实现此触发，按用户定夺补；与下方 addBless/addShield 同款挂钩）
        if (
            from !== player &&
            player.hasSkill('bts_st_shenju') &&
            player.countMark('bts_huozhong') < 15
        ) {
            player.logSkill('bts_st_shenju');
            player.addMark('bts_huozhong', 1);
        }
        if (
            from !== player &&
            player.hasSkill('bts_st_cunqiang') &&
            !this.getBless(player, 'through')
        ) {
            player.logSkill('bts_st_cunqiang');
            this.addBless(player, 'through', 1, player);
        }
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
    // 由 isLordGodEnabled()（marks.js）门控本方法 isZhu 分支（2026-09-02 TODO 整改）。
    god(player) {
        // 星启（源 God = isLord() or @bless_god）：无名杀没有 isLord() 方法，
        // 主公以 isZhu 属性判断（身份模式）；并防御非 Player 对象（如技能按钮评估期）传入。
        // 主公星启（isZhu 分支）按 config bts_god_condition 门控（isLordGodEnabled，见 marks.js）；
        // 技能星启（bless_god 层数）不受 config 影响。
        if (!player || typeof player.countMark !== 'function') return false;
        return (
            (player.isZhu === true && isLordGodEnabled()) ||
            player.countMark(MARKS.bless('god')) > 0
        );
    },

    // 统一标记来源同步（星启来源维护的具体注册见 marks.js SOURCE_TRACKABLE_MARKS，
    // 含主公星启/技能星启并集、来源耗尽归空等规则）。其它标记如启用来源只需在
    // SOURCE_TRACKABLE_MARKS 注册并在 markIntro 传 trackSource。这里保留 godSync 命名
    // 供 content.js 的增删层钩子调用，实际逻辑委托给 marks.js 的通用 syncMarkSources。
    godSync(player) {
        syncMarkSources(player);
    },

    getBless(player, name, amount) {
        // 残梦结算期间所有祝福无效（源 GetBless 返回 false/0）。
        // canmengActive 已移出本对象，挂载在黄泉 bts_st_canmeng.util（角色技能特化方法）。
        if (lib.skill['bts_st_canmeng']?.util?.canmengActive?.())
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
    async addBless(player, name, amount = 1, from = player) {
        const mark = markName(name, 'bless');
        player.addMark(mark, amount);
        // 身炬（源 st_shenju 描述"其他角色令你附加祝福后"）：他人令你附加祝福 → +1 火种
        if (
            from !== player &&
            player.hasSkill('bts_st_shenju') &&
            player.countMark('bts_huozhong') < 15
        ) {
            player.logSkill('bts_st_shenju');
            player.addMark('bts_huozhong', 1);
        }
        if (mark === MARKS.bless('maxhp')) {
            const multiplier = this.getBless(player, 'yuguotianqing') ? 2 : 1;
            await this.gainMaxHp(player, amount * multiplier);
        }
        return amount;
    },
    async removeBless(player, name, amount = 1, from = player) {
        if (name === 'allbless') {
            await Promise.all(
                allMarks(player, 'bts_bless_').map((mark) =>
                    this.removeBless(player, mark, amount, from),
                ),
            );
            return;
        }
        const mark = markName(name, 'bless');
        const removed =
            amount === -1
                ? player.countMark(mark)
                : Math.min(amount, player.countMark(mark));
        player.removeMark(mark, removed);
        if (mark === MARKS.bless('maxhp') && removed) {
            const multiplier = this.getBless(player, 'yuguotianqing') ? 2 : 1;
            await this.gainMaxHp(player, -removed * multiplier);
        }
        return removed;
    },

    // 护盾：崩铁杀特殊护盾（与无名杀本体护甲不同），以 shield 标记层数实现，
    // 抵扣逻辑在 resolver.damageBegin2（贯通伤害不抵扣）。
    getShield(player, amount) {
        const value = player.countMark(MARKS.SHIELD);
        return amount == null ? value : value >= amount;
    },
    addShield(player, amount = 1, from = player) {
        player.addMark(MARKS.SHIELD, amount);
        // 身炬（源 st_shenju 描述"其他角色令你附加护盾后"）：他人令你附加护盾 → +1 火种
        if (
            from !== player &&
            player.hasSkill('bts_st_shenju') &&
            player.countMark('bts_huozhong') < 15
        ) {
            player.logSkill('bts_st_shenju');
            player.addMark('bts_huozhong', 1);
        }
        if (
            from !== player &&
            player.hasSkill('bts_st_cunqiang') &&
            !this.getBless(player, 'through')
        ) {
            player.logSkill('bts_st_cunqiang');
            this.addBless(player, 'through', 1, player);
        }
        return amount;
    },
    removeShield(player, amount = 1) {
        const removed = Math.min(amount, player.countMark(MARKS.SHIELD));
        player.removeMark(MARKS.SHIELD, removed);
        return removed;
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
    addAbnormal(player, name, amount = 1, from = player) {
        const mark = markName(name, 'abnormal');
        player.addMark(mark, amount);
        if (mark === MARKS.abnormal('lieyang') && player.countMark(mark) >= 2) {
            player.removeMark(mark, 2);
            const damage = player.damage(1, 'nosource');
            damage.reason = 'bts_gamerule_fatal';
        }
        if (mark === MARKS.abnormal('losemaxhp')) player.loseMaxHp(amount);
        return amount;
    },
    removeAbnormal(player, name, amount = 1) {
        if (name === 'allabnormal') {
            for (const mark of allMarks(player, 'bts_abnormal_'))
                this.removeAbnormal(player, mark, amount);
            return;
        }
        const mark = markName(name, 'abnormal');
        const removed =
            amount === -1
                ? player.countMark(mark)
                : Math.min(amount, player.countMark(mark));
        player.removeMark(mark, removed);
        if (mark === MARKS.abnormal('losemaxhp') && removed)
            player.gainMaxHp(removed);
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
            player.recover(player);
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

    markDamage(damage, suffix) {
        if (
            !damage ||
            damage.reason?.includes('_common') ||
            damage.reason?.includes(suffix)
        )
            return damage;
        damage.reason = `${damage.reason || 'bts'}${suffix}`;
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
        if (!damage || damage.reason?.includes('_common')) return false;
        if (suffix === '_allspecial')
            return ['_fatal', '_critical', '_through'].some((key) =>
                damage.reason?.includes(key),
            );
        return Boolean(damage.reason?.includes(suffix));
    },

    // 伤害原因串是否为必杀技（终结技）伤害。源 AddNew(damage,"max_") 语义 = reason 含
    // 必杀技技能名；无名杀以 bts_bisha 标签判定：reason 从尾向前往剥 "_后缀"，
    // 命中某必杀技技能对象（lib.skill[id]?.bts_bisha）即为真。兼容
    // markDamage/AddNew 追加的 _fatal/_critical/_nature 等多级后缀。
    isBishaReason(reason) {
        if (typeof reason !== 'string' || !reason) return false;
        let base = reason;
        while (base.includes('_')) {
            if (lib.skill[base]?.bts_bisha === true) return true;
            base = base.slice(0, base.lastIndexOf('_'));
        }
        return false;
    },

    // 本次扣减的体力量（伤害或直接失去体力，排除伤害附带的 loseHpEnd）。
    // 原为多个角色文件各自的包级 lostHp 函数，统一上移为全局 API（对齐叁岛规范）。
    lostHp(event) {
        if (!event) return 0;
        return event.name === 'damageEnd'
            ? Math.max(0, event.num || 0)
            : event.name === 'loseHpEnd' && !event.getParent?.('damage')
                ? Math.max(0, event.num || 0)
                : 0;
    },

    // 存活的其他角色（原为白厄等角色文件的包级 otherPlayers，统一上移）。
    otherAlive(player) {
        return game.filterPlayer(
            (target) => target !== player && target.isAlive(),
        );
    },

    async removeAbnormalChoice(player) {
        // 源 RemoveAbnormal(player, "choice", 1)：由目标选择移除一种异常各1层。
        const choices = Object.keys(player.storage || {}).filter(
            (key) => key.startsWith('bts_abnormal_') && player.countMark(key) > 0,
        );
        if (!choices.length) return;
        if (choices.length === 1) {
            this.removeAbnormal(player, choices[0].slice(9), 1);
            return;
        }
        const result = await player
            .chooseControl(
                choices.map((key) => [key, lib.translate[key] || key]),
                '请选择移除一种异常',
            )
            .set('ai', () => 0)
            .forResult();
        if (result.control)
            this.removeAbnormal(player, result.control.slice(9), 1);
    },

    async gainMaxHp(player, amount = 1) {
        if (amount >= 0) await player.gainMaxHp(amount);
        else await player.loseMaxHp(-amount);
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
            // 调用方显式 [hp, maxHp]（如白厄强设满血），原样透传
            player.reinit(from, to, maxHp);
        } else if (maxHp != null) {
            // 调用方给数字 = 指定目标上限，hp 取原体力与上限较小者（源 Math.min）
            player.reinit(from, to, [Math.min(maxHp, oldHp), maxHp]);
        } else {
            player.reinit(from, to, [Math.min(newMaxHp, oldHp), newMaxHp]);
        }
        game.log(player, '变形为', `#g【${lib.translate[to] || to}】`);
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
        const petInfo = pet ? lib.character[`bts_${pet}`] : null;
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
    // opts 可省略：base 取当前武将名，combined 按 `bts_<base>_and_<pet>` 约定派生，
    // petHp 取 `bts_<pet>` 角色体力（调用方可显式覆盖）。
    getPet(player, pet) {
        return player.countMark(MARKS.pet(pet)) > 0;
    },
    addPet(player, pet, { base, combined, petHp, removeRecover = 0 } = {}) {
        if (!player) throw new Error(`无法召唤忆灵 ${pet}`);
        if (this.getPet(player, pet)) return false;
        base ??= player.name1 || player.name;
        combined ??= `bts_${base.replace(/^bts_/, '')}_and_${pet}`;
        if (!lib.character[combined])
            throw new Error(`忆灵 ${pet} 缺少可用组合形态 ${combined}`);
        if (!lib.character[base])
            throw new Error(`忆灵 ${pet} 缺少基础角色 ${base}`);
        const petInfo = lib.character[`bts_${pet}`];
        petHp ??= petInfo?.[2] ?? 1;
        player.storage.btsPets ??= {};
        player.storage.btsPets[pet] = {
            base,
            combined,
            removeRecover,
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
        // 源 登场结算（源描述 st_xintiao L14204）：晴空乐手登场时，
        // 若此前已召唤过乐手（二次登场，和声移除后重召）则获得6枚气氛标记，否则回复1点怒气。
        // 源未实现（半成品空技能），按描述补实现（用户定夺 2026-09-02；"已存在"按"此前召唤过"理解）。
        if (pet === 'qingkongyueshou') {
            const first = !player.storage.bts_qingkong_ever;
            player.storage.bts_qingkong_ever = true;
            if (first) lib.bts.api.addAngry(player);
            else player.addMark('bts_qifen', 6);
        }
        return true;
    },
    async removePet(player, pet, { base } = {}) {
        if (!player || !this.getPet(player, pet)) return false;
        const record = player.storage.btsPets?.[pet];
        base ??= record?.base;
        if (!base || !lib.character[base])
            throw new Error(`忆灵 ${pet} 缺少可还原的基础角色`);
        const from = player.name1 || player.name;
        this.changePetForm(player, base, {
            from,
            pet,
            petMaxHp: record?.petMaxHp,
        });
        player.setMark(MARKS.pet(pet), 0);
        if (player.storage.btsPets) delete player.storage.btsPets[pet];
        if (record?.removeRecover && player.isAlive())
            await player.recover(player, record.removeRecover);
        // 源 RemovePet（L814-878）按忆灵各自结算离场效果（用户定夺 2026-09-02 统一生命池）
        if (player.isAlive()) {
            if (pet === 'yijiang') lib.bts.api.addAngry(player); // 衣匠：回怒气（源 AddAngry）
            else if (pet === 'xiaoyika') await player.draw(player, 1); // 小伊卡：摸1（源 st_zhanluo）
            else if (pet === 'qingkongyueshou')
                lib.bts.api.extraTurn(player, 'bts_extra_turn'); // 乐手：额外回合（源 st_wanfeng）
        }
        return true;
    },
    // 忆灵生命池（源全局 HpChanged L1354-1396，用户定夺 2026-09-02 统一实现）：
    // 组合形态受伤等量扣忆灵生命、回复等量回补（封顶 GetPetMaxHp），归零自动 RemovePet。
    getPetLostHp(player, pet) {
        // 源 GetPetLostHp（L884-888）= 忆灵上限 − 当前忆灵生命（主公 +1 补偿初值 +1）
        const petInfo = lib.character[`bts_${pet}`];
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
            const petInfo = lib.character[`bts_${pet}`];
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
};
