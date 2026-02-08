
import React from 'react';
import { ShopRecipe, ShopStaff, ShopFloorPlanDef } from '../../types';

// Pixel Art Assets (Using Emojis styled as pixel or URLs)
export const BANK_ASSETS = {
    // Backgrounds (Patterns)
    floors: {
        wood: 'repeating-linear-gradient(0deg, #c19a6b 0px, #c19a6b 4px, #a67c52 5px)',
        tile: 'conic-gradient(from 90deg at 2px 2px, #fdf6e3 90deg, #eee8d5 0) 0 0/20px 20px',
        check: 'conic-gradient(#eee8d5 90deg, #fdf6e3 90deg 180deg, #eee8d5 180deg 270deg, #fdf6e3 270deg) 0 0 / 40px 40px'
    },
    // Furniture Placeholders (Using Emojis for now, rendered pixelated)
    furniture: {
        table: '🪑',
        counter: '🍱', 
        plant: '🪴',
        window: '🪟',
        rug: '🧶'
    }
};

export const SHOP_RECIPES: ShopRecipe[] = [
    { id: 'recipe-coffee-001', name: '手冲咖啡', icon: '☕', cost: 0, appeal: 10, isUnlocked: true },
    { id: 'recipe-cake-001', name: '草莓蛋糕', icon: '🍰', cost: 50, appeal: 20, isUnlocked: false },
    { id: 'recipe-tea-001', name: '伯爵红茶', icon: '🍵', cost: 80, appeal: 25, isUnlocked: false },
    { id: 'recipe-donut-001', name: '甜甜圈', icon: '🍩', cost: 120, appeal: 30, isUnlocked: false },
    { id: 'recipe-icecream-001', name: '抹茶冰淇淋', icon: '🍦', cost: 200, appeal: 40, isUnlocked: false },
    { id: 'recipe-pudding-001', name: '焦糖布丁', icon: '🍮', cost: 300, appeal: 50, isUnlocked: false },
    { id: 'recipe-cocktail-001', name: '特调气泡水', icon: '🍹', cost: 500, appeal: 80, isUnlocked: false },
];

export const AVAILABLE_STAFF: Omit<ShopStaff, 'hireDate' | 'fatigue'>[] = [
    { id: 'staff-cat-01', name: '橘猫店长', avatar: '🐱', role: 'manager', maxFatigue: 100 },
    { id: 'staff-dog-01', name: '柴犬服务生', avatar: '🐶', role: 'waiter', maxFatigue: 120 },
    { id: 'staff-bear-01', name: '棕熊大厨', avatar: '🐻', role: 'chef', maxFatigue: 150 },
    { id: 'staff-rabbit-01', name: '兔兔前台', avatar: '🐰', role: 'waiter', maxFatigue: 80 },
    { id: 'staff-penguin-01', name: '企鹅采购', avatar: '🐧', role: 'manager', maxFatigue: 110 },
];

// --- FLOOR PLANS (Room Layouts) ---
export const FLOOR_PLANS: ShopFloorPlanDef[] = [
    {
        id: 'plan-standard',
        name: '标准四间',
        icon: '🏠',
        cost: 0,
        roomDefs: [
            { id: 'r-1l', name: '一楼左厅', layer: 1, position: 'left' },
            { id: 'r-1r', name: '一楼右厅', layer: 1, position: 'right' },
            { id: 'r-2l', name: '二楼左室', layer: 2, position: 'left' },
            { id: 'r-2r', name: '二楼右室', layer: 2, position: 'right' },
        ]
    },
    {
        id: 'plan-open-ground',
        name: '开放一楼',
        icon: '🏪',
        cost: 150,
        roomDefs: [
            { id: 'r-1f', name: '一楼大厅', layer: 1, position: 'full' },
            { id: 'r-2l', name: '二楼左室', layer: 2, position: 'left' },
            { id: 'r-2r', name: '二楼右室', layer: 2, position: 'right' },
        ]
    },
    {
        id: 'plan-loft',
        name: '阁楼咖啡厅',
        icon: '🏡',
        cost: 150,
        roomDefs: [
            { id: 'r-1l', name: '一楼左厅', layer: 1, position: 'left' },
            { id: 'r-1r', name: '一楼右厅', layer: 1, position: 'right' },
            { id: 'r-2f', name: '二楼阁楼', layer: 2, position: 'full' },
        ]
    },
    {
        id: 'plan-duplex',
        name: '复式大开间',
        icon: '🏢',
        cost: 300,
        roomDefs: [
            { id: 'r-1f', name: '一楼大厅', layer: 1, position: 'full' },
            { id: 'r-2f', name: '二楼大厅', layer: 2, position: 'full' },
        ]
    },
];

