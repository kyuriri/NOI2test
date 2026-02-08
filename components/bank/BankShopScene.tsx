
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BankShopState, CharacterProfile, UserProfile, APIConfig, ShopStaff, ShopRoom, ShopRoomSticker } from '../../types';
import { SHOP_RECIPES, WALLPAPER_PRESETS, FLOOR_PRESETS, DECO_STICKERS, ROOM_UNLOCK_COST } from './BankGameConstants';
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
    onUnlockRoom?: (roomId: string) => void;
    onUpdateRoom?: (room: ShopRoom) => void;
}

// Get rooms for the current floor plan
const getCurrentRooms = (shopState: BankShopState): ShopRoom[] => {
    const planId = shopState.activeFloorPlanId || 'plan-standard';
    return shopState.allRoomStates?.[planId] || [];
};

// Get room bounds in global % coordinates within the dollhouse content area
const getRoomBounds = (room: ShopRoom, allRooms: ShopRoom[]) => {
    const isTop = room.layer === 2;
    const yStart = isTop ? 0 : 50;
    const yEnd = isTop ? 50 : 100;

    let xStart = 0;
    let xEnd = 100;
    if (room.position === 'left') {
        xStart = 0;
        xEnd = 50;
    } else if (room.position === 'right') {
        xStart = 50;
        xEnd = 100;
    }

    return { xStart, xEnd, yStart, yEnd };
};

