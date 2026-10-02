// 扩展配置（菜单项）
import { lib, game, ui, get, ai, _status } from '../../../noname.js';
import { extensionUpdateManager } from './tool/update/index.js';
import { configManager } from './tool/configuration/configManager.js';
import { applyNodeintroWide } from './tool/ui/nodeintroWidth.js';
import { applyCardsInfo } from './tool/ui/cardsInfo.js';
import { dialogManager } from './tool/ui/dialogManager.js';
import { extensionPath } from './tool/utils/paths.js';

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
        intro: '查看崩铁杀完整帮助文档（规则机制、底层扩展与设置说明）',
        clear: true,
        async onclick() {
            // 完整版文档页（style/html/help.html，叁岛 showDocModal 同款）；
            // {{version}} 占位由 dataProcessor 替换为当前版本号。
            const version =
                game.getExtensionConfig('崩铁杀', 'version') || '未知版本';
            try {
                await dialogManager.showDocModal(
                    `${extensionPath}/style/html/help.html`,
                    '帮助文档',
                    (content) => content.replace(/\{\{version\}\}/g, version),
                );
            } catch (error) {
                console.error('打开【崩铁杀】帮助文档失败', error);
                alert('打开帮助文档失败，请检查扩展文件完整性');
            }
        },
    },
    bts_update_log: {
        name: '<button class="bts-config-button">更新日志</button>',
        intro: '查看崩铁杀完整历史更新（由 release/releases.json 与构建脚本自动生成）',
        clear: true,
        async onclick() {
            // 完整历史更新日志页（style/html/update.html，构建脚本自动生成）；
            // {{version}} 占位由 dataProcessor 替换为当前版本号。
            const version =
                game.getExtensionConfig('崩铁杀', 'version') || '未知版本';
            try {
                await dialogManager.showDocModal(
                    `${extensionPath}/style/html/update.html`,
                    '更新日志',
                    (content) => content.replace(/\{\{version\}\}/g, version),
                );
            } catch (error) {
                console.error('打开【崩铁杀】更新日志失败', error);
                alert('打开更新日志失败，请检查扩展文件完整性');
            }
        },
    },
    bts_nodeintro_wide: {
        name: '技能详情弹窗宽度加倍',
        intro: '开启后，将角色/技能详情弹窗（#nodeintro）宽度在当前基础上×2，便于阅读长技能描述；关闭即还原默认宽度',
        init: false,
        onclick: (item) => {
            game.saveExtensionConfig('崩铁杀', 'bts_nodeintro_wide', item);
            applyNodeintroWide();
        },
    },
    bts_cardsInfo: {
        name: '卡牌上显示出牌信息',
        intro: '在打出的卡牌下方显示一行小字：“xx对xx使用”“xx打出”等',
        init: false,
        onclick: (item) => {
            game.saveExtensionConfig('崩铁杀', 'bts_cardsInfo', item);
            applyCardsInfo();
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
        intro: '开启后，身份模式下开始游戏时，会将BGM改为主公的专属BGM；主公没有专属BGM时改为随机对战BGM',
        init: false,
        onclick: (item) => {
            game.saveExtensionConfig('崩铁杀', 'bts_bgm_follow_zhu', item);
        },
    },
    bts_ai_character_mode: {
        name: 'AI选将逻辑',
        intro: '身份模式AI选将逻辑：纯随机 / 按评分（太阳神选将权重表） / 按流派（技能定位标签）；仅单机·标准身份生效',
        init: 'score',
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
        name: '主公星启条件',
        intro: '身份模式主公星启的启用条件：均启用 / 仅崩铁角色在场 / 仅崩铁角色为主公 / 不启用',
        init: 'bts_present',
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
