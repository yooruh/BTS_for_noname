// 通用包加载器（搬运自叁岛，仅扩展名改为"崩铁杀"）
// 职责：动态 import → 校验包名唯一 → 补全技能音频/角色资源 → 首次默认启用 → game.import 注册。
import { lib, game } from '../../../../../noname.js';
import { extensionPath } from '../utils/paths.js';
import { dieAudioUrl, skillAudioUrl } from '../utils/audioPaths.js';

const EXTENSION_NAME = '崩铁杀';
const PACK_TYPES = ['character', 'card'];
const REGISTRATION_POLICIES = ['immediate', 'deferred'];

/**
 * 已完成配置检查与资源补全、可供后续阶段消费的包条目。
 *
 * @typedef {Object} PackEntry
 * @property {string} modulePath 相对于角色或卡牌目录、不含 `.js` 的入口路径。
 * @property {Object} info 无名杀角色包或卡牌包定义。
 * @property {string|undefined} loadConfig 默认通过，若制定扩展配置项，则根据此配置选择是否加载。
 * @property {string} displayName 包管理菜单显示名。
 * @property {Record<string, string>} resourceNames 角色完整 ID 到资源主名的映射；卡牌包为空对象。
 * @property {boolean} [defaultEnabled=true] 首次加载时是否自动加入用户的已启用包列表。
 * @property {'immediate'|'deferred'} [registration='immediate'] 包准备完成后的注册策略。
 * `immediate` 会在 precontent 阶段交给 `game.import`；`deferred` 仅准备数据，由 content 阶段显式注册。
 */

function normalizePackMeta(packMeta) {
    const registration = packMeta.registration || 'immediate';
    if (!REGISTRATION_POLICIES.includes(registration)) {
        throw new Error(`registration 无效：${registration}`);
    }
    return {
        resourceNames: {},
        ...packMeta,
        registration,
    };
}

function shouldLoad(meta) {
    return (
        !meta.loadConfig ||
        Boolean(game.getExtensionConfig(EXTENSION_NAME, meta.loadConfig))
    );
}

function getDisplayName(info, meta) {
    return meta.displayName || info.translate?.[info.name] || info.name;
}

// 引擎 game.playAudio 对非 blob:/data:/ext:/db: 的相对路径一律前置 'audio/'；
// 数字 audio 又会在装包时被引擎改写为 ext:<扩展名>:<N>（落扩展根、无 audio/skill 子目录）。
// 崩铁杀音频统一放 audio/skill、audio/die 子目录，故在引擎介入前把数字 audio 包装成
// ext:<扩展名>/audio/skill:<N> 字符串（ext: 分支在 playAudio 中不再叠 audio/），原样透传。
// 拼装逻辑收敛在 audioPaths.js，本文件不再手拼 "ext:崩铁杀/audio/…"。图片/img/skinPath
// 走 get.image/parseResourceAddress，可继续直接用 extensionPath。
//
// 幂等：仅包装数字 audio；已显式写成字符串（含 ext:）或 audio:false（无音开关）的保持不动。
function fillSkillAudio(info) {
    for (const skill of Object.values(info.skill || {})) {
        if (typeof skill.audio === 'number') {
            skill.audio = skillAudioUrl(skill.audio);
        }
    }
}

function fillCharacterResources(info, resourceNames) {
    for (const [characterId, character] of Object.entries(
        info.character || {},
    )) {
        const resourceName = resourceNames?.[characterId];
        if (!resourceName) {
            throw new Error(
                `角色包 ${info.name} 未提供 ${characterId} 的资源名`,
            );
        }
        character.img ??= `${extensionPath}/image/character/${resourceName}.png`;
        character.skinPath ??= `${extensionPath}/image/skin/${resourceName}/`;
        character.dieAudios ??= [];
        const dieAudio = dieAudioUrl(resourceName);
        if (!character.dieAudios.includes(dieAudio))
            character.dieAudios.push(dieAudio);
    }
}

