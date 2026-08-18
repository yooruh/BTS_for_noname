// 规则核心注册入口：翻译/标记技能、全局规则技能及规则服务统一在 content 阶段注册。
// 对齐叁岛规范：技能定义只引用全局（lib.bts.*），不引用包级变量——
// 引擎 StepCompiler 会字符串化重编译同步 content，包级绑定在重编译后不可见。
import { lib, game } from '../../../../noname.js';
import { RULE_MARKS, RULE_TRANSLATE, SOURCE_TRACK } from './marks.js';
import { HANDLERS, bts_gamerule_ex, bts_canmeng_blocker } from './resolver.js';
import {
    bts_gamerule_atk,
    bts_gamerule_dis,
    bts_gamerule_hand,
    bts_gamerule_card,
} from './modifiers.js';
import { ruleService } from './service.js';
import { bts } from './utils.js';

const RULE_SKILLS = {
    ...RULE_MARKS,
    bts_gamerule_ex,
    bts_gamerule_atk,
    bts_gamerule_dis,
    bts_gamerule_hand,
    bts_gamerule_card,
    // 封锁器只登记到 lib.skill，不入全局技能表（经 storage.skill_blocker 引用）。
    bts_canmeng_blocker,
};

// ── 标记来源维护全局技能（参考源码 bts_bgm_follow 的挂载用法）──────────────
// 单独以「守卫 + addGlobalSkill」安装（同主公开局 BGM 技能 installBgmFollow 的写法），
// 不并入 RULE_SKILLS 的纯注册流程。gameStart 初始化各角色来源并挂摘来源驱动标记；
// 游戏中的来源增量（如星启祝福加/减层）由 content.js 的 addMark/removeMark 钩子
// 经 lib.bts.api.godSync → syncMarkSources 同步。
export function installMarkSourceTrack() {
    if (lib.skill[SOURCE_TRACK]) return;
    lib.skill[SOURCE_TRACK] = {
        trigger: { global: 'gameStart' },
        forced: true,
        silent: true,
        async content(event, trigger, player) {
            if (player !== game.me) return; // 全局技能每人触发一次，本地只执行一次
            for (const p of game.players) lib.bts.api?.godSync?.(p);
        },
    };
    game.addGlobalSkill(SOURCE_TRACK);
}

export function registerRules() {
    for (const [key, value] of Object.entries(RULE_TRANSLATE))
        lib.translate[key] ??= value;
    for (const [id, skill] of Object.entries(RULE_SKILLS)) {
        lib.skill[id] ??= skill;
        if (id.startsWith('bts_gamerule_') && !lib.skill.global.includes(id))
            game.addGlobalSkill(id);
    }
    // 全局 API 挂载（技能代码统一经 lib.bts.* 访问，规避重编译丢包级绑定）。
    lib.bts.api = bts;
    lib.bts.rules = ruleService;
    lib.bts.dispatch = (trigger, player) =>
        HANDLERS[trigger.name]?.(trigger, player);
}
