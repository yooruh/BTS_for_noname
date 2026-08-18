// 阶段1（precontent）：建立 lib.bts 运行时、注册阵营与准备角色/卡牌包。
import { lib, game } from '../../../noname.js';
import { bts } from './rules/utils.js';
import { ruleService } from './rules/service.js';
import { KINGDOMS, KINGDOM_COLORS } from './rules/marks.js';
import { loadPackRegistry } from './tool/pack/registry.js';
import { CHARACTER_PACK_FILES, CARD_PACK_FILES } from './tool/pack/manifest.js';
import { extensionPath } from './tool/utils/paths.js';

export const lib_bts = {
    // 角色包在 content 阶段用于模式派生包、角色提示等，消费后删除。
    characterPacks: {},
    // 角色模块的 ai.order 在 content 前也可能被读取，先提供无副作用占位。
    aiGuard: {
        blocked: () => false,
        record: () => {},
    },
    api: bts,
    rules: ruleService,
    runtime: {
        effLock: {},
        assetsRegistered: false,
    },
    dispose() {
        ruleService.clear();
        this.characterPacks = {};
    },
};

function registerAssets() {
    // 资源样式在实际添加标记 UI / 帮助页时从此处统一注册。
    lib.init.css(`${extensionPath}/style/css`, 'extension');
    lib_bts.runtime.assetsRegistered = true;
}

function registerKingdoms() {
    for (const [id, short, name] of KINGDOMS) {
        if (!lib.group.includes(id)) {
            // type 'default'：只加入 lib.group（普通势力）。⚠ 不能传 'all'——
            // 'all' 会把势力加入 lib.selectGroup（自选势力列表，默认仅含 shen/devil），
            // 使身份模式把崩铁杀角色当作"神"（get.selectGroup 返回全部势力自选、
            // 身份选将池 identity.js L1025 直接 continue 排除）。
            // config.image → 引擎 addGroup 钩子注册 group_<id> 势力牌（PNG 图标）。
            game.addGroup(
                id,
                short,
                name,
                {
                    color: KINGDOM_COLORS[id],
                    image: `${extensionPath}/image/kingdom/icon/${id}.png`,
                },
                'default',
            );
        }
        // 选将武将卡右上角势力标签的背景色（引擎读 get.translation(`<势力key>Color`)）。
        lib.translate[`${id}Color`] ??= KINGDOM_COLORS[id];
    }
}

// ── 属性伤害注册（学习无名杀本体 game.addNature 机制）────────────────────────
// 崩铁杀属性（风/火/水/物理/虚数/量子）以内部 key（wind/fire/water/earth/light/dark）
// 运作：角色属性用 n_<key> 标记跟踪，伤害属性经 damage._btsNature 传递。
// 为避免属性伤害在引擎层面"未注册"（lib.nature 无对应项，属性翻译/判断/排序
// 不可用），这里按本体机制把缺失属性注册进 lib.nature：
//  - 写 lib.translate['nature_<key>']（属性显示名：风/火/水/物理/虚数/量子）；
//  - lib.nature Map（get.hasNature / is.sameNature / lib.sort.nature 可用）；
//  - 属性杀卡名/伤害飘字颜色（config.color → dynamicStyle，星穹铁道主题色）。
function registerNatures() {
    const NATURE_CONFIG = {
        wind: { translation: '风', order: 10, color: '#95de64' },
        water: { translation: '霜', order: 30, color: '#69c0ff' },
        earth: { translation: '物理', order: 40, color: '#bfbfbf' },
        light: { translation: '虚数', order: 50, color: '#fadb14' },
        dark: { translation: '量子', order: 60, color: '#9254de' },
    };
    for (const [nature, config] of Object.entries(NATURE_CONFIG)) {
        if (lib.nature.has(nature)) continue;
        game.addNature(nature, config.translation, {
            // 崩铁杀属性不参与本体铁索连环（linked）传导，走自研 bts_damage_link_。
            linked: false,
            order: config.order,
            color: config.color,
        });
    }
}

export async function precontent(config, pack) {
    lib.bts = lib_bts;
    registerAssets();
    registerKingdoms();
    registerNatures();

    lib.bts.characterPacks = await loadPackRegistry(CHARACTER_PACK_FILES);
    await loadPackRegistry(CARD_PACK_FILES, 'card');
}
