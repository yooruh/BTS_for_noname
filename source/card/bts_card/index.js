// 卡牌包空壳（对应源 StarRailCard：卡牌克隆整体被注释，animal.lua L9092-9195）
// 仅在无名杀中占位注册包名；默认不启用（源 config.ini 的 BanPackages 亦默认禁用 StarRailCard）。
export const packMeta = {
    defaultEnabled: false,
};

export const info = {
    name: 'bts_card',
    connect: false,
    card: {},
    list: [],
    translate: {
        bts_card: '崩铁杀卡牌包（空壳）',
    },
};
