
import React, { useState, useRef } from 'react';
import { BankFullState, ShopStaff, CharacterProfile } from '../../types';
import { SHOP_RECIPES, AVAILABLE_STAFF } from './BankGameConstants';
import { processImage } from '../../utils/file';

interface Props {
    state: BankFullState;
    characters?: CharacterProfile[];
    onUnlockRecipe: (id: string, cost: number) => void;
    onHireStaff: (staff: any, cost: number) => void;
    onStaffRest: (id: string) => void;
    onUpdateConfig: (cfg: any) => void;
    onAddGoal: () => void;
    onDeleteGoal: (id: string) => void;
    onEditStaff: (staff: ShopStaff) => void;
}

const BankGameMenu: React.FC<Props> = ({
    state, characters = [], onUnlockRecipe, onHireStaff, onStaffRest, onUpdateConfig,
    onAddGoal, onDeleteGoal, onEditStaff
}) => {
    const [tab, setTab] = useState<'staff' | 'menu' | 'goals'>('menu');
    const [showCustomHire, setShowCustomHire] = useState(false);

    // Custom Hire Form
    const [customName, setCustomName] = useState('');
    const [customRole, setCustomRole] = useState<'waiter'|'chef'|'manager'>('waiter');
    const [customAvatar, setCustomAvatar] = useState('🐾');
    const [selectedOwner, setSelectedOwner] = useState<string>(''); // Character ID for pet owner
    const [isPetMode, setIsPetMode] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [avatarMode, setAvatarMode] = useState<'url' | 'upload'>('url'); // Default to URL mode
    const [avatarUrl, setAvatarUrl] = useState('');

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await processImage(file);
                setCustomAvatar(base64);
            } catch (err) {
                console.error('Failed to process image', err);
            }
        }
    };

    const handleAvatarUrlChange = (url: string) => {
        setAvatarUrl(url);
        if (url.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i) || url.match(/^https?:\/\/.+/i)) {
            setCustomAvatar(url);
        }
    };

    const handleCustomHire = () => {
        if(!customName) return;
        const newStaff: any = {
            id: `staff-custom-${Date.now()}`,
            name: customName,
            avatar: customAvatar,
            role: customRole,
            maxFatigue: 100,
            fatigue: 0,
            hireDate: Date.now()
        };

        // If pet mode and owner selected
        if (isPetMode && selectedOwner) {
            newStaff.isPet = true;
            newStaff.ownerCharId = selectedOwner;
            const owner = characters.find(c => c.id === selectedOwner);
            if (owner) {
                newStaff.personality = `${owner.name}的宝贝宠物，需要好好照顾！`;
            }
        }

        onHireStaff(newStaff, isPetMode ? 150 : 200);
        setShowCustomHire(false);
        setCustomName('');
        setCustomAvatar('🐾');
        setSelectedOwner('');
        setIsPetMode(false);
        setAvatarUrl('');
        setAvatarMode('url');
    };

    return (
        <div className="space-y-5">
            {/* Premium Tab Bar */}
            <div className="flex bg-white/60 backdrop-blur-sm p-1.5 rounded-2xl shadow-sm border border-[#E8DCC8]">
                {[
                    { key: 'menu', label: '菜单', icon: '🍰' },
                    { key: 'staff', label: '员工', icon: '👥' },
                    { key: 'goals', label: '目标', icon: '🎯' }
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key as any)}
                        className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 ${
                            tab === t.key
                                ? 'bg-gradient-to-br from-[#8D6E63] to-[#6D4C41] text-white shadow-lg'
                                : 'text-[#8D6E63] hover:bg-[#FDF6E3]'
                        }`}
                    >
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                    </button>
                ))}
            </div>

            {/* Menu (Recipes) - Premium Card Grid */}
            {tab === 'menu' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-bold text-[#5D4037]">甜品菜单</h3>
                        <span className="text-[10px] text-[#A1887F] bg-[#FDF6E3] px-2 py-1 rounded-full">已解锁 {state.shop.unlockedRecipes.length}/{SHOP_RECIPES.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {SHOP_RECIPES.map(recipe => {
                            const isUnlocked = state.shop.unlockedRecipes.includes(recipe.id);
                            return (
                                <div
                                    key={recipe.id}
                                    className={`relative p-4 rounded-2xl transition-all duration-300 ${
                                        isUnlocked
                                            ? 'bg-white shadow-md border border-[#E8DCC8]'
                                            : 'bg-gradient-to-br from-[#F5F0E8] to-[#EDE5D8] border border-[#E0D5C5]'
                                    }`}
                                >
                                    {/* Unlocked badge */}
                                    {isUnlocked && (
                                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-[#66BB6A] to-[#43A047] rounded-full flex items-center justify-center shadow-md">
                                            <span className="text-white text-xs">✓</span>
                                        </div>
                                    )}

                                    <div className="flex flex-col items-center text-center">
                                        <div className={`text-4xl mb-2 ${isUnlocked ? '' : 'grayscale opacity-60'}`}>
                                            {recipe.icon}
                                        </div>
                                        <div className={`font-bold text-sm mb-1 ${isUnlocked ? 'text-[#5D4037]' : 'text-[#8D6E63]'}`}>
                                            {recipe.name}
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-[#A1887F]">
                                            <span className="text-yellow-500">✨</span>
                                            <span>人气 +{recipe.appeal}</span>
                                        </div>

                                        {!isUnlocked && (
                                            <button
                                                onClick={() => onUnlockRecipe(recipe.id, recipe.cost)}
                                                className="mt-3 w-full py-2 bg-gradient-to-r from-[#FF8A65] to-[#FF7043] text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all"
                                            >
                                                解锁 · {recipe.cost} AP
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Staff Management - Premium Design */}
            {tab === 'staff' && (
                <div className="space-y-6">
                    {/* Active Staff Section */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-[#5D4037] flex items-center gap-2">
                                <span className="w-6 h-6 bg-gradient-to-br from-[#A5D6A7] to-[#66BB6A] rounded-lg flex items-center justify-center text-white text-xs">✓</span>
                                在职员工
                            </h4>
                            <span className="text-[10px] text-[#A1887F]">点击头像编辑</span>
                        </div>
                        <div className="space-y-3">
                            {state.shop.staff.map(s => (
                                <div key={s.id} className="bg-white p-4 rounded-2xl border border-[#E8DCC8] shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onEditStaff(s)}>
                                            <div className="relative">
                                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#FFF8E1] to-[#FFE0B2] flex items-center justify-center text-3xl shadow-inner group-hover:scale-105 transition-transform">
                                                    {s.avatar.startsWith('http') || s.avatar.startsWith('data')
                                                        ? <img src={s.avatar} className="w-full h-full object-cover rounded-xl" />
                                                        : s.avatar
                                                    }
                                                </div>
                                                {/* Status indicator */}
                                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${s.fatigue > 80 ? 'bg-red-400' : s.fatigue > 50 ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
                                            </div>
                                            <div>
                                                <div className="font-bold text-[#5D4037] group-hover:text-[#FF7043] transition-colors">{s.name}</div>
                                                <div className="text-[10px] text-[#A1887F] uppercase tracking-wider">{s.role === 'manager' ? '经理' : s.role === 'chef' ? '主厨' : '服务员'}</div>
                                                {/* Energy bar */}
                                                <div className="mt-1.5 flex items-center gap-2">
                                                    <span className="text-[9px] text-[#BCAAA4]">精力</span>
                                                    <div className="w-20 h-2 bg-[#EFEBE9] rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${s.fatigue > 80 ? 'bg-gradient-to-r from-red-400 to-red-500' : s.fatigue > 50 ? 'bg-gradient-to-r from-yellow-400 to-orange-400' : 'bg-gradient-to-r from-green-400 to-emerald-500'}`}
                                                            style={{ width: `${Math.max(5, 100 - s.fatigue)}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onStaffRest(s.id)}
                                            disabled={s.fatigue === 0}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                                s.fatigue === 0
                                                    ? 'bg-[#EFEBE9] text-[#BCAAA4] cursor-not-allowed'
                                                    : 'bg-gradient-to-r from-[#81C784] to-[#66BB6A] text-white shadow-md hover:shadow-lg active:scale-95'
                                            }`}
                                        >
                                            {s.fatigue === 0 ? '满血' : '休息 20AP'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hire Section */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-[#5D4037] flex items-center gap-2">
                                <span className="w-6 h-6 bg-gradient-to-br from-[#90CAF9] to-[#42A5F5] rounded-lg flex items-center justify-center text-white text-xs">+</span>
                                人才市场
                            </h4>
                            <button
                                onClick={() => setShowCustomHire(!showCustomHire)}
                                className="text-[10px] font-bold text-[#42A5F5] bg-[#E3F2FD] px-3 py-1.5 rounded-lg hover:bg-[#BBDEFB] transition-colors"
                            >
                                {showCustomHire ? '收起' : '✨ 自定义招聘'}
                            </button>
                        </div>

                        {/* Custom Hire Form - Enhanced with Pet Mode */}
                        {showCustomHire && (
                            <div className="bg-gradient-to-br from-white to-[#FDF6E3] p-4 rounded-2xl border-2 border-dashed border-[#FFE0B2] mb-4 space-y-4 animate-fade-in">
                                {/* Pet Mode Toggle */}
                                <div className="flex items-center justify-between bg-gradient-to-r from-[#FFE0B2]/30 to-[#FFCC80]/30 p-3 rounded-xl">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">🐾</span>
                                        <div>
                                            <div className="text-xs font-bold text-[#8D6E63]">宠物模式</div>
                                            <div className="text-[9px] text-[#A1887F]">为角色招募专属宠物员工</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsPetMode(!isPetMode)}
                                        className={`w-12 h-6 rounded-full transition-all duration-300 relative ${isPetMode ? 'bg-gradient-to-r from-[#FF8A65] to-[#FF7043]' : 'bg-[#E8DCC8]'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${isPetMode ? 'left-7' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                {/* Owner Selection (Pet Mode) */}
                                {isPetMode && characters.length > 0 && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-[#A1887F] uppercase">选择主人</label>
                                        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                            {characters.map(char => (
                                                <button
                                                    key={char.id}
                                                    onClick={() => setSelectedOwner(char.id)}
                                                    className={`flex-shrink-0 flex flex-col items-center p-2 rounded-xl transition-all ${
                                                        selectedOwner === char.id
                                                            ? 'bg-gradient-to-br from-[#FF8A65] to-[#FF7043] shadow-lg scale-105'
                                                            : 'bg-white border border-[#E8DCC8] hover:border-[#FF7043]'
                                                    }`}
                                                >
                                                    <img src={char.avatar} className="w-10 h-10 rounded-lg object-cover" />
                                                    <span className={`text-[9px] font-bold mt-1 truncate max-w-[50px] ${selectedOwner === char.id ? 'text-white' : 'text-[#5D4037]'}`}>
                                                        {char.name}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Name Input */}
                                <input
                                    value={customName}
                                    onChange={e => setCustomName(e.target.value)}
                                    placeholder={isPetMode ? "宠物名字" : "员工姓名"}
                                    className="w-full bg-white rounded-xl px-4 py-2.5 text-sm border border-[#E8DCC8] outline-none focus:border-[#FF7043] transition-colors"
                                />

                                {/* Avatar Section with Mode Toggle */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-[#A1887F] uppercase">头像设置</label>
                                        <div className="flex bg-[#F5F0E8] p-0.5 rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setAvatarMode('url')}
                                                className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${
                                                    avatarMode === 'url'
                                                        ? 'bg-gradient-to-r from-[#42A5F5] to-[#1E88E5] text-white'
                                                        : 'text-[#8D6E63]'
                                                }`}
                                            >
                                                🔗 图床URL
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAvatarMode('upload')}
                                                className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${
                                                    avatarMode === 'upload'
                                                        ? 'bg-gradient-to-r from-[#42A5F5] to-[#1E88E5] text-white'
                                                        : 'text-[#8D6E63]'
                                                }`}
                                            >
                                                📷 上传
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        {/* Avatar Preview */}
                                        <div className="w-14 h-14 flex-shrink-0 bg-white rounded-xl border border-[#E8DCC8] flex items-center justify-center overflow-hidden">
                                            {customAvatar.startsWith('data:') || customAvatar.startsWith('http') ? (
                                                <img src={customAvatar} className="w-full h-full object-cover" onError={() => setCustomAvatar('🐾')} />
                                            ) : (
                                                <span className="text-2xl">{customAvatar}</span>
                                            )}
                                        </div>

                                        {/* URL or Upload Input */}
                                        {avatarMode === 'url' ? (
                                            <div className="flex-1 space-y-1.5">
                                                <input
                                                    type="url"
                                                    value={avatarUrl}
                                                    onChange={e => handleAvatarUrlChange(e.target.value)}
                                                    placeholder="粘贴图床链接，如 https://..."
                                                    className="w-full bg-white rounded-xl px-3 py-2 text-xs border border-[#E8DCC8] outline-none focus:border-[#42A5F5] transition-colors"
                                                />
                                                <div className="text-[9px] text-[#66BB6A] flex items-center gap-1">
                                                    <span>✓</span>
                                                    <span>推荐使用图床，节省本地存储空间</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => avatarInputRef.current?.click()}
                                                    className="w-full py-2 bg-[#FDF6E3] border border-dashed border-[#BCAAA4] rounded-xl text-xs text-[#8D6E63] hover:bg-[#FFF8E1] hover:border-[#8D6E63] transition-all"
                                                >
                                                    📷 选择图片
                                                </button>
                                                <div className="text-[9px] text-[#BCAAA4] mt-1 text-center">
                                                    图片将占用本地存储
                                                </div>
                                                <input
                                                    ref={avatarInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={handleAvatarUpload}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Role & Hire Button */}
                                <div className="flex justify-between items-center">
                                    <select
                                        value={customRole}
                                        onChange={(e) => setCustomRole(e.target.value as any)}
                                        className="bg-white rounded-xl px-3 py-2 text-xs border border-[#E8DCC8] outline-none text-[#5D4037]"
                                    >
                                        <option value="waiter">{isPetMode ? '🐕 店小二' : '🙋 服务员'}</option>
                                        <option value="chef">{isPetMode ? '🐱 小帮厨' : '👨‍🍳 大厨'}</option>
                                        <option value="manager">{isPetMode ? '🐰 吉祥物' : '💼 经理'}</option>
                                    </select>
                                    <button
                                        onClick={handleCustomHire}
                                        disabled={!customName || (isPetMode && !selectedOwner)}
                                        className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all ${
                                            !customName || (isPetMode && !selectedOwner)
                                                ? 'bg-[#E8DCC8] text-[#A1887F] cursor-not-allowed'
                                                : 'bg-gradient-to-r from-[#42A5F5] to-[#1E88E5] text-white hover:shadow-lg active:scale-95'
                                        }`}
                                    >
                                        {isPetMode ? '领养 · 150 AP' : '雇佣 · 200 AP'}
                                    </button>
                                </div>

                                {/* Pet Mode Hint */}
                                {isPetMode && selectedOwner && (
                                    <div className="bg-[#FFF3E0] p-3 rounded-xl text-[10px] text-[#E65100] flex items-start gap-2">
                                        <span className="text-base">💡</span>
                                        <span>当 {characters.find(c => c.id === selectedOwner)?.name} 来访时，会发现自己的宠物在这里打工，触发特殊互动！</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Available Staff */}
                        <div className="space-y-2">
                            {AVAILABLE_STAFF.filter(s => !state.shop.staff.find(exist => exist.name === s.name)).map(s => (
                                <div key={s.id} className="bg-[#FDF6E3] p-4 rounded-2xl border border-[#E8DCC8] flex items-center justify-between hover:bg-[#FFF8E1] transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center text-2xl grayscale-[50%] opacity-80">{s.avatar}</div>
                                        <div>
                                            <div className="font-bold text-sm text-[#5D4037]">{s.name}</div>
                                            <div className="text-[10px] text-[#A1887F] uppercase tracking-wider">{s.role === 'manager' ? '经理' : s.role === 'chef' ? '主厨' : '服务员'}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onHireStaff({ ...s, id: `staff-${Date.now()}`, fatigue: 0, hireDate: Date.now() }, 200)}
                                        className="bg-gradient-to-r from-[#FF8A65] to-[#FF7043] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all"
                                    >
                                        雇佣 · 200 AP
                                    </button>
                                </div>
                            ))}
                            {AVAILABLE_STAFF.every(s => state.shop.staff.find(exist => exist.name === s.name)) && !showCustomHire && (
                                <div className="text-center py-8">
                                    <div className="text-4xl mb-2 opacity-50">🎉</div>
                                    <div className="text-xs text-[#A1887F]">全员已到齐！</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Goals Section - Premium Design */}
            {tab === 'goals' && (
                <div className="space-y-4">
                    {/* Add Goal Button */}
                    <button
                        onClick={onAddGoal}
                        className="w-full py-4 border-2 border-dashed border-[#BCAAA4] text-[#8D6E63] rounded-2xl font-bold hover:bg-[#FDF6E3] hover:border-[#8D6E63] transition-all flex items-center justify-center gap-2"
                    >
                        <span className="w-6 h-6 bg-[#EFEBE9] rounded-full flex items-center justify-center text-sm">+</span>
                        添加储蓄目标
                    </button>

                    {/* Goals List */}
                    {state.goals.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-3 opacity-40">🎯</div>
                            <div className="text-sm text-[#A1887F]">还没有储蓄目标</div>
                            <div className="text-xs text-[#BCAAA4] mt-1">设定一个目标，开始攒钱吧！</div>
                        </div>
                    ) : (
                        state.goals.map(g => {
                            const progress = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
                            return (
                                <div key={g.id} className="bg-white p-5 rounded-2xl border border-[#E8DCC8] shadow-sm relative group overflow-hidden">
                                    {/* Background progress */}
                                    <div
                                        className="absolute inset-0 bg-gradient-to-r from-[#C8E6C9] to-[#A5D6A7] opacity-20 transition-all duration-700"
                                        style={{ width: `${progress}%` }}
                                    ></div>

                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl">{g.icon || '🎁'}</span>
                                                <span className="font-bold text-[#5D4037]">{g.name}</span>
                                            </div>
                                            <span className="font-mono font-bold text-[#FF7043] text-lg">{state.config.currencySymbol}{g.targetAmount}</span>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="h-3 bg-[#EFEBE9] rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-[#66BB6A] to-[#43A047] rounded-full transition-all duration-700 relative"
                                                style={{ width: `${progress}%` }}
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent"></div>
                                            </div>
                                        </div>

                                        <div className="flex justify-between mt-2 text-[10px]">
                                            <span className="text-[#A1887F]">已存 {state.config.currencySymbol}{g.currentAmount}</span>
                                            <span className="text-[#66BB6A] font-bold">{progress.toFixed(0)}%</span>
                                        </div>
                                    </div>

                                    {/* Delete button */}
                                    <button
                                        onClick={() => onDeleteGoal(g.id)}
                                        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        ×
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};

export default BankGameMenu;
