
import React, { useState, useEffect, useRef } from 'react';
import { BankShopState, CharacterProfile, UserProfile, APIConfig, ShopStaff } from '../../types';
import { SHOP_RECIPES } from './BankGameConstants';
import { ContextBuilder } from '../../utils/context';
import { useOS } from '../../context/OSContext';

interface Props {
    shopState: BankShopState;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: APIConfig;
    updateState: (s: BankShopState) => Promise<void>;
    onStaffClick?: (staff: ShopStaff) => void;
    onMoveStaff?: (x: number, y: number) => void;
    onOpenGuestbook: () => void;
}

const BankShopScene: React.FC<Props> = ({ 
    shopState, characters, userProfile, apiConfig, updateState, 
    onStaffClick, onMoveStaff, onOpenGuestbook
}) => {
    const { addToast } = useOS();
    const [visitor, setVisitor] = useState<{char: CharacterProfile, x: number, y: number, msg: string} | null>(null);
    const [isInviting, setIsInviting] = useState(false);
    const sceneRef = useRef<HTMLDivElement>(null);

    // Initialize Visitor from State
    useEffect(() => {
        if (shopState.activeVisitor) {
            const char = characters.find(c => c.id === shopState.activeVisitor!.charId);
            if (char) {
                setVisitor({
                    char,
                    x: 50, 
                    y: 60,
                    msg: shopState.activeVisitor.message
                });
            }
        } else {
            setVisitor(null);
        }
    }, [shopState.activeVisitor]);

    // Handle Stage Click (Movement)
    const handleStageClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;

        if (!sceneRef.current || !onMoveStaff) return;
        const rect = sceneRef.current.getBoundingClientRect();
        
        // Calculate percentages
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        // Floor constraint (Floor roughly starts at 40% in new design)
        const floorY = Math.max(40, Math.min(90, y)); 
        
        onMoveStaff(x, floorY);
    };

    // Handle Invite Logic
    const handleInvite = async () => {
        const COST = 30;
        if (shopState.actionPoints < COST) {
            addToast(`AP不足 (需${COST})`, 'error');
            return;
        }
        if (!apiConfig.apiKey) {
            addToast('请配置 API Key', 'error');
            return;
        }
        
        setIsInviting(true);
        try {
            const char = characters[Math.floor(Math.random() * characters.length)];
            const context = ContextBuilder.buildCoreContext(char, userProfile, true);
            
            const prompt = `${context}
### Scenario: Visiting a Café
User owns a digital Café called "${shopState.shopName}".
You (Character) are entering the shop as a customer.
Shop Appeal Level: ${shopState.appeal} (Higher means nicer shop).

### Task
Describe your entrance action and one comment about the shop or food.
Output JSON: { "action": "Looking around...", "comment": "Smells good here!" }
Language: Chinese.`;

            const res = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: 'user', content: prompt }] })
            });
            
            if (res.ok) {
                const data = await res.json();
                let jsonStr = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
                const result = JSON.parse(jsonStr);
                
                await updateState({
                    ...shopState,
                    actionPoints: shopState.actionPoints - COST,
                    activeVisitor: {
                        charId: char.id,
                        message: result.comment || "Coming in!",
                        timestamp: Date.now()
                    }
                });
                addToast(`${char.name} 进店了！`, 'success');
            }
        } catch (e) {
            console.error(e);
            addToast('邀请失败', 'error');
        } finally {
            setIsInviting(false);
        }
    };

    // Render Staff
    const renderStaff = () => {
        return shopState.staff.map((s, idx) => {
            let left = s.x || 0;
            let top = s.y || 0;

            if (!s.x) {
                const total = shopState.staff.length;
                const step = 60 / (total + 1); // Confine to center area
                left = step * (idx + 1) + 20;
                top = 65; 
            }
            
            return (
                <div 
                    key={s.id} 
                    className="absolute flex flex-col items-center group cursor-pointer transition-all duration-700 ease-in-out z-10"
                    style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -100%)', zIndex: Math.floor(top) }}
                    onClick={(e) => { e.stopPropagation(); onStaffClick && onStaffClick(s); }}
                >
                    {/* Shadow */}
                    <div className="absolute bottom-1 w-10 h-3 bg-black/10 rounded-full blur-[2px] transform scale-x-150"></div>

                    {/* Fatigue Bubble */}
                    {s.fatigue > 80 && <div className="absolute -top-8 text-xl animate-bounce z-20">💤</div>}
                    
                    {/* Sprite */}
                    <div className="text-5xl filter drop-shadow-lg transform group-hover:scale-110 transition-transform select-none relative z-10 origin-bottom">
                        {s.avatar.startsWith('http') || s.avatar.startsWith('data') ? <img src={s.avatar} className="w-14 h-14 object-contain" /> : s.avatar}
                    </div>
                    
                    {/* Name Tag */}
                    <div className="bg-white/90 px-2 py-0.5 rounded-full text-[9px] font-bold text-slate-600 mt-1 shadow-sm backdrop-blur-sm border border-slate-200 whitespace-nowrap transform -translate-y-1">
                        {s.name}
                    </div>
                    
                    {/* Tiny Status Bar */}
                    <div className="w-8 h-1 bg-slate-200 rounded-full mt-0.5 overflow-hidden border border-white">
                        <div className={`h-full ${s.fatigue > 80 ? 'bg-red-400' : 'bg-green-400'}`} style={{ width: `${100 - s.fatigue}%` }}></div>
                    </div>
                </div>
            );
        });
    };

    return (
        <div 
            ref={sceneRef}
            className="relative w-full h-[65vh] bg-[#fffaf0] overflow-hidden select-none cursor-pointer"
            onClick={handleStageClick}
        >
            {/* --- Room Architecture (CSS Art) --- */}

            {/* 1. Wall Background (Cream + Wanstocing) */}
            <div className="absolute inset-0 h-[50%] bg-[#fdf6e3]">
                {/* Wallpaper Pattern */}
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#d4c5b0 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
                {/* Wainscoting (Wood panels) */}
                <div className="absolute bottom-0 w-full h-[40%] bg-gradient-to-b from-[#e6dfc8] to-[#d3cbb8] border-t-4 border-[#c2b59b]">
                    <div className="w-full h-full flex justify-around opacity-30">
                        {[...Array(8)].map((_, i) => <div key={i} className="w-[1px] h-full bg-[#8d6e63] shadow-[1px_0_0_rgba(255,255,255,0.2)]"></div>)}
                    </div>
                </div>
                {/* Shop Sign on Wall */}
                <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-[#5d4037] text-[#fdf6e3] px-6 py-2 rounded-lg shadow-lg border-4 border-[#3e2723] flex flex-col items-center z-0">
                     <span className="text-[10px] uppercase tracking-[0.2em] text-[#a1887f]">Est. 2024</span>
                     <span className="font-serif font-bold text-lg leading-none">{shopState.shopName}</span>
                </div>
            </div>

            {/* 2. Floor (Herringbone Wood) */}
            <div className="absolute top-[50%] left-0 w-full h-[50%] bg-[#d7ccc8]" 
                 style={{ 
                     backgroundImage: `
                         linear-gradient(45deg, #a1887f 25%, transparent 25%, transparent 75%, #a1887f 75%, #a1887f),
                         linear-gradient(45deg, #a1887f 25%, transparent 25%, transparent 75%, #a1887f 75%, #a1887f)
                     `,
                     backgroundPosition: '0 0, 20px 20px',
                     backgroundSize: '40px 40px',
                     boxShadow: 'inset 0 10px 30px rgba(0,0,0,0.1)'
                 }}>
                 {/* Floor Reflection/Sheen */}
                 <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
            </div>

            {/* 3. The Counter (Marble Top + Wood Body) */}
            <div className="absolute top-[42%] left-[10%] w-[80%] h-24 z-5">
                {/* Counter Top (Marble) */}
                <div className="absolute -top-4 -left-2 w-[105%] h-6 bg-white rounded-md shadow-md border-b-4 border-slate-200 z-10"
                     style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/white-diamond-dark.png")', backgroundSize: '100px' }}
                ></div>
                {/* Counter Body (Wood) */}
                <div className="w-full h-full bg-[#5d4037] rounded-b-lg flex shadow-xl border-x-2 border-b-2 border-[#3e2723]">
                    {/* Decorative Panels */}
                    <div className="flex-1 border-r border-[#4e342e] shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]"></div>
                    <div className="flex-1 border-r border-[#4e342e] shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]"></div>
                    <div className="flex-1 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]"></div>
                </div>
                
                {/* Items on Counter */}
                <div className="absolute -top-12 w-full flex justify-around px-4 pointer-events-none">
                     {shopState.unlockedRecipes.slice(0, 4).map((rid, i) => {
                         const r = SHOP_RECIPES.find((item: any) => item.id === rid);
                         return r ? (
                             <div key={rid} className="flex flex-col items-center animate-fade-in" style={{ animationDelay: `${i*100}ms` }}>
                                 <div className="text-3xl filter drop-shadow-md transform hover:scale-110 transition-transform">{r.icon}</div>
                                 <div className="w-8 h-1 bg-black/20 rounded-full blur-[1px]"></div>
                             </div>
                         ) : null;
                     })}
                </div>
            </div>

            {/* 4. Windows & Lighting (Atmosphere) */}
            <div className="absolute top-8 left-[5%] text-6xl opacity-90 drop-shadow-md">🪟</div>
            <div className="absolute top-8 right-[5%] text-6xl opacity-90 drop-shadow-md">🪟</div>
            {/* Sunlight Beams */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none mix-blend-overlay z-20"
                 style={{ background: 'linear-gradient(120deg, rgba(255,255,255,0) 20%, rgba(255,255,210,0.15) 30%, rgba(255,255,255,0) 40%)' }}>
            </div>

            {/* 5. Decor (Plants) */}
            <div className="absolute bottom-[20%] left-[5%] text-6xl z-10 filter drop-shadow-xl pointer-events-none">🌿</div>
            <div className="absolute top-[35%] right-[15%] text-5xl z-0 opacity-80 pointer-events-none">🕰️</div>

            {/* --- Entities Layer --- */}
            {renderStaff()}

            {/* Visitor */}
            {visitor && (
                <div className="absolute bottom-[25%] left-1/2 -translate-x-1/2 flex flex-col items-center animate-fade-in z-30 pointer-events-none">
                    <div className="bg-white p-3 rounded-2xl rounded-bl-none shadow-xl text-xs font-medium text-slate-700 max-w-[140px] mb-2 border border-slate-100 animate-pop-in relative">
                        {visitor.msg}
                        <div className="absolute -bottom-1.5 left-2 w-3 h-3 bg-white transform rotate-45 border-b border-r border-slate-100"></div>
                    </div>
                    <img src={visitor.char.sprites?.chibi || visitor.char.avatar} className="w-24 h-24 object-contain drop-shadow-2xl" />
                    <div className="bg-black/30 px-3 py-0.5 rounded-full text-[10px] text-white mt-1 backdrop-blur font-bold border border-white/20 shadow-sm">{visitor.char.name}</div>
                </div>
            )}

            {/* --- UI Layer (HUD) --- */}

            {/* TOP RIGHT: Guestbook (Moved & Redesigned) */}
            <button 
                onClick={(e) => { e.stopPropagation(); onOpenGuestbook(); }}
                className="absolute top-4 right-4 z-40 group hover:scale-105 active:scale-95 transition-transform origin-top-right"
            >
                <div className="relative">
                    {/* Hanging String */}
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-[#8d6e63]"></div>
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#5d4037] shadow-sm"></div>
                    
                    {/* Board */}
                    <div className="bg-[#5d4037] text-[#fdf6e3] w-14 h-16 rounded-lg shadow-xl border-2 border-[#3e2723] flex flex-col items-center justify-center gap-1 relative overflow-hidden">
                        <div className="text-2xl filter drop-shadow-sm">📖</div>
                        <div className="text-[8px] font-bold uppercase tracking-wide opacity-80">Gossip</div>
                        
                        {/* Notification Dot */}
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-[#5d4037] animate-pulse"></div>
                    </div>
                </div>
            </button>

            {/* TOP LEFT: Appeal Score */}
            <div className="absolute top-4 left-4 z-40">
                <div className="bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/50 text-xs font-bold text-slate-700 shadow-sm flex items-center gap-1.5">
                    <span className="text-yellow-500 text-sm">✨</span>
                    <span>人气值: {shopState.appeal}</span>
                </div>
            </div>

            {/* BOTTOM RIGHT: Actions */}
            <div className="absolute bottom-6 right-6 z-40">
                <button 
                    onClick={(e) => { e.stopPropagation(); handleInvite(); }} 
                    disabled={isInviting}
                    className="h-14 w-14 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 active:scale-90 transition-all hover:shadow-indigo-500/30"
                >
                    {isInviting ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <span className="text-2xl filter drop-shadow-md">🛎️</span>
                    )}
                </button>
            </div>

        </div>
    );
};

export default BankShopScene;