export const ROOM_UNLOCK_COST = 80; // AP per room

// --- WALLPAPER PRESETS ---
export const WALLPAPER_PRESETS = [
    { id: 'wp-white', name: '白墙', value: '#FFFFFF', cost: 0 },
    { id: 'wp-cream', name: '奶油色', value: 'linear-gradient(180deg, #FEF9F0, #FDF5E6)', cost: 20 },
    { id: 'wp-blue', name: '天空蓝', value: 'linear-gradient(180deg, #E3F2FD, #BBDEFB)', cost: 30 },
    { id: 'wp-pink', name: '樱花粉', value: 'linear-gradient(180deg, #FCE4EC, #F8BBD0)', cost: 30 },
    { id: 'wp-green', name: '薄荷绿', value: 'linear-gradient(180deg, #E8F5E9, #C8E6C9)', cost: 30 },
    { id: 'wp-lavender', name: '薰衣草', value: 'linear-gradient(180deg, #EDE7F6, #D1C4E9)', cost: 30 },
    { id: 'wp-wood', name: '木质墙板', value: 'linear-gradient(180deg, #EFEBE9, #D7CCC8)', cost: 50 },
    { id: 'wp-brick', name: '红砖墙', value: 'repeating-linear-gradient(0deg, #D7837F 0px, #D7837F 10px, #C0625E 10px, #C0625E 12px)', cost: 60 },
    { id: 'wp-damask', name: '复古花纹', value: 'linear-gradient(135deg, #FFF8E1 25%, #FFE0B2 50%, #FFF8E1 75%)', cost: 80 },
    { id: 'wp-night', name: '深夜蓝', value: 'linear-gradient(180deg, #1A237E, #283593)', cost: 80 },
];

// --- FLOOR PRESETS ---
export const FLOOR_PRESETS = [
    { id: 'fl-concrete', name: '水泥地', value: '#E0E0E0', cost: 0 },
    { id: 'fl-wood', name: '木地板', value: 'repeating-linear-gradient(90deg, #C19A6B 0px, #C19A6B 18px, #A67C52 18px, #A67C52 20px)', cost: 20 },
    { id: 'fl-tile', name: '瓷砖', value: 'conic-gradient(from 90deg at 1px 1px, #FDF6E3 90deg, #EEE8D5 0) 0 0/12px 12px', cost: 30 },
    { id: 'fl-checker', name: '棋盘格', value: 'conic-gradient(#EEE8D5 90deg, #FDF6E3 90deg 180deg, #EEE8D5 180deg 270deg, #FDF6E3 270deg) 0 0 / 16px 16px', cost: 40 },
    { id: 'fl-carpet-red', name: '红地毯', value: 'linear-gradient(180deg, #C62828, #B71C1C)', cost: 50 },
    { id: 'fl-carpet-green', name: '绿地毯', value: 'linear-gradient(180deg, #2E7D32, #1B5E20)', cost: 50 },
    { id: 'fl-marble', name: '大理石', value: 'linear-gradient(135deg, #FAFAFA 0%, #F0F0F0 25%, #FAFAFA 50%, #E8E8E8 75%, #FAFAFA 100%)', cost: 80 },
    { id: 'fl-dark-wood', name: '深色木', value: 'repeating-linear-gradient(90deg, #5D4037 0px, #5D4037 18px, #4E342E 18px, #4E342E 20px)', cost: 60 },
];

// --- DECORATION STICKERS ---
export const DECO_STICKERS = [
    '🪴', '🖼️', '🕐', '📚', '🧸', '🎸', '🎹', '🪞',
    '☕', '🍰', '🍩', '🧁', '🎂', '🍪', '🫖', '🥐',
    '🎀', '🌸', '🌺', '🏮', '🎈', '🌿', '🕯️', '⭐',
    '🛋️', '🪑', '🖥️', '📻', '🎧', '💡', '🧲', '🎪',
    '🐱', '🐶', '🐰', '🧊', '🎨', '📸', '🎵', '🌙',
];
