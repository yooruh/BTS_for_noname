// 角色包构建器（搬运自叁岛，仅 createCharacterSort 改为按 7 阵营分组）
// 把一组"一文件一角色"的模块聚合成无名杀角色包所需的各 lib 字段。
import { KINGDOMS } from '../../rules/marks.js';

function getCharacterId(role, fileName) {
    const characterIds = Object.keys(role.character || {});
    if (characterIds.length !== 1) {
        throw new Error(`角色模块 ${fileName} 必须且只能导出一个角色`);
    }
    return characterIds[0];
}

export function createRolePack(fileNames, modules, packName) {
    const roles = Object.fromEntries(
        fileNames.map((fileName, index) => [fileName, modules[index]]),
    );
    const characterIds = Object.fromEntries(
        fileNames.map((fileName) => [
            fileName,
            getCharacterId(roles[fileName], fileName),
        ]),
    );

    return {
        fileNames,
        roles,
        characterIds,
        merge(prop) {
            return Object.assign(
                {},
                ...fileNames
                    .map((fileName) => roles[fileName][prop])
                    .filter(Boolean),
            );
        },
        collect(prop) {
            return Object.fromEntries(
                fileNames.flatMap((fileName) => {
                    const value = roles[fileName][prop];
                    return value == null
                        ? []
                        : [[characterIds[fileName], value]];
                }),
            );
        },
        // 按角色文件导出的 sort（= 阵营 key）分组，对应无名杀角色池的阵营分类页
        createCharacterSort() {
            const groups = Object.fromEntries(KINGDOMS.map(([id]) => [id, []]));
            for (const fileName of fileNames) {
                const sort = roles[fileName].sort;
                if (!sort) continue;
                (groups[sort] ??= []).push(characterIds[fileName]);
            }
            return { [packName]: groups };
        },
        createResourceNames(namespace = 'bts_') {
            // fileName 可为 roles/<阵营>/<角色>；资源名仅取末段，维持 bts_danheng 等扁平文件名。
            const names = Object.fromEntries(
                fileNames.map((fileName) => {
                    const resourceName = fileName.slice(
                        fileName.lastIndexOf('/') + 1,
                    );
                    return [
                        characterIds[fileName],
                        `${namespace}${resourceName}`,
                    ];
                }),
            );
            // 替代形态（transformCharacter）不进入 ROLE_FILES，资源名取角色 ID 本身（如 bts_xing、bts_shiwaluo）。
            for (const fileName of fileNames) {
                for (const id of Object.keys(
                    roles[fileName].transformCharacter || {},
                )) {
                    names[id] = id;
                }
            }
            return names;
        },
    };
}
