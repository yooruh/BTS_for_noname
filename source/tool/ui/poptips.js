// 崩铁杀 poptip 注册（参照叁岛 source/tool/ui/poptips.js）：
//  - 为包内全部角色注册 character 类型 poptip（描述中可引用角色名查看资料卡）；
//  - 为专有名词词条注册 poptip（get.poptip('bts_glossary_*') 悬浮/点击查看解释）。
// content 阶段在角色包注册完成后调用（lib.bts.characterPacks 消费前）。
import { lib } from '../../../../../noname.js';
import { GLOSSARY } from '../../character/bts/glossary.js';

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
    }
    for (const glossary of GLOSSARY) {
        lib.poptip.add({
            id: glossary.id,
            name: glossary.name,
            info: glossary.info,
            type: 'character',
        });
    }
}
