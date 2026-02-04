
import React from 'react';
import { ShopRecipe, ShopStaff } from '../../types';

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
