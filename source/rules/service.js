// 崩铁杀规则服务注册表。
// 通用结算器只处理 animal.lua 的公共机制；角色/祝福专属分支由角色模块按事件或 mod 钩子注册。

const EVENT_HANDLERS = new Map();
const MODIFIERS = new Map();

function addEntry(table, key, handler, priority = 0) {
    if (typeof handler !== 'function')
        throw new TypeError(`崩铁杀规则处理器 ${key} 必须是函数`);
    const entries = table.get(key) ?? [];
    const entry = { handler, priority };
    entries.push(entry);
    entries.sort((a, b) => b.priority - a.priority);
    table.set(key, entries);
    return () => {
        const current = table.get(key);
        if (!current) return;
        const index = current.indexOf(entry);
        if (index >= 0) current.splice(index, 1);
        if (!current.length) table.delete(key);
    };
}

export const ruleService = {
    // registerEvent('damageEnd', async (event, player) => {}, priority)
    registerEvent(name, handler, priority = 0) {
        return addEntry(EVENT_HANDLERS, name, handler, priority);
    },
    async dispatchEvent(name, event, player) {
        for (const { handler } of EVENT_HANDLERS.get(name) ?? []) {
            await handler(event, player);
        }
    },
    // registerMod('attackRange', (player, range) => range + 1, priority)
    registerMod(name, handler, priority = 0) {
        return addEntry(MODIFIERS, name, handler, priority);
    },
    dispatchMod(name, ...args) {
        let value = args.at(-1);
        for (const { handler } of MODIFIERS.get(name) ?? []) {
            const result = handler(...args.slice(0, -1), value);
            if (result !== undefined) value = result;
        }
        return value;
    },
    clear() {
        EVENT_HANDLERS.clear();
        MODIFIERS.clear();
    },
};
