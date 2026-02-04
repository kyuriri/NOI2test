
import React, { useState } from 'react';
import { BankFullState, ShopStaff } from '../../types';
import { SHOP_RECIPES, AVAILABLE_STAFF } from './BankGameConstants';

interface Props {
    state: BankFullState;
    onUnlockRecipe: (id: string, cost: number) => void;
    onHireStaff: (staff: any, cost: number) => void;
    onStaffRest: (id: string) => void;
    onUpdateConfig: (cfg: any) => void;
    onAddGoal: () => void;
    onDeleteGoal: (id: string) => void;
    onEditStaff: (staff: ShopStaff) => void;
}

const BankGameMenu: React.FC<Props> = ({ 
    state, onUnlockRecipe, onHireStaff, onStaffRest, onUpdateConfig, 
    onAddGoal, onDeleteGoal, onEditStaff 
}) => {
    const [tab, setTab] = useState<'staff' | 'menu' | 'goals'>('menu');
    const [showCustomHire, setShowCustomHire] = useState(false);
    
    // Custom Hire Form
    const [customName, setCustomName] = useState('');
    const [customRole, setCustomRole] = useState<'waiter'|'chef'|'manager'>('waiter');
    const [customAvatar, setCustomAvatar] = useState('🧑‍🍳');

    const handleCustomHire = () => {
        if(!customName) return;
        const newStaff = {
            id: `staff-custom-${Date.now()}`,
            name: customName,
            avatar: customAvatar,
            role: customRole,
            maxFatigue: 100,
            fatigue: 0,
            hireDate: Date.now()
        };
        onHireStaff(newStaff, 200);
        setShowCustomHire(false);
        setCustomName('');
    };

    return (
        <div className="space-y-4 font-mono">
            {/* Tab Bar */}
            <div className="flex bg-[#eee8d5] p-1 rounded-xl overflow-x-auto no-scrollbar">
                {['menu', 'staff', 'goals'].map(t => (
                    <button 
                        key={t}
                        onClick={() => setTab(t as any)}
                        className={`flex-1 py-2 px-2 text-[10px] font-bold uppercase rounded-lg transition-all whitespace-nowrap ${tab === t ? 'bg-white shadow text-[#b58900]' : 'text-[#93a1a1] hover:bg-[#e6dfc8]'}`}
                    >
                        {t === 'menu' ? '菜单' : (t === 'staff' ? '员工' : '目标')}
                    </button>
                ))}
            </div>

            {/* Menu (Recipes) */}
            {tab === 'menu' && (
                <div className="grid grid-cols-2 gap-3">
                    {SHOP_RECIPES.map(recipe => {
                        const isUnlocked = state.shop.unlockedRecipes.includes(recipe.id);
                        return (
                            <div key={recipe.id} className={`p-3 rounded-xl border-2 flex items-center gap-3 relative ${isUnlocked ? 'bg-white border-[#eee8d5]' : 'bg-[#e6dfc8] border-transparent opacity-80'}`}>
                                <div className="text-3xl filter drop-shadow-sm">{recipe.icon}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-[#586e75] truncate">{recipe.name}</div>
                                    <div className="text-[10px] text-[#93a1a1]">人气 +{recipe.appeal}</div>
                                </div>
                                {isUnlocked ? (
                                    <div className="text-green-500 text-xs font-bold">✔</div>
                                ) : (
                                    <button 
                                        onClick={() => onUnlockRecipe(recipe.id, recipe.cost)}
                                        className="absolute bottom-2 right-2 bg-[#2aa198] text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm active:scale-95"
                                    >
                                        {recipe.cost} AP
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Staff Management */}
            {tab === 'staff' && (
                <div className="space-y-6">
                    {/* Active Staff */}
                    <div>
                        <h4 className="text-xs font-bold text-[#93a1a1] mb-2 uppercase tracking-widest">在职员工 (点击头像编辑)</h4>
                        <div className="space-y-2">
                            {state.shop.staff.map(s => (
                                <div key={s.id} className="bg-white p-3 rounded-xl border border-[#eee8d5] flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onEditStaff(s)}>
                                        <div className="text-2xl w-10 h-10 flex items-center justify-center bg-slate-50 rounded-lg group-hover:bg-slate-100 transition-colors">
                                            {s.avatar.startsWith('http') || s.avatar.startsWith('data') ? <img src={s.avatar} className="w-full h-full object-cover rounded-lg" /> : s.avatar}
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-[#586e75] group-hover:text-[#268bd2] transition-colors">{s.name}</div>
                                            <div className="w-16 h-1.5 bg-[#eee8d5] rounded-full mt-1 overflow-hidden">
                                                <div className={`h-full ${s.fatigue > 80 ? 'bg-red-400' : 'bg-green-400'}`} style={{ width: `${Math.max(0, 100 - s.fatigue)}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => onStaffRest(s.id)}
                                        disabled={s.fatigue === 0}
                                        className={`px-3 py-1.5 rounded text-[10px] font-bold border-b-2 active:border-b-0 active:translate-y-0.5 transition-all ${s.fatigue === 0 ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-[#859900] text-white border-[#5f6e00]'}`}
                                    >
                                        休息 (-20AP)
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hire New */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-xs font-bold text-[#93a1a1] uppercase tracking-widest">人才市场</h4>
                            <button onClick={() => setShowCustomHire(!showCustomHire)} className="text-[10px] text-[#268bd2] font-bold bg-[#e0f2fe] px-2 py-1 rounded hover:bg-[#bae6fd]">
                                {showCustomHire ? '收起' : '+ 录入简历 (自定义)'}
                            </button>
                        </div>

                        {showCustomHire && (
                            <div className="bg-white p-4 rounded-xl border-2 border-dashed border-[#d3cbb8] mb-4 space-y-3 animate-slide-down">
                                <div className="flex gap-2">
                                    <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="员工姓名" className="flex-1 bg-[#fdf6e3] rounded-lg px-3 py-2 text-sm border-none outline-none" />
                                    <input value={customAvatar} onChange={e => setCustomAvatar(e.target.value)} placeholder="Emoji" className="w-16 bg-[#fdf6e3] rounded-lg px-2 py-2 text-sm text-center border-none outline-none" />
                                </div>
                                <div className="flex justify-between items-center">
                                    <select value={customRole} onChange={(e) => setCustomRole(e.target.value as any)} className="bg-[#fdf6e3] rounded-lg px-2 py-1 text-xs outline-none text-[#586e75]">
                                        <option value="waiter">服务员</option>
                                        <option value="chef">大厨</option>
                                        <option value="manager">经理</option>
                                    </select>
                                    <button onClick={handleCustomHire} className="bg-[#268bd2] text-white px-3 py-1 rounded text-xs font-bold">雇佣 (200 AP)</button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {AVAILABLE_STAFF.filter(s => !state.shop.staff.find(exist => exist.name === s.name)).map(s => (
                                <div key={s.id} className="bg-[#fdf6e3] p-3 rounded-xl border border-[#eee8d5] flex items-center justify-between opacity-90">
                                    <div className="flex items-center gap-3">
                                        <div className="text-2xl grayscale opacity-70">{s.avatar}</div>
                                        <div>
                                            <div className="font-bold text-sm text-[#586e75]">{s.name}</div>
                                            <div className="text-[10px] text-[#93a1a1] uppercase">{s.role}</div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => onHireStaff({ ...s, id: `staff-${Date.now()}`, fatigue: 0, hireDate: Date.now() }, 200)}
                                        className="bg-[#268bd2] text-white px-3 py-1.5 rounded text-[10px] font-bold border-b-2 border-[#1c6ca1] active:border-b-0 active:translate-y-0.5"
                                    >
                                        雇佣 (200 AP)
                                    </button>
                                </div>
                            ))}
                            {AVAILABLE_STAFF.every(s => state.shop.staff.find(exist => exist.name === s.name)) && !showCustomHire && (
                                <div className="text-center text-xs text-[#93a1a1] py-4">暂无更多候选人</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Goals (Original Logic) */}
            {tab === 'goals' && (
                <div className="space-y-4">
                    <button onClick={onAddGoal} className="w-full py-3 border-2 border-dashed border-[#93a1a1] text-[#93a1a1] rounded-xl font-bold hover:bg-[#eee8d5] transition-colors">+ 添加新目标</button>
                    {state.goals.map(g => (
                        <div key={g.id} className="bg-white p-4 rounded-xl border border-[#eee8d5] shadow-sm relative group">
                            <div className="flex justify-between mb-2">
                                <span className="font-bold text-[#586e75]">{g.name}</span>
                                <span className="font-mono text-[#b58900]">{state.config.currencySymbol}{g.targetAmount}</span>
                            </div>
                            <div className="h-2 bg-[#eee8d5] rounded-full overflow-hidden">
                                <div className="h-full bg-[#2aa198]" style={{ width: `${Math.min(100, (g.currentAmount/g.targetAmount)*100)}%` }}></div>
                            </div>
                            <button onClick={() => onDeleteGoal(g.id)} className="absolute top-2 right-2 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BankGameMenu;