function enablePack(type, info, meta) {
    if (meta.defaultEnabled === false) return;
    const configKey = `${info.name}_${type}_pack`;
    if (game.getExtensionConfig(EXTENSION_NAME, configKey)) return;

    const enabledPacks =
        type === 'character' ? lib.config.characters : lib.config.cards;
    enabledPacks.add(info.name);
    game.saveConfig(
        type === 'character' ? 'characters' : 'cards',
        enabledPacks,
    );
    game.saveExtensionConfig(EXTENSION_NAME, configKey, true);
}

/**
 * 导入并准备一组角色包或卡牌包，返回唯一的包注册表。
 *
 * 加载流程分为四步：
 * 1. 动态导入入口模块，并验证 `info.name` 与包名唯一性；
 * 2. 根据 `packMeta.loadConfig` 排除本次不应准备的包；
 * 3. 补全技能音频、角色资源、菜单翻译及首次默认启用状态；
 * 4. 按 `registration` 立即调用 `game.import`，或把已准备条目留给 content 阶段注册。
 *
 * @param {string[]} modulePaths 相对于 `source/character` 或 `source/card`、不含 `.js` 的入口路径。
 * @param {'character'|'card'} [type='character'] 包类型；角色包为默认类型。
 * @returns {Promise<Record<string, PackEntry>>} 以 `info.name` 为键的已准备包注册表。
 */
export async function loadPackRegistry(modulePaths, type = 'character') {
    if (!PACK_TYPES.includes(type)) throw new Error(`不支持的包类型：${type}`);

    const registry = {};
    const discoveredNames = new Set();
    const baseDir = type === 'character' ? '../../character' : '../../card';

    for (const modulePath of modulePaths) {
        const module = await import(`${baseDir}/${modulePath}.js`);
        const { info, packMeta = {} } = module;
        if (!info?.name)
            throw new Error(`${baseDir}/${modulePath}.js 未导出有效的 info`);
        if (discoveredNames.has(info.name)) {
            throw new Error(
                `重复的${type === 'character' ? '角色' : '卡牌'}包名称：${info.name}`,
            );
        }
        discoveredNames.add(info.name);

        const meta = normalizePackMeta(packMeta);
        if (!shouldLoad(meta)) continue;

        const entry = {
            displayName: getDisplayName(info, meta),
            modulePath,
            info,
            ...meta,
        };
        registry[info.name] = entry;
        lib.translate[`${info.name}_${type}_config`] = entry.displayName;

        fillSkillAudio(info);
        if (type === 'character')
            fillCharacterResources(info, meta.resourceNames);

        enablePack(type, info, entry);
        if (entry.registration === 'immediate') {
            game.import(type, () => info);
        }
    }
    return registry;
}

/**
 * 在 content 阶段注册已经由 loadPackRegistry 准备好的延迟角色包。
 *
 * @param {Object} info 角色包定义。
 * @param {string} displayName 角色包菜单显示名。
 */
export function registerCharacterPack(info, displayName) {
    for (const [sectionName, section] of Object.entries(info)) {
        switch (sectionName) {
            case 'name':
            case 'mode':
            case 'forbid':
            case 'connect':
                break;
            case 'character':
                for (const [characterId, character] of Object.entries(
                    section,
                )) {
                    for (const skill of character.skills || [])
                        lib.skilllist.add(skill);
                    lib.character[characterId] ??= character;
                }
                break;
            case 'skill':
                for (const [skillId, skill] of Object.entries(section)) {
                    lib.skill[skillId] ??= skill;
                }
                break;
            default:
                if (
                    !section ||
                    typeof section !== 'object' ||
                    !lib[sectionName]
                )
                    break;
                if (Array.isArray(section) && Array.isArray(lib[sectionName])) {
                    lib[sectionName].addArray(section);
                    break;
                }
                if (Array.isArray(section)) break;
                for (const key of Reflect.ownKeys(section)) {
                    if (lib[sectionName][key] != null) continue;
                    const descriptor = Object.getOwnPropertyDescriptor(
                        section,
                        key,
                    );
                    if (descriptor)
                        Object.defineProperty(
                            lib[sectionName],
                            key,
                            descriptor,
                        );
                }
        }
    }
    lib.characterPack[info.name] = info.character;
    lib.translate[`${info.name}_character_config`] = displayName;
}
