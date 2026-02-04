
import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { BankFullState, BankTransaction, SavingsGoal, ShopStaff, BankGuestbookItem } from '../types';
import Modal from '../components/os/Modal';
import BankShopScene from '../components/bank/BankShopScene';
import BankGameMenu from '../components/bank/BankGameMenu';
import BankAnalytics from '../components/bank/BankAnalytics';
import { SHOP_RECIPES } from '../components/bank/BankGameConstants';
import { processImage } from '../utils/file';
import { ContextBuilder } from '../utils/context';

const INITIAL_STATE: BankFullState = {
    config: {
        dailyBudget: 100,
        currencySymbol: '¥', 
    },
    shop: {
        actionPoints: 100,
        shopName: '梦想咖啡馆',
        shopLevel: 1,
        appeal: 100,
        background: 'https://sharkpan.xyz/f/5n1gSj/bg.png', 
        staff: [
            { 
                id: 'staff-001', 
                name: '橘猫店长', 
                avatar: '🐱', 
                role: 'manager', 
                fatigue: 0, 
                maxFatigue: 100, 
                hireDate: Date.now(),
                x: 50,
                y: 50,
                personality: '懒洋洋的，喜欢吃小鱼干'
            }
        ],
        unlockedRecipes: ['recipe-coffee-001'],
        activeVisitor: undefined,
        guestbook: [] // New
    },
    goals: [],
    todaySpent: 0,
    lastLoginDate: new Date().toISOString().split('T')[0],
};

