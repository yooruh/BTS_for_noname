// 崩铁杀·音频路径唯一权威模块。
//
// 为什么需要它：其余文件一律不得再手拼 "ext:崩铁杀/audio/skill/…" 这类扩展音频路径。
// 引擎 game.playAudio 对非 blob:/data:/ext:/db: 路径一律前置 'audio/'，且 skill.audio
// 为数字时会在装包时被引擎改写为 ext:<扩展名>:<N>（不落 audio/skill 子目录）。
// 崩铁杀音频统一放在 audio/skill、audio/die 子目录，故技能/阵亡的 audio 必须是
// ext:<扩展名>/audio/... 字符串才能在 precontent 阶段原样透传（registry.fillSkillAudio）。
// 本模块把扩展名、两条 base 路径、拼装 helper 与字幕键归一化收敛到一处，便于维护与定位。
import { extensionPath } from './paths.js';

const EXT_NAME = extensionPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

// 技能音频 → extension/<扩展名>/audio/skill/<技能名><N>.mp3
export const SKILL_AUDIO_BASE = `ext:${EXT_NAME}/audio/skill/`;
// 阵亡音频 → extension/<扩展名>/audio/die/<资源名>.mp3
export const DIE_AUDIO_BASE = `ext:${EXT_NAME}/audio/die/`;

/** 技能语音行数 N → audio 字符串（parseAudio 拆成 path=N、逐行 <技能名><i>）。 */
export function skillAudioUrl(count) {
    // 关键：不能写 `${SKILL_AUDIO_BASE}:${count}`。引擎 parseAudio 对 ext:<path>:N 用
    // regex 捕获 <path> 后会再补一个 '/'，若 <path> 本身以 '/' 结尾则产生双斜杠 `//`，
    // 导致 textMap 的字幕键变成 #ext:…/audio/skill//…（多于 normalizeVoiceKeys 生成的
    // 单斜杠键 → 技能台词查不到；音频文件因浏览器吞掉 // 仍能播放，阵亡用显式文件名
    // 走 lastIndexOf("/") 分支恰恰不受影响，故此前仅阵亡台词正常）。
    // 故 count 形式的路径基须不含末尾斜杠，让引擎恰好补一个。
    return `${SKILL_AUDIO_BASE.slice(0, -1)}:${count}`;
}

/** 阵亡资源名 → die 音频文件路径（每个角色一个）。 */
export function dieAudioUrl(resourceName) {
    return `${DIE_AUDIO_BASE}${resourceName}.mp3`;
}

/**
 * 把作者约定字幕键归一化为引擎识别的 `#` 键。
 *
 * 无名杀现代引擎只读 `#` 前缀字幕键（技能读 #<path><name>、阵亡读 #<path><name>:die），
 * `$`/`~` 无消费方。为不改动约 100 个角色文件，作者仍写 `$bts_xxxN` / `~bts_xxx`，
 * 在角色包合并（bts/index.js）时统一折成引擎 `#` 键；本函数是唯一映射逻辑所在。
 *
 * @param {Object} flatTranslate 角色 translate 平面表（含作者写的 $/~ 语音键）。
 * @param {Record<string,string>} [resourceNames] 角色完整 ID → 资源主名 的映射。
 *    阵亡 `#` 键用资源名（= dieAudios 路径里的主名）。缺省回退为字符 ID 本身。
 * @returns {Object} 归一化后的新表（原表不修改）。
 */
export function normalizeVoiceKeys(flatTranslate, resourceNames = {}) {
    const out = {};
    for (const [key, value] of Object.entries(flatTranslate || {})) {
        // 技能语音行：$bts_<技能><N> → #ext:.../audio/skill/<技能><N>
        const skill = /^\$(bts_[\w]+?)(\d+)$/.exec(key);
        if (skill) {
            out[`#${SKILL_AUDIO_BASE}${skill[1]}${skill[2]}`] = value;
            continue;
        }
        // 阵亡语音：~bts_<角色> → #ext:.../audio/die/<资源名>:die
        const die = /^~(bts_[A-Za-z0-9_]+)$/.exec(key);
        if (die) {
            const charId = die[1];
            const resourceName = resourceNames[charId] || charId;
            out[`#${DIE_AUDIO_BASE}${resourceName}:die`] = value;
            continue;
        }
        out[key] = value;
    }
    return out;
}