const BankShopScene: React.FC<Props> = ({
    shopState, characters, userProfile, apiConfig, updateState,
    onStaffClick, onMoveStaff, onOpenGuestbook, onUnlockRoom, onUpdateRoom
}) => {
    const { addToast, pushSystemMessage } = useOS();
    const [visitor, setVisitor] = useState<{char: CharacterProfile, x: number, y: number, msg: string, foundPet?: boolean} | null>(null);
    const [isInviting, setIsInviting] = useState(false);
    const [showLoveEffect, setShowLoveEffect] = useState(false);
    const sceneRef = useRef<HTMLDivElement>(null);

    // Dollhouse state
    const [zoomedRoomId, setZoomedRoomId] = useState<string | null>(null);
    const [customizeTab, setCustomizeTab] = useState<'wallpaper' | 'floor' | 'stickers' | null>(null);
    const [placingSticker, setPlacingSticker] = useState<string | null>(null);

    const rooms = getCurrentRooms(shopState);
    const zoomedRoom = zoomedRoomId ? rooms.find(r => r.id === zoomedRoomId) : null;

    // Check if visitor has a pet working here
    const getVisitorPet = (charId: string) => {
        return shopState.staff.find(s => s.isPet && s.ownerCharId === charId);
    };

    // Initialize Visitor from State
    useEffect(() => {
        if (shopState.activeVisitor) {
            const char = characters.find(c => c.id === shopState.activeVisitor!.charId);
            if (char) {
                setVisitor({ char, x: 50, y: 60, msg: shopState.activeVisitor.message });
            }
        } else {
            setVisitor(null);
        }
    }, [shopState.activeVisitor]);

    // Handle double-click to zoom into room
    const handleRoomDoubleClick = (roomId: string) => {
        const room = rooms.find(r => r.id === roomId);
        if (!room) return;
        if (!room.unlocked) {
            // Prompt unlock
            if (onUnlockRoom) onUnlockRoom(roomId);
            return;
        }
        setZoomedRoomId(roomId);
        setCustomizeTab(null);
        setPlacingSticker(null);
    };

    // Handle click on locked room (single click)
    const handleLockedRoomClick = (roomId: string) => {
        if (onUnlockRoom) onUnlockRoom(roomId);
    };

    // Handle zoom out
    const handleZoomOut = () => {
        setZoomedRoomId(null);
        setCustomizeTab(null);
        setPlacingSticker(null);
    };

    // Handle floor click for staff movement
    const handleFloorClick = (e: React.MouseEvent, room: ShopRoom) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (!room.unlocked || !onMoveStaff) return;
        if (placingSticker) return; // Don't move staff when placing stickers

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        // Convert to global coordinates based on room bounds
        const bounds = getRoomBounds(room, rooms);
        const globalX = bounds.xStart + (x / 100) * (bounds.xEnd - bounds.xStart);
        const globalY = bounds.yStart + (y / 100) * (bounds.yEnd - bounds.yStart);

        // Constrain to floor area (bottom 30% of room)
        const floorGlobalY = Math.max(
            bounds.yStart + (bounds.yEnd - bounds.yStart) * 0.55,
            Math.min(bounds.yEnd - 2, globalY)
        );

        onMoveStaff(globalX, floorGlobalY);
    };

    // Handle sticker placement click
    const handleStickerPlace = (e: React.MouseEvent, room: ShopRoom) => {
        if (!placingSticker || !onUpdateRoom) return;
        e.stopPropagation();

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const newSticker: ShopRoomSticker = {
            id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            content: placingSticker,
            x: Math.max(5, Math.min(95, x)),
            y: Math.max(5, Math.min(95, y)),
            scale: 1
        };

        onUpdateRoom({
            ...room,
            stickers: [...room.stickers, newSticker]
        });
        setPlacingSticker(null);
    };

    // Remove sticker
    const handleRemoveSticker = (room: ShopRoom, stickerId: string) => {
        if (!onUpdateRoom) return;
        onUpdateRoom({
            ...room,
            stickers: room.stickers.filter(s => s.id !== stickerId)
        });
    };

    // Apply wallpaper
    const handleApplyWallpaper = (room: ShopRoom, value: string) => {
        if (!onUpdateRoom) return;
        onUpdateRoom({ ...room, wallpaper: value });
    };

    // Apply floor
    const handleApplyFloor = (room: ShopRoom, value: string) => {
        if (!onUpdateRoom) return;
        onUpdateRoom({ ...room, floor: value });
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
            const pet = getVisitorPet(char.id);
            const hasPetHere = !!pet;

            let prompt = `${context}\n### Scenario: Visiting a Café\nUser owns a digital Café called "${shopState.shopName}".\nYou (Character) are entering the shop as a customer.\nShop Appeal Level: ${shopState.appeal} (Higher means nicer shop).\n`;

            if (hasPetHere) {
                prompt += `\n### SPECIAL EVENT: APP PET REUNION!\nYou just discovered that your APP PET "${pet!.name}" is working here!\nThe pet is working as a ${pet!.role === 'chef' ? '小帮厨' : pet!.role === 'manager' ? '吉祥物' : '店小二'} in the user's virtual cafe.\n\n### Task\nExpress your SURPRISE and JOY at finding your APP PET here!\nOutput JSON: { "action": "发现App宠物的惊喜表情", "comment": "你看到虚拟宠物在打工的反应" }\nLanguage: Chinese. Be cute and playful!`;
            } else {
                prompt += `\n### Task\nDescribe your entrance action and one comment about the shop or food.\nOutput JSON: { "action": "Looking around...", "comment": "Smells good here!" }\nLanguage: Chinese.`;
            }

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

                if (hasPetHere) {
                    setShowLoveEffect(true);
                    setTimeout(() => setShowLoveEffect(false), 3000);
                    addToast(`💕 ${char.name} 发现了 ${pet!.name}！`, 'success');
                    if (pushSystemMessage) {
                        pushSystemMessage(char.id, `[系统提示] ${char.name} 拜访了 ${userProfile.name} 的记账App咖啡馆，惊喜地发现自己在这个App里养的虚拟小宠物 ${pet!.name} 正在这里打工！${char.name}表示："${result.comment}"`);
                    }
                } else {
                    addToast(`${char.name} 进店了！`, 'success');
                }
            }
        } catch (e) {
            console.error(e);
            addToast('邀请失败', 'error');
        } finally {
            setIsInviting(false);
        }
    };

    // Get staff that should appear in a given room
    const getStaffInRoom = (room: ShopRoom) => {
        const bounds = getRoomBounds(room, rooms);
        return shopState.staff.filter(s => {
            const sx = s.x || 50;
            const sy = s.y || 75;
            return sx >= bounds.xStart && sx < bounds.xEnd && sy >= bounds.yStart && sy < bounds.yEnd;
        });
    };

    // Convert staff global coords to room-local coords
    const staffToLocal = (staff: ShopStaff, room: ShopRoom) => {
        const bounds = getRoomBounds(room, rooms);
        const localX = ((staff.x || 50) - bounds.xStart) / (bounds.xEnd - bounds.xStart) * 100;
        const localY = ((staff.y || 75) - bounds.yStart) / (bounds.yEnd - bounds.yStart) * 100;
        return { x: localX, y: localY };
    };

    // Render a single staff member
    const renderStaffSprite = (s: ShopStaff, room: ShopRoom, idx: number) => {
        const local = staffToLocal(s, room);
        const isPet = s.isPet;
        const ownerChar = isPet ? characters.find(c => c.id === s.ownerCharId) : null;
        const isOwnerVisiting = visitor && s.ownerCharId === visitor.char.id;

        return (
            <div
                key={s.id}
                className={`absolute flex flex-col items-center group cursor-pointer transition-all duration-700 ease-in-out z-10 ${isOwnerVisiting ? 'animate-wiggle' : ''}`}
                style={{ left: `${local.x}%`, top: `${local.y}%`, transform: 'translate(-50%, -100%)', zIndex: Math.floor(local.y) }}
                onClick={(e) => { e.stopPropagation(); onStaffClick && onStaffClick(s); }}
            >
                <div className="absolute bottom-1 w-8 h-2 bg-black/10 rounded-full blur-[2px] transform scale-x-150"></div>
                {isPet && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5">
                        <span className="text-xs">🐾</span>
                        {ownerChar && <img src={ownerChar.avatar} className="w-3 h-3 rounded-full border border-white shadow-sm" />}
                    </div>
                )}
                {isOwnerVisiting && <div className="absolute -top-8 text-lg animate-bounce z-20">💕</div>}
                {s.fatigue > 80 && !isOwnerVisiting && <div className="absolute -top-6 text-lg animate-bounce z-20">💤</div>}
                <div className={`text-3xl filter drop-shadow-md transform group-hover:scale-110 transition-transform select-none ${isOwnerVisiting ? 'animate-pulse' : ''}`}>
                    {s.avatar.startsWith('http') || s.avatar.startsWith('data') ? <img src={s.avatar} className="w-10 h-10 object-contain rounded-lg" /> : s.avatar}
                </div>
                <div className={`px-1.5 py-0.5 rounded-full text-[7px] font-bold mt-0.5 shadow-sm backdrop-blur-sm whitespace-nowrap ${
                    isPet ? 'bg-gradient-to-r from-pink-100 to-rose-100 text-rose-600 border border-pink-200' : 'bg-white/90 text-slate-600 border border-slate-200'
                }`}>
                    {isPet && <span className="mr-0.5">🐾</span>}{s.name}
                </div>
                <div className="w-6 h-0.5 bg-slate-200 rounded-full mt-0.5 overflow-hidden border border-white">
                    <div className={`h-full ${s.fatigue > 80 ? 'bg-red-400' : isPet ? 'bg-pink-400' : 'bg-green-400'}`} style={{ width: `${100 - s.fatigue}%` }}></div>
                </div>
            </div>
        );
    };

    // Render a single room
    const renderRoom = (room: ShopRoom, isZoomed: boolean) => {
        const staffInRoom = getStaffInRoom(room);
        const isLocked = !room.unlocked;
        const showPlacingCursor = isZoomed && placingSticker;

        return (
            <div
                key={room.id}
                className={`relative overflow-hidden transition-all duration-300 ${
                    room.position === 'full' ? 'col-span-2' : ''
                } ${isLocked ? 'cursor-pointer' : ''} ${showPlacingCursor ? 'cursor-crosshair' : ''}`}
                style={{ minHeight: isZoomed ? '100%' : undefined }}
                onDoubleClick={(e) => { e.stopPropagation(); if (!isZoomed) handleRoomDoubleClick(room.id); }}
                onClick={(e) => {
                    if (isLocked) { handleLockedRoomClick(room.id); return; }
                    if (isZoomed && placingSticker) { handleStickerPlace(e, room); return; }
                    if (isZoomed) handleFloorClick(e, room);
                }}
            >
                {/* Wall area - top 70% */}
                <div
                    className="absolute inset-0 bottom-[25%]"
                    style={{
                        background: isLocked ? '#F5F5F5' : (room.wallpaper || '#FFFFFF'),
                    }}
                >
                    {/* Wall texture overlay for locked rooms */}
                    {isLocked && (
                        <div className="absolute inset-0 opacity-30"
                            style={{
                                backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 8px, #E0E0E0 8px, #E0E0E0 9px), repeating-linear-gradient(90deg, transparent, transparent 8px, #E0E0E0 8px, #E0E0E0 9px)`,
                            }}
                        />
                    )}
                </div>

                {/* Floor area - bottom 25% */}
                <div
                    className="absolute left-0 right-0 bottom-0 h-[25%]"
                    style={{
                        background: isLocked ? '#E8E8E8' : (room.floor || '#E0E0E0'),
                    }}
                >
                    {isLocked && (
                        <div className="absolute inset-0 opacity-20"
                            style={{
                                backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 12px, #BDBDBD 12px, #BDBDBD 13px)',
                            }}
                        />
                    )}
                </div>

                {/* Baseboard line */}
                <div className="absolute left-0 right-0 bottom-[25%] h-[2px] bg-[#D7CCC8] z-5"></div>

                {/* Stickers (only when unlocked) */}
                {!isLocked && room.stickers.map(sticker => (
                    <div
                        key={sticker.id}
                        className={`absolute z-10 select-none transition-transform hover:scale-110 ${isZoomed ? 'cursor-pointer' : 'pointer-events-none'}`}
                        style={{
                            left: `${sticker.x}%`,
                            top: `${sticker.y}%`,
                            transform: `translate(-50%, -50%) scale(${sticker.scale})`,
                            fontSize: isZoomed ? '2rem' : '1rem',
                        }}
                        onClick={(e) => {
                            if (isZoomed && !placingSticker) {
                                e.stopPropagation();
                                // Show delete confirmation
                                if (confirm('移除这个贴纸？')) {
                                    handleRemoveSticker(room, sticker.id);
                                }
                            }
                        }}
                    >
                        {sticker.content}
                    </div>
                ))}

                {/* Staff in this room */}
                {!isLocked && staffInRoom.map((s, idx) => renderStaffSprite(s, room, idx))}

                {/* Lock overlay */}
                {isLocked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-white/40 backdrop-blur-[1px]">
                        <div className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-white/80 shadow-lg border border-slate-200/50">
                            <span className={`${isZoomed ? 'text-4xl' : 'text-2xl'}`}>🔒</span>
                            <span className={`font-bold text-slate-500 ${isZoomed ? 'text-sm' : 'text-[8px]'}`}>{room.name}</span>
                            <span className={`font-bold text-amber-600 ${isZoomed ? 'text-xs' : 'text-[7px]'}`}>{ROOM_UNLOCK_COST} AP</span>
                        </div>
                    </div>
                )}

                {/* Room name label (overview mode) */}
                {!isZoomed && !isLocked && (
                    <div className="absolute top-1 left-1 z-15">
                        <span className="text-[6px] font-bold text-slate-400 bg-white/60 px-1 py-0.5 rounded backdrop-blur-sm">
                            {room.name}
                        </span>
                    </div>
                )}

                {/* Room border */}
                <div className={`absolute inset-0 pointer-events-none z-30 ${
                    isLocked ? 'border-2 border-dashed border-slate-300' : 'border border-[#D7CCC8]'
                }`}></div>
            </div>
        );
    };

    // --- ZOOMED VIEW ---
    if (zoomedRoom) {
        return (
            <div className="relative w-full h-[65vh] overflow-hidden select-none flex flex-col" style={{ background: '#F5F5F5' }}>
                {/* Zoomed room content */}
                <div className="flex-1 relative">
                    {renderRoom(zoomedRoom, true)}

                    {/* Visitor in zoomed view */}
                    {visitor && (() => {
                        // Show visitor in the first unlocked ground floor room
                        const groundRooms = rooms.filter(r => r.layer === 1 && r.unlocked);
                        const isInThisRoom = groundRooms.length > 0 && groundRooms[0].id === zoomedRoom.id;
                        if (!isInThisRoom) return null;
                        return (
                            <div className="absolute bottom-[30%] left-1/2 -translate-x-1/2 flex flex-col items-center animate-fade-in z-30 pointer-events-none">
                                <div className="relative mb-2">
                                    <div className={`bg-white/95 backdrop-blur-sm p-3 rounded-2xl shadow-xl text-sm font-medium text-[#5D4037] max-w-[200px] ${
                                        getVisitorPet(visitor.char.id) ? 'border-2 border-pink-300' : 'border border-[#FFE0B2]'
                                    }`}>
                                        {visitor.msg}
                                    </div>
                                    <div className="absolute -bottom-2 left-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-white/95"></div>
                                </div>
                                <img src={visitor.char.sprites?.chibi || visitor.char.avatar} className="w-20 h-20 object-contain drop-shadow-2xl" />
                                <div className="px-3 py-1 rounded-full text-[10px] text-white mt-1 font-bold shadow-lg bg-gradient-to-r from-[#8D6E63] to-[#6D4C41]">
                                    {visitor.char.name}
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Top bar */}
                <div className="absolute top-3 left-3 right-3 z-40 flex items-center justify-between">
                    {/* Back button */}
                    <button
                        onClick={handleZoomOut}
                        className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-slate-200 hover:bg-white active:scale-95 transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        <span className="text-xs font-bold text-slate-600">全景</span>
                    </button>

                    {/* Room name */}
                    <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-slate-200">
                        <span className="text-xs font-bold text-[#5D4037]">{zoomedRoom.name}</span>
                    </div>

                    {/* Customize toggle */}
                    {zoomedRoom.unlocked && (
                        <button
                            onClick={() => setCustomizeTab(customizeTab ? null : 'wallpaper')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl shadow-lg border transition-all active:scale-95 ${
                                customizeTab
                                    ? 'bg-[#FF7043] text-white border-[#E64A19]'
                                    : 'bg-white/90 backdrop-blur-sm border-slate-200 text-slate-600 hover:bg-white'
                            }`}
                        >
                            <span className="text-sm">{customizeTab ? '✕' : '🎨'}</span>
                            <span className="text-xs font-bold">{customizeTab ? '关闭' : '装饰'}</span>
                        </button>
                    )}
                </div>

                {/* Placing sticker hint */}
                {placingSticker && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-amber-100 border border-amber-300 px-4 py-2 rounded-xl shadow-lg animate-bounce">
                        <span className="text-xs font-bold text-amber-700">点击房间内任意位置放置 {placingSticker}</span>
                        <button onClick={() => setPlacingSticker(null)} className="ml-2 text-amber-500 hover:text-amber-700">✕</button>
                    </div>
                )}

                {/* Customize panel */}
                {customizeTab && zoomedRoom.unlocked && (
                    <div className="absolute bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-2xl animate-slide-up">
                        {/* Tabs */}
                        <div className="flex border-b border-slate-100">
                            {([
                                { key: 'wallpaper', label: '墙纸', icon: '🖼️' },
                                { key: 'floor', label: '地板', icon: '🪵' },
                                { key: 'stickers', label: '贴纸', icon: '⭐' },
                            ] as const).map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => { setCustomizeTab(tab.key); setPlacingSticker(null); }}
                                    className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                                        customizeTab === tab.key
                                            ? 'text-[#FF7043] border-b-2 border-[#FF7043]'
                                            : 'text-slate-400'
                                    }`}
                                >
                                    <span>{tab.icon}</span>
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Wallpaper picker */}
                        {customizeTab === 'wallpaper' && (
                            <div className="p-3 overflow-x-auto no-scrollbar">
                                <div className="flex gap-2">
                                    {WALLPAPER_PRESETS.map(wp => (
                                        <button
                                            key={wp.id}
                                            onClick={() => handleApplyWallpaper(zoomedRoom, wp.value)}
                                            className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                                                zoomedRoom.wallpaper === wp.value ? 'ring-2 ring-[#FF7043] bg-orange-50' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div
                                                className="w-12 h-12 rounded-lg border border-slate-200 shadow-inner"
                                                style={{ background: wp.value }}
                                            ></div>
                                            <span className="text-[8px] font-bold text-slate-500">{wp.name}</span>
                                            {wp.cost > 0 && <span className="text-[7px] text-amber-600">{wp.cost}AP</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Floor picker */}
                        {customizeTab === 'floor' && (
                            <div className="p-3 overflow-x-auto no-scrollbar">
                                <div className="flex gap-2">
                                    {FLOOR_PRESETS.map(fl => (
                                        <button
                                            key={fl.id}
                                            onClick={() => handleApplyFloor(zoomedRoom, fl.value)}
                                            className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                                                zoomedRoom.floor === fl.value ? 'ring-2 ring-[#FF7043] bg-orange-50' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div
                                                className="w-12 h-12 rounded-lg border border-slate-200 shadow-inner"
                                                style={{ background: fl.value }}
                                            ></div>
                                            <span className="text-[8px] font-bold text-slate-500">{fl.name}</span>
                                            {fl.cost > 0 && <span className="text-[7px] text-amber-600">{fl.cost}AP</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Sticker picker */}
                        {customizeTab === 'stickers' && (
                            <div className="p-3">
                                <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto no-scrollbar">
                                    {DECO_STICKERS.map((sticker, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setPlacingSticker(sticker)}
                                            className={`w-10 h-10 flex items-center justify-center text-xl rounded-xl transition-all ${
                                                placingSticker === sticker
                                                    ? 'bg-amber-100 ring-2 ring-amber-400 scale-110'
                                                    : 'bg-slate-50 hover:bg-slate-100 hover:scale-105'
                                            }`}
                                        >
                                            {sticker}
                                        </button>
                                    ))}
                                </div>
                                {zoomedRoom.stickers.length > 0 && (
                                    <div className="mt-2 text-[9px] text-slate-400 text-center">
                                        已放置 {zoomedRoom.stickers.length} 个贴纸 · 点击房间内贴纸可移除
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Love Effect Overlay */}
                {showLoveEffect && (
                    <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className="absolute text-2xl animate-float-up"
                                style={{ left: `${10 + Math.random() * 80}%`, animationDelay: `${Math.random() * 2}s`, animationDuration: `${2 + Math.random() * 2}s` }}>
                                {['💕', '💗', '💖', '💝', '🩷'][Math.floor(Math.random() * 5)]}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // --- OVERVIEW (DOLLHOUSE) VIEW ---
    const layer2Rooms = rooms.filter(r => r.layer === 2);
    const layer1Rooms = rooms.filter(r => r.layer === 1);

    return (
        <div
            ref={sceneRef}
            className="relative w-full h-[65vh] overflow-hidden select-none"
            style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B0E0E6 40%, #90EE90 50%, #228B22 100%)' }}
        >
            {/* Sky background */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Clouds */}
                <div className="absolute top-[5%] left-[10%] text-4xl opacity-60 animate-pulse" style={{ animationDuration: '4s' }}>☁️</div>
                <div className="absolute top-[8%] right-[15%] text-3xl opacity-40 animate-pulse" style={{ animationDuration: '6s' }}>☁️</div>
                <div className="absolute top-[2%] left-[50%] text-2xl opacity-30 animate-pulse" style={{ animationDuration: '5s' }}>☁️</div>
            </div>

            {/* Dollhouse building */}
            <div className="absolute left-[6%] right-[6%] top-[8%] bottom-[10%] flex flex-col">

                {/* Roof */}
                <div className="relative h-[12%] shrink-0 flex items-end justify-center">
                    {/* Roof triangle */}
                    <div className="absolute bottom-0 left-[-4%] right-[-4%] h-full"
                        style={{
                            background: 'linear-gradient(180deg, #8D6E63 0%, #6D4C41 100%)',
                            clipPath: 'polygon(50% 0%, -2% 100%, 102% 100%)',
                        }}>
                        {/* Roof tile pattern */}
                        <div className="absolute inset-0 opacity-30"
                            style={{
                                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 6px, rgba(0,0,0,0.15) 6px, rgba(0,0,0,0.15) 7px)',
                            }}></div>
                    </div>
                    {/* Chimney */}
                    <div className="absolute top-[10%] right-[18%] w-[8%] h-[70%] bg-gradient-to-b from-[#A1887F] to-[#8D6E63] rounded-t-sm z-10 border border-[#795548]">
                        <div className="absolute -top-1 -left-0.5 -right-0.5 h-2 bg-[#6D4C41] rounded-t-sm"></div>
                    </div>
                    {/* Shop sign */}
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20">
                        <div className="bg-gradient-to-b from-[#5D4037] to-[#4E342E] px-4 py-1 rounded-lg shadow-lg border border-[#6D4C41]">
                            <span className="text-[8px] font-bold text-[#FFF8E1] tracking-wider">{shopState.shopName}</span>
                        </div>
                    </div>
                </div>

                {/* Building body */}
                <div className="flex-1 flex flex-col bg-[#EFEBE9] border-x-4 border-b-4 border-[#8D6E63] rounded-b-lg overflow-hidden shadow-2xl">
                    {/* Outer walls */}
                    <div className="flex-1 flex flex-col relative">

                        {/* Layer 2 (Upper floor) */}
                        <div className="flex-1 grid gap-0 relative" style={{ gridTemplateColumns: layer2Rooms.length === 1 ? '1fr' : '1fr 1fr' }}>
                            {layer2Rooms.map(room => renderRoom(room, false))}
                            {/* Floor number label */}
                            <div className="absolute top-1 right-1 z-20">
                                <span className="text-[6px] font-bold text-[#A1887F] bg-white/60 px-1 rounded">2F</span>
                            </div>
                        </div>

                        {/* Floor divider between layers */}
                        <div className="h-[6px] bg-gradient-to-b from-[#8D6E63] to-[#6D4C41] shadow-md relative z-10 shrink-0">
                            <div className="absolute inset-x-0 top-0 h-[2px] bg-[#A1887F]"></div>
                        </div>

                        {/* Layer 1 (Ground floor) */}
                        <div className="flex-1 grid gap-0 relative" style={{ gridTemplateColumns: layer1Rooms.length === 1 ? '1fr' : '1fr 1fr' }}>
                            {layer1Rooms.map(room => renderRoom(room, false))}
                            {/* Floor number label */}
                            <div className="absolute top-1 right-1 z-20">
                                <span className="text-[6px] font-bold text-[#A1887F] bg-white/60 px-1 rounded">1F</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ground / Foundation */}
                <div className="h-[4%] bg-gradient-to-b from-[#6D4C41] to-[#5D4037] rounded-b-lg shrink-0 relative">
                    <div className="absolute inset-x-0 top-0 h-1 bg-[#8D6E63]"></div>
                </div>
            </div>

            {/* Visitor (overview mode - show at building entrance) */}
            {visitor && (
                <div className="absolute bottom-[12%] left-1/2 -translate-x-1/2 flex flex-col items-center animate-fade-in z-30 pointer-events-none">
                    <div className="relative mb-1">
                        <div className={`bg-white/95 backdrop-blur-sm p-2 rounded-xl shadow-lg text-[10px] font-medium text-[#5D4037] max-w-[120px] ${
                            getVisitorPet(visitor.char.id) ? 'border-2 border-pink-300' : 'border border-[#FFE0B2]'
                        }`}>
                            {getVisitorPet(visitor.char.id) && <div className="absolute -top-2 -right-2 text-sm animate-bounce">💕</div>}
                            {visitor.msg}
                        </div>
                        <div className="absolute -bottom-1 left-3 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-white/95"></div>
                    </div>
                    <img src={visitor.char.sprites?.chibi || visitor.char.avatar} className="w-14 h-14 object-contain drop-shadow-xl" />
                    <div className={`px-2 py-0.5 rounded-full text-[8px] text-white mt-1 font-bold shadow-md ${
                        getVisitorPet(visitor.char.id)
                            ? 'bg-gradient-to-r from-pink-400 to-rose-500'
                            : 'bg-gradient-to-r from-[#8D6E63] to-[#6D4C41]'
                    }`}>
                        {visitor.char.name}
                    </div>
                </div>
            )}

            {/* Love Effect Overlay */}
            {showLoveEffect && (
                <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className="absolute text-2xl animate-float-up"
                            style={{ left: `${10 + Math.random() * 80}%`, animationDelay: `${Math.random() * 2}s`, animationDuration: `${2 + Math.random() * 2}s` }}>
                            {['💕', '💗', '💖', '💝', '🩷'][Math.floor(Math.random() * 5)]}
                        </div>
                    ))}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="text-6xl animate-ping">💕</div>
                    </div>
                </div>
            )}

            {/* --- HUD Overlay --- */}

            {/* TOP LEFT: Appeal Score */}
            <div className="absolute top-3 left-3 z-40">
                <div className="bg-white/70 backdrop-blur-xl px-3 py-1.5 rounded-xl shadow-lg border border-white/50 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FFD54F] to-[#FFB300] flex items-center justify-center shadow-md">
                        <span className="text-sm">✨</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[8px] text-[#8D6E63] font-medium uppercase tracking-wider">人气值</span>
                        <span className="text-base font-black text-[#5D4037] leading-none">{shopState.appeal}</span>
                    </div>
                </div>
            </div>

            {/* TOP RIGHT: Guestbook Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onOpenGuestbook(); }}
                className="absolute top-3 right-3 z-40 group hover:scale-105 active:scale-95 transition-all duration-300"
            >
                <div className="relative bg-gradient-to-b from-[#6D4C41] to-[#5D4037] w-12 h-14 rounded-xl shadow-xl flex flex-col items-center justify-center gap-0.5 overflow-hidden border border-[#8D6E63]/50">
                    <div className="text-xl relative z-10">📖</div>
                    <div className="text-[6px] font-bold uppercase tracking-wider text-[#D7CCC8] relative z-10">情报志</div>
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-br from-[#FF5252] to-[#D32F2F] rounded-full border border-white shadow-lg flex items-center justify-center animate-pulse">
                        <span className="text-[6px] text-white font-bold">!</span>
                    </div>
                </div>
            </button>

            {/* BOTTOM RIGHT: Invite Button */}
            <div className="absolute bottom-[12%] right-3 z-40">
                <button
                    onClick={(e) => { e.stopPropagation(); handleInvite(); }}
                    disabled={isInviting}
                    className="relative group"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#FF7043] to-[#E64A19] rounded-full blur-lg opacity-40 group-hover:opacity-70 transition-opacity"></div>
                    <div className={`relative h-14 w-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${isInviting ? 'bg-[#BDBDBD]' : 'bg-gradient-to-br from-[#FF8A65] via-[#FF7043] to-[#E64A19] hover:scale-110 active:scale-95'}`}>
                        <div className="absolute inset-1 rounded-full bg-gradient-to-b from-white/20 to-transparent"></div>
                        {isInviting ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <span className="text-2xl relative z-10">🛎️</span>
                        )}
                    </div>
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <span className="text-[8px] font-bold text-[#5D4037]/70 bg-white/60 backdrop-blur px-2 py-0.5 rounded-full">招揽客人</span>
                    </div>
                </button>
            </div>

            {/* BOTTOM LEFT: Hint */}
            <div className="absolute bottom-[12%] left-3 z-40">
                <div className="bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-xl text-[8px] text-[#8D6E63] font-medium border border-white/30">
                    双击房间放大查看
                </div>
            </div>
        </div>
    );
};

export default BankShopScene;