const BankApp: React.FC = () => {
    const { closeApp, characters, addToast, apiConfig, userProfile } = useOS();
    const [state, setState] = useState<BankFullState>(INITIAL_STATE);
    const [transactions, setTransactions] = useState<BankTransaction[]>([]);
    
    // Tabs: 'game' (Shop) | 'manage' (Menu) | 'report' (Finance)
    const [activeTab, setActiveTab] = useState<'game' | 'manage' | 'report'>('game');
    
    // UI Modals
    const [showAddTxModal, setShowAddTxModal] = useState(false);
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showStaffEdit, setShowStaffEdit] = useState(false);
    
    // Guestbook Fullscreen State (Changed from Modal)
    const [showGuestbook, setShowGuestbook] = useState(false);
    
    // Forms
    const [txAmount, setTxAmount] = useState('');
    const [txNote, setTxNote] = useState('');
    const [goalName, setGoalName] = useState('');
    const [goalTarget, setGoalTarget] = useState('');

    // Staff Edit Form
    const [editingStaff, setEditingStaff] = useState<ShopStaff | null>(null);
    const staffImageInputRef = useRef<HTMLInputElement>(null);

    // Guestbook Processing
    const [isRefreshingGuestbook, setIsRefreshingGuestbook] = useState(false);

    // Load Data
    useEffect(() => {
        loadData();
    }, []);

    // Calculate Appeal dynamically
    const calculateAppeal = (staffCount: number, unlockedIds: string[]) => {
        const staffAppeal = staffCount * 50;
        const recipeAppeal = unlockedIds.reduce((sum, id) => {
            const r = SHOP_RECIPES.find(r => r.id === id);
            return sum + (r ? r.appeal : 0);
        }, 0);
        return 100 + staffAppeal + recipeAppeal;
    };

    const loadData = async () => {
        const savedState = await DB.getBankState();
        const txs = await DB.getAllTransactions();
        
        let currentState = savedState || INITIAL_STATE;
        
        // Migration: Ensure Shop structure exists
        if (!currentState.shop) {
            currentState = { ...currentState, shop: INITIAL_STATE.shop };
            if ((currentState as any).pet?.actionPoints) {
                currentState.shop.actionPoints = (currentState as any).pet.actionPoints;
            }
        }
        if (!currentState.shop.guestbook) {
            currentState.shop.guestbook = [];
        }

        // DAILY RESET LOGIC
        const today = new Date().toISOString().split('T')[0];
        
        if (currentState.lastLoginDate !== today) {
            // Find yesterday's expenses to calculate AP
            const yesterdayDate = new Date();
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
            
            const yesterTx = txs.filter(t => t.dateStr === yesterdayStr);
            let gainedAP = 0;

            if (yesterTx.length > 0) {
                const yesterSpent = yesterTx.reduce((sum, t) => sum + t.amount, 0);
                // Core Mechanic: AP = Budget - Spent
                gainedAP = Math.max(0, Math.floor(currentState.config.dailyBudget - yesterSpent));
            } else {
                // Punishment: If no record, minimal AP or zero? 
                // Let's implement logic: If no record, 0 AP from savings.
                gainedAP = 0; 
            }

            // Daily Login Bonus
            const dailyBonus = 10;
            const totalNewAP = gainedAP + dailyBonus;

            // Recover Fatigue
            const updatedStaff = currentState.shop.staff.map(s => ({
                ...s,
                fatigue: Math.max(0, s.fatigue - 30)
            }));

            currentState = {
                ...currentState,
                todaySpent: 0, 
                lastLoginDate: today,
                shop: {
                    ...currentState.shop,
                    actionPoints: (currentState.shop.actionPoints || 0) + totalNewAP,
                    staff: updatedStaff,
                    activeVisitor: undefined
                }
            };
            
            await DB.saveBankState(currentState);
            addToast(`新的一天！获得 ${totalNewAP} AP (预算结余: ${gainedAP})`, 'success');
        }

        const todayTx = txs.filter(t => t.dateStr === today);
        const spent = todayTx.reduce((sum, t) => sum + t.amount, 0);
        const appeal = calculateAppeal(currentState.shop.staff.length, currentState.shop.unlockedRecipes);
        
        setState({ ...currentState, todaySpent: spent, shop: { ...currentState.shop, appeal } });
        setTransactions(txs.sort((a,b) => b.timestamp - a.timestamp));
        
        // Show tutorial if first time (default budget is 100 and ap is 100 initial)
        if (!savedState) setShowTutorial(true);
    };

    // --- Transactions ---

    const handleAddTransaction = async () => {
        if (!txAmount || isNaN(parseFloat(txAmount)) || !txNote.trim()) {
            addToast('请填写金额和内容哦', 'error');
            return;
        }
        
        const amount = parseFloat(txAmount);
        const today = new Date().toISOString().split('T')[0];
        
        const newTx: BankTransaction = {
            id: `tx-${Date.now()}`,
            amount,
            category: 'general',
            note: txNote,
            timestamp: Date.now(),
            dateStr: today
        };
        
        await DB.saveTransaction(newTx);
        
        const newSpent = state.todaySpent + amount;
        const newState = { ...state, todaySpent: newSpent };
        await DB.saveBankState(newState);
        
        setTransactions(prev => [newTx, ...prev]);
        setState(newState);
        
        setShowAddTxModal(false);
        setTxAmount('');
        setTxNote('');
        
        if (newSpent > state.config.dailyBudget) {
            addToast('⚠️ 警报：今日预算已超支！明天可能没有 AP 了...', 'info');
        } else {
            addToast('记账成功', 'success');
        }
    };

    const handleDeleteTransaction = async (id: string) => {
        const tx = transactions.find(t => t.id === id);
        if (!tx) return;
        await DB.deleteTransaction(id);
        
        let newSpent = state.todaySpent;
        const today = new Date().toISOString().split('T')[0];
        if (tx.dateStr === today) {
            newSpent = Math.max(0, state.todaySpent - tx.amount);
        }

        const newState = { ...state, todaySpent: newSpent };
        await DB.saveBankState(newState);
        setTransactions(prev => prev.filter(t => t.id !== id));
        setState(newState);
        addToast('记录已删除', 'success');
    };

    // --- Game Logic ---

    const consumeAP = (cost: number): boolean => {
        if (state.shop.actionPoints < cost) {
            addToast(`AP 不足 (需 ${cost})。去省钱吧！`, 'error');
            return false;
        }
        const newAP = state.shop.actionPoints - cost;
        const newState = { ...state, shop: { ...state.shop, actionPoints: newAP } };
        setState(newState);
        DB.saveBankState(newState);
        return true;
    };

    const handleStaffRest = async (staffId: string) => {
        const COST = 20;
        if (!consumeAP(COST)) return;

        const updatedStaff = state.shop.staff.map(s => 
            s.id === staffId ? { ...s, fatigue: Math.max(0, s.fatigue - 50) } : s
        );
        
        const newState = { ...state, shop: { ...state.shop, staff: updatedStaff, actionPoints: state.shop.actionPoints - COST } };
        await DB.saveBankState(newState);
        setState(newState);
        addToast('店员休息好了！', 'success');
    };

    const handleUnlockRecipe = async (recipeId: string, cost: number) => {
        if (!consumeAP(cost)) return;
        
        const newUnlocked = [...state.shop.unlockedRecipes, recipeId];
        const newAppeal = calculateAppeal(state.shop.staff.length, newUnlocked);
        
        const newState = { 
            ...state, 
            shop: { 
                ...state.shop, 
                unlockedRecipes: newUnlocked,
                appeal: newAppeal,
                actionPoints: state.shop.actionPoints - cost
            } 
        };
        await DB.saveBankState(newState);
        setState(newState);
        addToast('新甜品解锁！店铺人气上升', 'success');
    };

    const handleHireStaff = async (newStaff: ShopStaff, cost: number) => {
        if (!consumeAP(cost)) return;
        
        // Add random slight offset for new staff to not overlap perfectly
        const randomX = 20 + Math.random() * 60;
        const staffWithPos = { ...newStaff, x: randomX, y: 50 };

        const updatedStaff = [...state.shop.staff, staffWithPos];
        const newAppeal = calculateAppeal(updatedStaff.length, state.shop.unlockedRecipes);

        const newState = {
            ...state,
            shop: {
                ...state.shop,
                staff: updatedStaff,
                appeal: newAppeal,
                actionPoints: state.shop.actionPoints - cost
            }
        };
        await DB.saveBankState(newState);
        setState(newState);
        addToast('新店员入职！', 'success');
    };

    // --- Guestbook Logic (Gossip & Drama) ---
    const handleRefreshGuestbook = async () => {
        const COST = 40;
        if (!consumeAP(COST)) return;
        if (!apiConfig.apiKey) { addToast('需配置 API Key', 'error'); return; }

        setIsRefreshingGuestbook(true);
        try {
            // 1. Pick a random Char (Try to avoid last visitor if possible)
            const availableChars = characters.filter(c => c.id !== state.shop.activeVisitor?.charId);
            const pool = availableChars.length > 0 ? availableChars : characters;
            if (pool.length === 0) { addToast('没有可用角色', 'error'); return; }
            const randomChar = pool[Math.floor(Math.random() * pool.length)];

            // 2. Build Context
            const charContext = ContextBuilder.buildCoreContext(randomChar, userProfile, true);
            const recentMsgs = await DB.getMessagesByCharId(randomChar.id);
            const chatSnippet = recentMsgs.slice(-10).map(m => m.content.substring(0, 50)).join(' | ');

            const previousGuestbook = (state.shop.guestbook || []).slice(0, 10).map(g => `${g.authorName}: ${g.content}`).join('\n');

            // 3. Prompt
            const prompt = `${charContext}
### Scenario: Savings App Cafe Guestbook
You are visiting the user's "Savings App Cafe" via your phone.
Cafe Name: "${state.shop.shopName}".
Recent Chat Context: ${chatSnippet}

### Task
Generate a guestbook page update.
1. **${randomChar.name}**: Write a guestbook message. React to the cafe or start drama. (Use your personality).
2. **NPCs**: Generate 3-4 other random messages from strangers or staff.
   - **Themes**: Gossip (e.g. staff fighting), Argument (e.g. arguing about food), Heartwarming story, or Continuing previous drama.
   - **Style**: Internet slang, funny, emotional, or chaotic ("乐子人").
   - **Continuity**: If previous guestbook entries show an argument, continue it!

Previous Guestbook:
${previousGuestbook}

### Output JSON Format
[
  { "authorName": "${randomChar.name}", "content": "...", "isChar": true },
  { "authorName": "AngryCustomer", "content": "...", "isChar": false },
  ...
]
`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: 'user', content: prompt }] })
            });

            if (response.ok) {
                const data = await response.json();
                let jsonStr = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
                const result = JSON.parse(jsonStr);

                const newEntries: BankGuestbookItem[] = result.map((item: any) => ({
                    id: `gb-${Date.now()}-${Math.random()}`,
                    authorName: item.authorName,
                    content: item.content,
                    isChar: item.isChar,
                    charId: item.isChar ? randomChar.id : undefined,
                    avatar: item.isChar ? randomChar.avatar : undefined,
                    timestamp: Date.now()
                }));

                // Update State: 
                // 1. Add new entries to guestbook (prepend)
                // 2. Set Active Visitor to the Char who posted
                const newState = {
                    ...state,
                    shop: {
                        ...state.shop,
                        actionPoints: state.shop.actionPoints - COST,
                        guestbook: [...newEntries, ...(state.shop.guestbook || [])].slice(0, 50), // Keep last 50
                        activeVisitor: {
                            charId: randomChar.id,
                            message: newEntries.find(e => e.isChar)?.content || "来逛逛~",
                            timestamp: Date.now()
                        }
                    }
                };

                await DB.saveBankState(newState);
                setState(newState);
                addToast('留言板已刷新，新客人到了！', 'success');
            } else {
                throw new Error('API Error');
            }

        } catch (e: any) {
            console.error(e);
            addToast('刷新失败: ' + e.message, 'error');
        } finally {
            setIsRefreshingGuestbook(false);
        }
    };

    // --- Staff Editing & Movement ---

    const handleOpenStaffEdit = (staff: ShopStaff) => {
        setEditingStaff(staff);
        setShowStaffEdit(true);
    };

    const handleSaveStaff = async () => {
        if (!editingStaff) return;
        const updatedStaffList = state.shop.staff.map(s => s.id === editingStaff.id ? editingStaff : s);
        const newState = { ...state, shop: { ...state.shop, staff: updatedStaffList } };
        await DB.saveBankState(newState);
        setState(newState);
        setShowStaffEdit(false);
        setEditingStaff(null);
        addToast('员工信息已更新', 'success');
    };

    const handleStaffImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && editingStaff) {
            try {
                const base64 = await processImage(file);
                setEditingStaff({ ...editingStaff, avatar: base64 });
            } catch (err: any) {
                addToast('图片上传失败', 'error');
            }
        }
    };

    const handleMoveStaff = async (x: number, y: number) => {
        // Move the Manager (index 0) or currently selected staff? 
        // Let's assume Manager (Store Owner) for interactivity on the floor.
        const manager = state.shop.staff[0];
        if (!manager) return;

        const updatedManager = { ...manager, x, y };
        const updatedStaffList = [updatedManager, ...state.shop.staff.slice(1)];
        
        const newState = { ...state, shop: { ...state.shop, staff: updatedStaffList } };
        await DB.saveBankState(newState); // Auto-save pos? Maybe throttle this in real app
        setState(newState);
    };

    const handleConfigUpdate = async (updates: Partial<typeof state.config>) => {
        const newState = { ...state, config: { ...state.config, ...updates } };
        await DB.saveBankState(newState);
        setState(newState);
        addToast('设置已保存', 'success');
    };

    // --- Goals ---
    const handleAddGoal = async () => {
        if (!goalName || !goalTarget) return;
        const newGoal: SavingsGoal = {
            id: `goal-${Date.now()}`,
            name: goalName,
            targetAmount: parseFloat(goalTarget),
            currentAmount: 0,
            icon: '🎁',
            isCompleted: false
        };
        const newState = { ...state, goals: [...state.goals, newGoal] };
        await DB.saveBankState(newState);
        setState(newState);
        setShowGoalModal(false);
        setGoalName('');
        setGoalTarget('');
        addToast('心愿已添加', 'success');
    };

    return (
        <div className="h-full w-full bg-[#fdf6e3] flex flex-col font-sans text-slate-700 relative overflow-hidden">
            
            {/* Header - Adjusted Padding for Safe Area */}
            <div className="pt-[calc(env(safe-area-inset-top)+1rem)] pb-2 flex items-center justify-between px-4 bg-[#eee8d5] border-b-2 border-[#d3cbb8] sticky top-0 z-20 shrink-0 shadow-sm min-h-[4rem]">
                <div className="flex items-center gap-2">
                    <button onClick={closeApp} className="p-1.5 bg-[#fdf6e3] rounded border border-[#d3cbb8] text-[#586e75] active:translate-y-0.5 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div className="flex flex-col leading-none">
                        <span className="font-bold text-xs text-[#657b83] uppercase tracking-wider">Coffee Tycoon</span>
                        <span className="font-black text-sm text-[#b58900]">AP: {state.shop.actionPoints}</span>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={() => setShowTutorial(true)} className="w-7 h-7 rounded-full bg-[#fdf6e3] text-[#93a1a1] flex items-center justify-center border border-[#d3cbb8] text-xs font-bold">?</button>
                    <button onClick={() => setShowAddTxModal(true)} className="flex items-center gap-1 bg-[#859900] text-white px-3 py-1 rounded border-b-2 border-[#5f6e00] active:border-b-0 active:translate-y-0.5 transition-all text-xs font-bold shadow-sm">
                        <span>+</span> 记账
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative z-10 flex flex-col">
                
                {/* 1. Game View (Shop Scene) */}
                {activeTab === 'game' && (
                    <BankShopScene 
                        shopState={state.shop} 
                        characters={characters}
                        userProfile={userProfile}
                        apiConfig={apiConfig}
                        updateState={async (newShopState) => {
                            const newState = { ...state, shop: newShopState };
                            await DB.saveBankState(newState);
                            setState(newState);
                        }}
                        onStaffClick={handleOpenStaffEdit}
                        onMoveStaff={handleMoveStaff}
                        onOpenGuestbook={() => setShowGuestbook(true)}
                    />
                )}

                {/* 2. Management Menu */}
                {activeTab === 'manage' && (
                    <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                        {/* Budget Config at Top */}
                        <div className="bg-[#fdf6e3] p-4 rounded-xl border-2 border-[#d3cbb8] mb-4 flex justify-between items-center shadow-sm">
                            <div>
                                <h3 className="text-sm font-bold text-[#586e75]">每日预算设定</h3>
                                <p className="text-[10px] text-[#93a1a1]">省下的钱 = 明天的 AP</p>
                            </div>
                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                <span className="text-xs text-slate-400">{state.config.currencySymbol}</span>
                                <input 
                                    type="number" 
                                    value={state.config.dailyBudget} 
                                    onChange={(e) => handleConfigUpdate({ dailyBudget: parseFloat(e.target.value) })}
                                    className="w-16 text-right bg-transparent border-none text-lg font-bold text-[#b58900] outline-none p-0"
                                />
                            </div>
                        </div>

                        <BankGameMenu 
                            state={state}
                            onUnlockRecipe={handleUnlockRecipe}
                            onHireStaff={handleHireStaff}
                            onStaffRest={handleStaffRest}
                            onUpdateConfig={handleConfigUpdate}
                            onAddGoal={handleAddGoal}
                            onDeleteGoal={(id) => {
                                const newGoals = state.goals.filter(g => g.id !== id);
                                const newState = { ...state, goals: newGoals };
                                DB.saveBankState(newState);
                                setState(newState);
                            }}
                            onEditStaff={handleOpenStaffEdit}
                        />
                    </div>
                )}

                {/* 3. Analytics Report */}
                {activeTab === 'report' && (
                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        <BankAnalytics 
                            transactions={transactions}
                            goals={state.goals}
                            currency={state.config.currencySymbol}
                            onDeleteTx={handleDeleteTransaction}
                        />
                    </div>
                )}
            </div>

            {/* Guestbook Overlay (Replaces Modal) */}
            {showGuestbook && (
                <div className="absolute inset-0 z-50 bg-[#fdf6e3] flex flex-col animate-slide-up font-serif">
                    {/* Header */}
                    <div className="pt-[calc(env(safe-area-inset-top)+1rem)] pb-2 flex items-center justify-between px-5 border-b-2 border-[#d3cbb8] bg-[#eee8d5] shrink-0 shadow-sm min-h-[4rem]">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">📜</span>
                            <div>
                                <h2 className="text-lg font-bold text-[#586e75] tracking-widest">店铺情报志</h2>
                                <p className="text-[10px] text-[#93a1a1] uppercase">Gossip & Rumors</p>
                            </div>
                        </div>
                        <button onClick={() => setShowGuestbook(false)} className="w-8 h-8 rounded-full bg-[#fdf6e3] border-2 border-[#d3cbb8] text-[#93a1a1] flex items-center justify-center font-bold active:scale-90 transition-transform">×</button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-6" style={{ backgroundImage: 'radial-gradient(#d3cbb8 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                        
                        {/* Refresh Action Area */}
                        <div className="bg-white p-4 rounded-xl border-2 border-dashed border-[#d3cbb8] flex items-center justify-between shadow-sm">
                            <div className="flex-1">
                                <h3 className="font-bold text-[#b58900] text-sm">打听消息</h3>
                                <p className="text-[10px] text-[#93a1a1] leading-tight mt-1">消耗 AP 让大家聊聊最近的八卦。</p>
                            </div>
                            <button 
                                onClick={handleRefreshGuestbook}
                                disabled={isRefreshingGuestbook}
                                className={`px-4 py-2 rounded-lg font-bold text-xs shadow-md border-b-4 active:border-b-0 active:translate-y-1 transition-all ${isRefreshingGuestbook ? 'bg-slate-200 text-slate-400 border-slate-300' : 'bg-[#268bd2] text-white border-[#1c6ca1] hover:bg-[#2aa198] hover:border-[#1f7a73]'}`}
                            >
                                {isRefreshingGuestbook ? '偷听中...' : '刷新情报 (-40 AP)'}
                            </button>
                        </div>

                        {(!state.shop.guestbook || state.shop.guestbook.length === 0) ? (
                            <div className="text-center py-20 opacity-50 grayscale">
                                <div className="text-6xl mb-4">🍃</div>
                                <p className="text-sm font-bold text-[#93a1a1]">风中什么声音都没有...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {state.shop.guestbook.map((msg, idx) => (
                                    <div key={msg.id} className={`relative p-4 ${msg.isChar ? 'bg-white border-l-4 border-l-[#2aa198] shadow-md' : 'bg-[#fdf6e3] border border-[#d3cbb8] shadow-sm'} rounded-r-xl group animate-fade-in`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                {msg.isChar && <span className="text-lg">⭐</span>}
                                                <span className={`font-bold text-sm ${msg.isChar ? 'text-[#2aa198]' : 'text-[#b58900]'}`}>{msg.authorName}</span>
                                                <span className="text-[9px] text-[#93a1a1] bg-[#eee8d5] px-1.5 py-0.5 rounded">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            <div className="text-xl opacity-20 group-hover:opacity-100 transition-opacity select-none cursor-default">
                                                {idx % 2 === 0 ? '📌' : '📎'}
                                            </div>
                                        </div>
                                        <p className="text-sm text-[#657b83] leading-relaxed font-medium whitespace-pre-wrap">
                                            {msg.content}
                                        </p>
                                        {msg.isChar && (
                                            <div className="mt-3 flex gap-2">
                                                <span className="text-[9px] text-white bg-[#2aa198] px-2 py-0.5 rounded-full">重要人物</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div className="text-center py-4 text-[10px] text-[#93a1a1]">—— 到底了 ——</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom Nav */}
            <div className="h-16 bg-[#eee8d5] border-t-2 border-[#d3cbb8] flex items-stretch shrink-0 z-30 pb-safe">
                <button 
                    onClick={() => setActiveTab('game')}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'game' ? 'bg-[#fdf6e3] border-t-4 border-[#2aa198] -mt-[2px]' : 'text-[#93a1a1] hover:bg-[#e6dfc8]'}`}
                >
                    <span className="text-xl">☕</span>
                    <span className="text-[9px] font-bold tracking-wider">店铺</span>
                </button>
                <div className="w-[1px] bg-[#d3cbb8] my-3"></div>
                <button 
                    onClick={() => setActiveTab('manage')}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'manage' ? 'bg-[#fdf6e3] border-t-4 border-[#cb4b16] -mt-[2px]' : 'text-[#93a1a1] hover:bg-[#e6dfc8]'}`}
                >
                    <span className="text-xl">📋</span>
                    <span className="text-[9px] font-bold tracking-wider">经营</span>
                </button>
                <div className="w-[1px] bg-[#d3cbb8] my-3"></div>
                <button 
                    onClick={() => setActiveTab('report')}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'report' ? 'bg-[#fdf6e3] border-t-4 border-[#6c71c4] -mt-[2px]' : 'text-[#93a1a1] hover:bg-[#e6dfc8]'}`}
                >
                    <span className="text-xl">📉</span>
                    <span className="text-[9px] font-bold tracking-wider">账本</span>
                </button>
            </div>

            {/* Modals */}
            <Modal isOpen={showAddTxModal} title="记一笔" onClose={() => setShowAddTxModal(false)} footer={<button onClick={handleAddTransaction} className="w-full py-3 bg-[#859900] text-white font-bold rounded-xl border-b-4 border-[#5f6e00] active:border-b-0 active:translate-y-1 transition-all">确认入账</button>}>
                <div className="space-y-4 font-mono">
                    <div>
                        <label className="text-xs font-bold text-[#93a1a1] uppercase">Amount</label>
                        <input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} className="w-full bg-[#fdf6e3] border-2 border-[#d3cbb8] rounded-xl px-4 py-3 text-xl font-bold text-[#586e75] focus:border-[#2aa198] outline-none" placeholder="0.00" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[#93a1a1] uppercase">Note</label>
                        <input value={txNote} onChange={e => setTxNote(e.target.value)} className="w-full bg-[#fdf6e3] border-2 border-[#d3cbb8] rounded-xl px-4 py-3 text-sm font-bold text-[#586e75] focus:border-[#2aa198] outline-none" placeholder="买什么了？" />
                    </div>
                </div>
            </Modal>

            <Modal isOpen={showGoalModal} title="新目标" onClose={() => setShowGoalModal(false)} footer={<button onClick={handleAddGoal} className="w-full py-3 bg-[#268bd2] text-white font-bold rounded-xl border-b-4 border-[#1c6ca1] active:border-b-0 active:translate-y-1 transition-all">添加</button>}>
                <div className="space-y-4 font-mono">
                    <input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="目标名称 (如: Switch)" className="w-full bg-[#fdf6e3] border-2 border-[#d3cbb8] rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                    <input type="number" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} placeholder="目标金额" className="w-full bg-[#fdf6e3] border-2 border-[#d3cbb8] rounded-xl px-4 py-3 text-lg font-bold outline-none" />
                </div>
            </Modal>

            {/* Staff Edit Modal */}
            <Modal isOpen={showStaffEdit} title="员工档案" onClose={() => { setShowStaffEdit(false); setEditingStaff(null); }} footer={<button onClick={handleSaveStaff} className="w-full py-3 bg-[#268bd2] text-white font-bold rounded-xl shadow-md">保存修改</button>}>
                {editingStaff && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-xl bg-white border-2 border-[#eee8d5] flex items-center justify-center text-4xl relative overflow-hidden group cursor-pointer" onClick={() => staffImageInputRef.current?.click()}>
                                {editingStaff.avatar.startsWith('http') || editingStaff.avatar.startsWith('data') ? <img src={editingStaff.avatar} className="w-full h-full object-cover" /> : editingStaff.avatar}
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold">更换</div>
                                <input type="file" ref={staffImageInputRef} className="hidden" accept="image/*" onChange={handleStaffImageUpload} />
                            </div>
                            <div className="flex-1 space-y-2">
                                <input value={editingStaff.name} onChange={e => setEditingStaff({...editingStaff, name: e.target.value})} className="w-full font-bold text-lg bg-transparent border-b-2 border-[#eee8d5] focus:border-[#268bd2] outline-none text-[#586e75]" placeholder="姓名" />
                                <div className="text-xs text-[#93a1a1] uppercase font-bold">{editingStaff.role}</div>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[#93a1a1] uppercase mb-1 block">性格 / 备注</label>
                            <input value={editingStaff.personality || ''} onChange={e => setEditingStaff({...editingStaff, personality: e.target.value})} className="w-full bg-[#fdf6e3] border border-[#d3cbb8] rounded-xl px-3 py-2 text-sm text-[#586e75] outline-none" placeholder="懒洋洋的..." />
                        </div>
                    </div>
                )}
            </Modal>

            {/* Help/Tutorial Modal */}
            <Modal isOpen={showTutorial} title="玩法说明" onClose={() => setShowTutorial(false)}>
                <div className="space-y-4 text-[#586e75] text-sm leading-relaxed p-2">
                    <div className="flex gap-3">
                        <div className="text-2xl">💰</div>
                        <div>
                            <div className="font-bold mb-1">省钱 = 能量 (AP)</div>
                            <p className="text-xs opacity-80">设定每日预算。如果这天花得比预算少，结余的钱就会变成第二天的行动点数 (AP)。</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <div className="text-2xl">☕</div>
                        <div>
                            <div className="font-bold mb-1">经营店铺</div>
                            <p className="text-xs opacity-80">消耗 AP 来解锁食谱、雇佣员工、举办活动。店铺越高级，吸引的访客越多。</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <div className="text-2xl">👆</div>
                        <div>
                            <div className="font-bold mb-1">互动操作</div>
                            <p className="text-xs opacity-80">• 点击前台的留言簿可查看和刷新八卦。<br/>• 点击地板可以让店长走过去。<br/>• 点击“招揽客人”按钮可消耗 AP 邀请角色进店。</p>
                        </div>
                    </div>
                </div>
            </Modal>

        </div>
    );
};

export default BankApp;
