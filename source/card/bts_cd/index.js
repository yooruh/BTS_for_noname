// 崩铁杀卡牌包（对应源 StarRailCard：卡牌克隆整体被注释，animal.lua L9092-9195；包维持默认禁用）。
// 2026-09-29 注册首张衍生物牌：欢愉万相（阿哈体系专用；list 保持空，不进牌堆）。
// 注：引擎 loadCard 对 card/translate 定义无条件装载（lib.imported.card → loadCard，见
// init/onload 两处），与卡包启用状态无关（未启用只影响牌堆/收集页归包）。
import { lib, game } from '../../../../../noname.js';

export const packMeta = {
    defaultEnabled: false,
};

export const info = {
    name: 'bts_cd',
    connect: false,
    card: {
        // 【欢愉万相】（阿哈原创设计；bts_sk_aha 体系「视为使用」/【无中生有】改名使用）：
        // 阿哈与其欢愉令使各摸一张牌，目标摸一张牌，所有角色各摸一张牌；
        // 拥有欢愉行动的角色进入欢愉升格状态（至其回合结束），期间其伤害不再被欢愉行动约束。
        bts_cd_huanju_wanxiang: {
            type: 'trick',
            // 衍生物本体不从手牌使用（「视为使用」走 useCard 直调，不经 enable 门）；唯一例外：
            // 规则①下经阿哈 rule.mod 改名的【无中生有】（get.name 归一为本牌）——若继承
            // enable:false 会令该牌不可点（2026-09-30 实机发现）；放行阿哈持有时主动使用。
            enable(card, player) {
                return !!player?.hasSkill('bts_sk_aha');
            },
            notarget: true, // 目标在使用者结算时自选（content 内 chooseTarget），不参与使用阶段的目标选择
            async content(event) {
                // 卡牌事件 content 走 ContentCompiler（async 按位置传参），形参只需 event。
                const player = event.player; // 使用者（阿哈）
                // 选择一名目标角色
                const result = await player
                    .chooseTarget(
                        '欢愉万相：选择一名目标角色',
                        [1, 1],
                        () => true,
                    )
                    .forResult();
                // audit-choosetarget: skip（卡牌衍生物结算，目标依赖使用时机且下限1不会空转）
                const target = result.targets?.[0];
                if (!target) return;
                // ① 阿哈和欢愉令使摸一张牌（2026-09-30 改 asyncDraw：多人同时摸）
                const lingshi = game.players.find(
                    (p) =>
                        p.isAlive() &&
                        p.countMark('bts_mk_huanju_lingshi') > 0,
                );
                await game.asyncDraw(
                    [player, lingshi].filter((p) => p && p.isAlive()),
                    1,
                );
                // ② 目标摸一张牌
                if (target.isAlive()) await target.draw(player, 1);
                // ③ 所有角色各摸一张牌（2026-09-30 改 asyncDraw：多人同时摸）
                await game.asyncDraw(
                    lib.bts.api.seatOrder(
                        game.filterPlayer((p) => p.isAlive()),
                    ),
                    1,
                );
                // ④ 拥有欢愉行动的角色进入欢愉升格状态（至其回合结束；-clear 后缀由 bts_gamerule_phase 清理）
                for (const p of game.filterPlayer(
                    (p) => p.isAlive() && lib.bts.api.funnyPlayer(p),
                )) {
                    p.addMark('bts_mk_huanju_shengge-clear', 1);
                }
            },
            ai: { value: [8, 1] },
        },
    },
    list: [],
    translate: {
        bts_cd: '崩铁杀卡牌包',
        bts_cd_huanju_wanxiang: '欢愉万相',
        bts_cd_huanju_wanxiang_info:
            '阿哈与其欢愉令使各摸一张牌，目标摸一张牌，所有角色各摸一张牌；拥有欢愉行动的角色进入欢愉升格状态（至其回合结束）：期间其造成的伤害不再被欢愉行动约束。',
    },
};
