// 崩铁杀 poptip 注册：
//  - 为包内全部角色注册 character 类型 poptip（描述中可引用角色名查看资料卡）；
//  - 为专有名词词条注册 poptip（get.poptip('bts_glossary_*') 悬浮/点击查看解释）。
// content 阶段在角色包注册完成后调用（lib.bts.characterPacks 消费前）。
// 词条正文拆分归位：通用机制词条在 rules/globalrules.js、角色专属在各角色文件 glossary，
// 由 bts/index.js 聚合进包 translate；此处遍历各包 translate 的 /^bts_glossary_.+_faq$/
// 键注册（对应 *_info 键自动排除）。
import { lib } from '../../../../../noname.js';
import { NATURES } from '../../rules/natures.js';
import { NATURE_OFFICIAL_NAME, PATH_BY_NAME } from './title.js';

export function registerPoptips(characterPacks) {
    for (const entry of Object.values(characterPacks || {})) {
        const pack = entry.info;
        for (const charName of Object.keys(pack.character || {})) {
            const translatedName =
                pack.translate?.[charName] || lib.translate[charName];
            lib.poptip.add({
                id: charName,
                name: translatedName || charName,
                type: 'character',
                dialog: 'characterDialog',
            });
        }
        const translate = pack?.translate || {};
        for (const id of Object.keys(translate)) {
            if (!/^bts_glossary_.+_faq$/.test(id)) continue;
            lib.poptip.add({
                id,
                name: translate[id],
                info: translate[`${id}_info`] || '',
                type: 'character',
            });
        }
    }
}

/**
 * 注册属性/命途 poptip（供称号图标 <noname-poptip> 点击查看中文名；在 registerPoptips 后调用）。
 * id 沿素材命名：bts_nature_<key>（官方名，见 title.js）/ bts_path_<key>（image/path 基名）；
 * info 至少携带中文名。
 */
export function registerNaturePathPoptips() {
    for (const key of NATURES) {
        const name = NATURE_OFFICIAL_NAME[key];
        lib.poptip.add({
            id: `bts_nature_${key}`,
            name,
            info: `属性：${name}`,
            type: 'rule',
        });
    }
    for (const [name, key] of Object.entries(PATH_BY_NAME)) {
        lib.poptip.add({
            id: `bts_path_${key}`,
            name,
            info: `命途：${name}`,
            type: 'rule',
        });
    }
}
