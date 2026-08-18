// 扩展配置（菜单项）
import { lib, game, ui, get, ai, _status } from '../../../noname.js';
import { extensionUpdateManager } from './tool/update/index.js';
import { configManager } from './tool/configuration/configManager.js';

export const config = {
    bts_update_online: {
        name: '<button class="bts-config-button">在线更新扩展</button>',
        intro: '从 GitHub/Gitee 在线获取扩展并更新（支持断点续传、回滚与 Token 管理）',
        clear: true,
        async onclick() {
            await extensionUpdateManager.showUI();
        },
    },
    bts_recommend_config: {
        name: '<button class="bts-config-button">应用推荐的无名杀全局设置</button>',
        intro: '载入相对适配《崩铁杀》的“无名杀全局设置”（Windows/Android 两套），同时可备份当前配置到 files 目录',
        clear: true,
        async onclick() {
            await configManager.showUI();
        },
    },
    bts_help: {
        name: '<button class="bts-config-button">帮助文档</button>',
        intro: '查看崩铁杀规则与机制说明',
        clear: true,
        async onclick() {
            const helpText = [
                '崩铁杀帮助',
                '• 怒气：受伤回复等量怒气；致命伤害不回复。',
                '• 护盾：优先抵消伤害；贯通伤害无视护盾。',
                '• 异常：麻痹影响摸牌，烧伤在出牌阶段受伤，中毒在弃牌阶段失去体力；冻结/石化/睡眠会限制用牌。',
                '• 当前已提供丹恒、开拓者、翡翠三名移植示例；宠物、角色专属祝福与其余角色将随角色模块接入。',
            ].join('\n');
            alert(helpText);
        },
    },
    bts_showAngry: {
        name: '显示怒气标记',
        intro: '是否在角色旁显示怒气层数',
        init: true,
        onclick: (item) => {
            game.saveExtensionConfig('崩铁杀', 'bts_showAngry', item);
        },
    },
    bts_bgm_follow_zhu: {
        name: 'BGM跟随主公',
        intro: '开启后，身份模式下开始游戏时，会将BGM改为主公的BGM（主公为AI且体力上限小于10时改为随机对战BGM）',
        init: false,
        onclick: (item) => {
            game.saveExtensionConfig('崩铁杀', 'bts_bgm_follow_zhu', item);
        },
    },
    bts_ai_character_mode: {
        name: 'AI选将逻辑',
        intro: '身份模式AI选将逻辑：纯随机 / 按评分 / 按流派（实现预留，暂仅记录选择）',
        init: 'random',
        item: {
            random: '纯随机',
            score: '按评分',
            style: '按流派',
        },
        onclick: (item) => {
            game.saveExtensionConfig('崩铁杀', 'bts_ai_character_mode', item);
        },
    },
    bts_god_condition: {
        name: '主公星启启用条件',
        intro: '身份模式主公星启（星启效果）的启用条件：均启用 / 仅崩铁角色在场 / 仅崩铁角色为主公 / 不启用（技能星启不受影响）',
        init: 'all',
        item: {
            all: '均启用',
            bts_present: '仅崩铁角色在场',
            bts_zhu: '仅崩铁角色为主公',
            off: '不启用',
        },
        onclick: (item) => {
            game.saveExtensionConfig('崩铁杀', 'bts_god_condition', item);
        },
    },
    intro: {
        name: '作者：崩铁杀项目组',
        clear: true,
        nopointer: true,
    },
};

export const mainConfig = [];
export const playerConfig = [];
export const editConfig = [];
