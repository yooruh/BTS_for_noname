import { lib, game, ui, get, ai, _status } from '../../noname.js'
import { config } from './source/config.js'
import { precontent } from './source/precontent.js'
import { content } from './source/content.js'
import help from './source/help.js'
import { extensionPath } from './source/tool/utils/paths.js'
export let type = 'extension';

// 崩铁杀（星穹铁道·三国杀）无名杀扩展入口
// 移植自《太阳神三国杀 V2 EX》的 Lua 扩展：extensions/animal.lua + lua/ai/StarRail-ai.lua
// 结构框架借鉴"叁岛世界"（Legend of Island Three）扩展。
export default async function () {
	// 特别提醒+最低版本限制
	const btsVersion = "26.8.22", minGameVersion = "1.10.0".split('.').slice(), gameVersion = lib.version.split('.').slice();
	const alertsConfig = [
		{
			id: 'gameVersion',
			shouldAlert: () => {
				for (let i in minGameVersion) {
					let ver = Number(gameVersion[i] ?? 0);
					if (ver < minGameVersion[i]) return true;
					if (ver > minGameVersion[i]) return false;
				}
				return false;
			},
			shouldReload: true,
			message: `※ 检测到当前无名杀版本（v${lib.version}）低于测试过的最低版本(v${minGameVersion.join(".")})，已自动关闭本扩展，此后可自行开启`,
			action: () => {
				game.saveExtensionConfig('崩铁杀', 'enable', false);
			},
		},
	];
	const alertDone = game.getExtensionConfig('崩铁杀', 'firstTime') ?? [];
	const triggeredAlerts = [], alertMessages = [], pendingActions = [];
	for (const { id, shouldAlert, shouldReload, message, action } of alertsConfig) {
		if (!alertDone.includes(id) && shouldAlert()) {
			triggeredAlerts.push(id);
			alertMessages.push(message);
			if (action) pendingActions.push(action);
			if (shouldReload) pendingActions.push("reload");
		}
	}
	if (triggeredAlerts.length) {
		alert(`《崩铁杀》扩展提示您：\n${alertMessages.join('\n')}`);
		pendingActions.forEach(action => typeof action === 'function' ? action() : null);
		alertDone.push(...triggeredAlerts);
		game.saveExtensionConfig('崩铁杀', 'firstTime', alertDone);
		if (pendingActions.includes("reload")) game.reload();
	}

	// 于info.json配置中获取当前版本信息并记录于配置内
	let extensionInfo;
	try {
		extensionInfo = await lib.init.promises.json(`${extensionPath}/info.json`);
		// info版本和代码版本不一致时使用代码版本
		let versionIndex = extensionInfo.intro.lastIndexOf('版本：') + 3;
		if (versionIndex > 3) {
			let infoVersion = extensionInfo.intro.slice(versionIndex);
			if (btsVersion != infoVersion) {
				extensionInfo.intro = extensionInfo.intro.replace(infoVersion, btsVersion);
				const jsonStr = JSON.stringify(extensionInfo, null, 2);
				game.writeFile(jsonStr, extensionPath, 'info.json', (writeError) => {
					if (writeError) console.error(`创建info.json时发生错误:`, writeError);
				});
			}
		} else {
			extensionInfo.intro += `<li>版本：${btsVersion}`;
		}
	} catch (e) {
		// 使用默认info
		extensionInfo = { name: "崩铁杀", author: "崩铁杀项目组", intro: `<li>版本：${btsVersion}` };
		if (e && e.message?.includes("Not Found")) {
			const jsonStr = JSON.stringify(extensionInfo, null, 2);
			game.writeFile(jsonStr, extensionPath, 'info.json', (writeError) => {
				if (writeError) console.error(`创建info.json时发生错误:`, writeError);
			});
		}
	}
	if (game.getExtensionConfig('崩铁杀', 'version') != btsVersion) {
		game.saveExtensionConfig('崩铁杀', 'version', btsVersion);
		// 附加功能判断时间早于init应用，首次启动时对应配置为空，故手动应用默认配置并重载游戏
		Object.keys(config).forEach(s => {
			if (s.startsWith('bts_') || s === "intro") return;
			lib.config['extension_崩铁杀_' + s] = lib.config['extension_崩铁杀_' + s] ?? config[s].init;
		});
		game.saveConfig();
		game.reload();
	}
	const extension = {
		name: extensionInfo.name, editable: false,
		content, precontent, config, help,
		package: {},
	};
	if (!extension.config.intro.name.endsWith(extensionInfo.intro)) {
		extension.config.intro.name += extensionInfo.intro;
	}
	return extension;
}
