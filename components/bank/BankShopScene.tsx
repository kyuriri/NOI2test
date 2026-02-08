
import React, { useState, useEffect, useRef } from 'react';
import { BankShopState, CharacterProfile, UserProfile, APIConfig, ShopStaff, ShopRoom, ShopRoomSticker } from '../../types';
import { WALLPAPER_PRESETS, FLOOR_PRESETS, DECO_STICKERS, ROOM_UNLOCK_COST } from './BankGameConstants';
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

const getCurrentRooms = (shopState: BankShopState): ShopRoom[] => {
    const planId = shopState.activeFloorPlanId || 'plan-standard';
    return shopState.allRoomStates?.[planId] || [];
};

const getRoomBounds = (room: ShopRoom) => {
    const isTop = room.layer === 2;
    const yStart = isTop ? 0 : 50;
    const yEnd = isTop ? 50 : 100;
    let xStart = 0, xEnd = 100;
    if (room.position === 'left') { xEnd = 50; }
    else if (room.position === 'right') { xStart = 50; }
    return { xStart, xEnd, yStart, yEnd };
};

// ============================================================
// Isometric Room Component - each room has left-wall, right-wall, floor
// ============================================================
const IsoRoom: React.FC<{
    room: ShopRoom;
    width: number;   // px width for this room's iso cell
    height: number;  // px height for the wall portion
    floorDepth: number; // px depth of the floor diamond
    isZoomed: boolean;
    onDoubleClick: () => void;
    onClick: (e: React.MouseEvent) => void;
    onUnlock: () => void;
    onRemoveSticker: (id: string) => void;
    staffElements: React.ReactNode;
    placingSticker: string | null;
}> = ({ room, width, height, floorDepth, isZoomed, onDoubleClick, onClick, onUnlock, onRemoveSticker, staffElements, placingSticker }) => {
    const isLocked = !room.unlocked;
    const halfW = width / 2;

    // White-model colors for locked state
    const lockedWallL = '#F0EDE8';
    const lockedWallR = '#E8E4DF';
    const lockedFloor = '#E0DCD6';
    const wallBorder = '#C5B9A8';

    const wallL = isLocked ? lockedWallL : (room.wallpaper || '#FFFFFF');
    const wallR = isLocked ? lockedWallR : (room.wallpaper || '#FFFFFF');
    const floorBg = isLocked ? lockedFloor : (room.floor || '#E0E0E0');

    // For the right wall, darken slightly to simulate shadow
    const wallRStyle = isLocked ? lockedWallR : (room.wallpaper || '#FFFFFF');

    return (
        <div
            className={`relative select-none ${isLocked ? 'cursor-pointer' : ''} ${placingSticker ? 'cursor-crosshair' : ''}`}
            style={{ width: width, height: height + floorDepth }}
            onDoubleClick={(e) => { e.stopPropagation(); if (!isZoomed) onDoubleClick(); }}
            onClick={onClick}
        >
            {/* === LEFT WALL === */}
            <div
                className="absolute overflow-hidden"
                style={{
                    width: halfW,
                    height: height,
                    left: 0,
                    top: 0,
                    background: wallL,
                    transform: 'skewY(26.565deg)',
                    transformOrigin: 'bottom right',
                    borderLeft: `2px solid ${wallBorder}`,
                    borderTop: `2px solid ${wallBorder}`,
                }}
            >
                {/* Shadow gradient on left wall */}
                <div className="absolute inset-0 pointer-events-none" style={{
                    background: isLocked
                        ? 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.03) 6px, rgba(0,0,0,0.03) 7px)'
                        : 'linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0) 100%)',
                }}/>
                {/* Stickers on left wall */}
                {!isLocked && room.stickers.filter(s => s.x < 40).map(sticker => (
                    <div
                        key={sticker.id}
                        className={`absolute z-10 select-none ${isZoomed ? 'cursor-pointer hover:scale-125' : 'pointer-events-none'}`}
                        style={{
                            left: `${sticker.x * 2.5}%`,
                            top: `${sticker.y}%`,
                            transform: `translate(-50%, -50%) scale(${isZoomed ? sticker.scale * 1.4 : sticker.scale * 0.7})`,
                            transition: 'transform 0.2s',
                        }}
                        onClick={(e) => {
                            if (isZoomed && !placingSticker) {
                                e.stopPropagation();
                                if (confirm('移除贴纸？')) onRemoveSticker(sticker.id);
                            }
                        }}
                    >{sticker.content}</div>
                ))}
            </div>

            {/* === RIGHT WALL === */}
            <div
                className="absolute overflow-hidden"
                style={{
                    width: halfW,
                    height: height,
                    right: 0,
                    top: 0,
                    background: wallRStyle,
                    transform: 'skewY(-26.565deg)',
                    transformOrigin: 'bottom left',
                    borderRight: `2px solid ${wallBorder}`,
                    borderTop: `2px solid ${wallBorder}`,
                }}
            >
                {/* Shadow on right wall (slightly darker) */}
                <div className="absolute inset-0 pointer-events-none" style={{
                    background: isLocked
                        ? 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(0,0,0,0.03) 6px, rgba(0,0,0,0.03) 7px)'
                        : 'linear-gradient(270deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0) 100%)',
                }}/>
                {/* Stickers on right wall */}
                {!isLocked && room.stickers.filter(s => s.x >= 40 && s.x < 70).map(sticker => (
                    <div
                        key={sticker.id}
                        className={`absolute z-10 select-none ${isZoomed ? 'cursor-pointer hover:scale-125' : 'pointer-events-none'}`}
                        style={{
                            left: `${(sticker.x - 40) * 3.3}%`,
                            top: `${sticker.y}%`,
                            transform: `translate(-50%, -50%) scale(${isZoomed ? sticker.scale * 1.4 : sticker.scale * 0.7})`,
                            transition: 'transform 0.2s',
                        }}
                        onClick={(e) => {
                            if (isZoomed && !placingSticker) {
                                e.stopPropagation();
                                if (confirm('移除贴纸？')) onRemoveSticker(sticker.id);
                            }
                        }}
                    >{sticker.content}</div>
                ))}
            </div>

            {/* === FLOOR (diamond) === */}
            <div
                className="absolute overflow-hidden"
                style={{
                    width: width,
                    height: floorDepth * 2,
                    left: 0,
                    top: height,
                    background: floorBg,
                    clipPath: `polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`,
                    borderBottom: `2px solid ${wallBorder}`,
                }}
            >
                {/* Floor texture */}
                {isLocked && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                        background: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.04) 8px, rgba(0,0,0,0.04) 9px)',
                    }}/>
                )}
                {/* Floor stickers */}
                {!isLocked && room.stickers.filter(s => s.x >= 70).map(sticker => (
                    <div
                        key={sticker.id}
                        className={`absolute z-10 select-none ${isZoomed ? 'cursor-pointer hover:scale-125' : 'pointer-events-none'}`}
                        style={{
                            left: `${30 + (sticker.x - 70) * 1.3}%`,
                            top: `${30 + sticker.y * 0.4}%`,
                            transform: `translate(-50%, -50%) scale(${isZoomed ? sticker.scale * 1.4 : sticker.scale * 0.7})`,
                            transition: 'transform 0.2s',
                        }}
                        onClick={(e) => {
                            if (isZoomed && !placingSticker) {
                                e.stopPropagation();
                                if (confirm('移除贴纸？')) onRemoveSticker(sticker.id);
                            }
                        }}
                    >{sticker.content}</div>
                ))}
                {/* Staff on floor */}
                {staffElements}
            </div>

            {/* === LOCK OVERLAY === */}
            {isLocked && (
                <div
                    className="absolute inset-0 flex items-center justify-center z-20"
                    onClick={(e) => { e.stopPropagation(); onUnlock(); }}
                >
                    <div className="flex flex-col items-center gap-1 bg-white/80 backdrop-blur-sm px-3 py-2 rounded-xl shadow-lg border border-[#D7CCC8]">
                        <span className={`${isZoomed ? 'text-3xl' : 'text-lg'}`}>🔒</span>
                        <span className={`font-bold text-[#8D6E63] ${isZoomed ? 'text-xs' : 'text-[7px]'}`}>{room.name}</span>
                        <span className={`font-bold text-amber-600 ${isZoomed ? 'text-[10px]' : 'text-[6px]'}`}>{ROOM_UNLOCK_COST} AP</span>
                    </div>
                </div>
            )}

            {/* Room name (overview) */}
            {!isZoomed && !isLocked && (
                <div className="absolute top-1 z-15 left-1/2 -translate-x-1/2">
                    <span className="text-[5px] font-bold text-[#8D6E63] bg-white/70 px-1 py-0.5 rounded backdrop-blur-sm whitespace-nowrap">
                        {room.name}
                    </span>
                </div>
            )}
        </div>
    );
};

// ============================================================
// Main Scene
// ============================================================
const BankShopScene: React.FC<Props> = ({
    shopState, characters, userProfile, apiConfig, updateState,
    onStaffClick, onMoveStaff, onOpenGuestbook, onUnlockRoom, onUpdateRoom
}) => {
    const { addToast, pushSystemMessage } = useOS();
    const [visitor, setVisitor] = useState<{char: CharacterProfile, msg: string} | null>(null);
    const [isInviting, setIsInviting] = useState(false);
    const [showLoveEffect, setShowLoveEffect] = useState(false);

    const [zoomedRoomId, setZoomedRoomId] = useState<string | null>(null);
    const [customizeTab, setCustomizeTab] = useState<'wallpaper' | 'floor' | 'stickers' | null>(null);
    const [placingSticker, setPlacingSticker] = useState<string | null>(null);

    const rooms = getCurrentRooms(shopState);
    const zoomedRoom = zoomedRoomId ? rooms.find(r => r.id === zoomedRoomId) : null;

    const getVisitorPet = (charId: string) => shopState.staff.find(s => s.isPet && s.ownerCharId === charId);

    useEffect(() => {
        if (shopState.activeVisitor) {
            const char = characters.find(c => c.id === shopState.activeVisitor!.charId);
            if (char) setVisitor({ char, msg: shopState.activeVisitor.message });
            else setVisitor(null);
        } else setVisitor(null);
    }, [shopState.activeVisitor]);

    // --- Handlers ---
    const handleRoomDoubleClick = (roomId: string) => {
        const room = rooms.find(r => r.id === roomId);
        if (!room) return;
        if (!room.unlocked) { onUnlockRoom?.(roomId); return; }
        setZoomedRoomId(roomId);
        setCustomizeTab(null);
        setPlacingSticker(null);
    };

    const handleZoomOut = () => {
        setZoomedRoomId(null);
        setCustomizeTab(null);
        setPlacingSticker(null);
    };

    const handleStickerPlace = (e: React.MouseEvent, room: ShopRoom) => {
        if (!placingSticker || !onUpdateRoom) return;
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        const newSticker: ShopRoomSticker = {
            id: `stk-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            content: placingSticker,
            x: Math.max(5, Math.min(95, x)),
            y: Math.max(5, Math.min(90, y)),
            scale: 1
        };
        onUpdateRoom({ ...room, stickers: [...room.stickers, newSticker] });
        setPlacingSticker(null);
    };

    const handleRemoveSticker = (room: ShopRoom, stickerId: string) => {
        onUpdateRoom?.({ ...room, stickers: room.stickers.filter(s => s.id !== stickerId) });
    };

    const handleApplyWallpaper = (room: ShopRoom, value: string) => {
        onUpdateRoom?.({ ...room, wallpaper: value });
    };

    const handleApplyFloor = (room: ShopRoom, value: string) => {
        onUpdateRoom?.({ ...room, floor: value });
    };

    const handleFloorClick = (e: React.MouseEvent, room: ShopRoom) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (!room.unlocked || !onMoveStaff || placingSticker) return;
        const bounds = getRoomBounds(room);
        const globalX = bounds.xStart + Math.random() * (bounds.xEnd - bounds.xStart);
        const globalY = bounds.yStart + (bounds.yEnd - bounds.yStart) * (0.6 + Math.random() * 0.3);
        onMoveStaff(globalX, globalY);
    };

    // Invite
    const handleInvite = async () => {
        const COST = 30;
        if (shopState.actionPoints < COST) { addToast(`AP不足 (需${COST})`, 'error'); return; }
        if (!apiConfig.apiKey) { addToast('请配置 API Key', 'error'); return; }
        setIsInviting(true);
        try {
            const char = characters[Math.floor(Math.random() * characters.length)];
            const context = ContextBuilder.buildCoreContext(char, userProfile, true);
            const pet = getVisitorPet(char.id);
            let prompt = `${context}\n### Scenario: Visiting a Café\nUser owns "${shopState.shopName}". Appeal: ${shopState.appeal}.\n`;
            if (pet) {
                prompt += `\nSPECIAL: Found pet "${pet.name}" working here!\nOutput JSON: { "comment": "reaction" }\nChinese.`;
            } else {
                prompt += `\nOutput JSON: { "comment": "one-line comment" }\nChinese.`;
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
                    activeVisitor: { charId: char.id, message: result.comment || "来了~", timestamp: Date.now() }
                });
                if (pet) {
                    setShowLoveEffect(true);
                    setTimeout(() => setShowLoveEffect(false), 3000);
                    addToast(`${char.name} 发现了 ${pet.name}！`, 'success');
                    pushSystemMessage?.(char.id, `[系统提示] ${char.name} 在咖啡馆发现宠物 ${pet.name} 在打工！`);
                } else {
                    addToast(`${char.name} 进店了！`, 'success');
                }
            }
        } catch (e) { addToast('邀请失败', 'error'); }
        finally { setIsInviting(false); }
    };

    // Staff rendering
    const getStaffInRoom = (room: ShopRoom) => {
        const bounds = getRoomBounds(room);
        return shopState.staff.filter(s => {
            const sx = s.x || 50, sy = s.y || 75;
            return sx >= bounds.xStart && sx < bounds.xEnd && sy >= bounds.yStart && sy < bounds.yEnd;
        });
    };

    const renderStaffOnFloor = (room: ShopRoom) => {
        const staffList = getStaffInRoom(room);
        if (staffList.length === 0) return null;
        return <>
            {staffList.map((s, i) => {
                const isOwnerVisiting = visitor && s.ownerCharId === visitor.char.id;
                return (
                    <div
                        key={s.id}
                        className={`absolute z-20 flex flex-col items-center cursor-pointer transition-all duration-500 ${isOwnerVisiting ? 'animate-bounce' : ''}`}
                        style={{
                            left: `${30 + (i * 15) % 40}%`,
                            top: `${25 + (i * 10) % 30}%`,
                            transform: 'translate(-50%, -50%)',
                        }}
                        onClick={(e) => { e.stopPropagation(); onStaffClick?.(s); }}
                    >
                        {s.fatigue > 80 && <span className="text-[8px] animate-pulse">💤</span>}
                        {isOwnerVisiting && <span className="text-[8px] animate-ping">💕</span>}
                        <span className="text-xl drop-shadow-md">
                            {s.avatar.startsWith('http') || s.avatar.startsWith('data')
                                ? <img src={s.avatar} className="w-6 h-6 rounded object-cover" />
                                : s.avatar}
                        </span>
                        <span className="text-[5px] font-bold text-[#5D4037] bg-white/80 px-1 rounded whitespace-nowrap mt-0.5">
                            {s.isPet && '🐾'}{s.name}
                        </span>
                    </div>
                );
            })}
        </>;
    };

    // ==========================================================
    // ZOOMED VIEW
    // ==========================================================
    if (zoomedRoom) {
        return (
            <div className="relative w-full h-[65vh] overflow-hidden select-none flex flex-col" style={{ background: '#F5F0EA' }}>
                {/* Centered large room */}
                <div className="flex-1 flex items-center justify-center relative">
                    <IsoRoom
                        room={zoomedRoom}
                        width={280}
                        height={200}
                        floorDepth={70}
                        isZoomed={true}
                        onDoubleClick={() => {}}
                        onClick={(e) => {
                            if (zoomedRoom.unlocked && placingSticker) handleStickerPlace(e, zoomedRoom);
                            else if (zoomedRoom.unlocked) handleFloorClick(e, zoomedRoom);
                        }}
                        onUnlock={() => onUnlockRoom?.(zoomedRoom.id)}
                        onRemoveSticker={(id) => handleRemoveSticker(zoomedRoom, id)}
                        staffElements={renderStaffOnFloor(zoomedRoom)}
                        placingSticker={placingSticker}
                    />

                    {/* Visitor */}
                    {visitor && zoomedRoom.layer === 1 && (
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center animate-fade-in z-30 pointer-events-none">
                            <div className="bg-white/95 p-2 rounded-xl shadow-lg text-[10px] text-[#5D4037] max-w-[150px] border border-[#FFE0B2] mb-1">
                                {visitor.msg}
                            </div>
                            <img src={visitor.char.avatar} className="w-12 h-12 rounded-full object-cover shadow-xl border-2 border-white" />
                            <span className="text-[8px] font-bold text-white bg-[#8D6E63] px-2 py-0.5 rounded-full mt-1">{visitor.char.name}</span>
                        </div>
                    )}
                </div>

                {/* Top bar */}
                <div className="absolute top-3 left-3 right-3 z-40 flex items-center justify-between">
                    <button onClick={handleZoomOut}
                        className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl shadow-lg border border-slate-200 active:scale-95 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        <span className="text-xs font-bold text-slate-600">全景</span>
                    </button>
                    <div className="bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl shadow-lg border border-slate-200">
                        <span className="text-xs font-bold text-[#5D4037]">{zoomedRoom.name}</span>
                    </div>
                    {zoomedRoom.unlocked && (
                        <button onClick={() => setCustomizeTab(customizeTab ? null : 'wallpaper')}
                            className={`flex items-center gap-1 px-3 py-2 rounded-xl shadow-lg border transition-all active:scale-95 ${
                                customizeTab ? 'bg-[#FF7043] text-white border-[#E64A19]' : 'bg-white/90 border-slate-200 text-slate-600'
                            }`}>
                            <span className="text-sm">{customizeTab ? '✕' : '🎨'}</span>
                            <span className="text-xs font-bold">{customizeTab ? '关闭' : '装饰'}</span>
                        </button>
                    )}
                </div>

                {/* Placing hint */}
                {placingSticker && (
                    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-amber-100 border border-amber-300 px-4 py-2 rounded-xl shadow-lg">
                        <span className="text-xs font-bold text-amber-700">点击放置 {placingSticker}</span>
                        <button onClick={() => setPlacingSticker(null)} className="ml-2 text-amber-500">✕</button>
                    </div>
                )}

                {/* Customize panel */}
                {customizeTab && zoomedRoom.unlocked && (
                    <div className="absolute bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-2xl">
                        <div className="flex border-b border-slate-100">
                            {([
                                { key: 'wallpaper', label: '墙纸', icon: '🖼️' },
                                { key: 'floor', label: '地板', icon: '🪵' },
                                { key: 'stickers', label: '贴纸', icon: '⭐' },
                            ] as const).map(tab => (
                                <button key={tab.key}
                                    onClick={() => { setCustomizeTab(tab.key); setPlacingSticker(null); }}
                                    className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1 ${
                                        customizeTab === tab.key ? 'text-[#FF7043] border-b-2 border-[#FF7043]' : 'text-slate-400'
                                    }`}>
                                    <span>{tab.icon}</span><span>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {customizeTab === 'wallpaper' && (
                            <div className="p-3 overflow-x-auto no-scrollbar">
                                <div className="flex gap-2">
                                    {WALLPAPER_PRESETS.map(wp => (
                                        <button key={wp.id} onClick={() => handleApplyWallpaper(zoomedRoom, wp.value)}
                                            className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                                                zoomedRoom.wallpaper === wp.value ? 'ring-2 ring-[#FF7043] bg-orange-50' : 'hover:bg-slate-50'
                                            }`}>
                                            <div className="w-12 h-12 rounded-lg border border-slate-200 shadow-inner" style={{ background: wp.value }}/>
                                            <span className="text-[8px] font-bold text-slate-500">{wp.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {customizeTab === 'floor' && (
                            <div className="p-3 overflow-x-auto no-scrollbar">
                                <div className="flex gap-2">
                                    {FLOOR_PRESETS.map(fl => (
                                        <button key={fl.id} onClick={() => handleApplyFloor(zoomedRoom, fl.value)}
                                            className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                                                zoomedRoom.floor === fl.value ? 'ring-2 ring-[#FF7043] bg-orange-50' : 'hover:bg-slate-50'
                                            }`}>
                                            <div className="w-12 h-12 rounded-lg border border-slate-200 shadow-inner" style={{ background: fl.value }}/>
                                            <span className="text-[8px] font-bold text-slate-500">{fl.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {customizeTab === 'stickers' && (
                            <div className="p-3">
                                <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto no-scrollbar">
                                    {DECO_STICKERS.map((sticker, i) => (
                                        <button key={i} onClick={() => setPlacingSticker(sticker)}
                                            className={`w-10 h-10 flex items-center justify-center text-xl rounded-xl transition-all ${
                                                placingSticker === sticker ? 'bg-amber-100 ring-2 ring-amber-400 scale-110' : 'bg-slate-50 hover:bg-slate-100'
                                            }`}>{sticker}</button>
                                    ))}
                                </div>
                                {zoomedRoom.stickers.length > 0 && (
                                    <div className="mt-2 text-[9px] text-slate-400 text-center">
                                        已放置 {zoomedRoom.stickers.length} 个 · 点击贴纸可移除
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ==========================================================
    // OVERVIEW — Isometric Dollhouse
    // ==========================================================
    const layer2Rooms = rooms.filter(r => r.layer === 2);
    const layer1Rooms = rooms.filter(r => r.layer === 1);

    // Sizing (responsive to container)
    const CELL_W = 130;  // Width per half-room
    const WALL_H = 90;   // Wall height
    const FLOOR_D = 32;  // Floor depth
    const totalW = layer1Rooms.length === 1 ? CELL_W * 2 : CELL_W * 2;

    const getRoomWidth = (room: ShopRoom) => room.position === 'full' ? CELL_W * 2 : CELL_W;

    return (
        <div className="relative w-full h-[65vh] overflow-hidden select-none"
            style={{ background: 'linear-gradient(180deg, #F5E6D3 0%, #EDE0D0 50%, #E8D5BF 100%)' }}>

            {/* Isometric building container */}
            <div className="absolute left-1/2 top-[6%] -translate-x-1/2 flex flex-col items-center" style={{ perspective: 'none' }}>

                {/* === ROOF === */}
                <div className="relative" style={{ width: totalW + 20, height: 50 }}>
                    {/* Roof diamond shape */}
                    <div className="absolute inset-0" style={{
                        background: 'linear-gradient(180deg, #A1887F 0%, #8D6E63 100%)',
                        clipPath: `polygon(50% 0%, 102% 45%, 50% 90%, -2% 45%)`,
                    }}>
                        <div className="absolute inset-0 opacity-30" style={{
                            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 5px, rgba(255,255,255,0.15) 5px, rgba(255,255,255,0.15) 6px)',
                        }}/>
                    </div>
                    {/* Shop name */}
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10">
                        <div className="bg-[#5D4037]/90 px-3 py-0.5 rounded shadow-lg">
                            <span className="text-[7px] font-bold text-[#FFF8E1] tracking-wider">{shopState.shopName}</span>
                        </div>
                    </div>
                </div>

                {/* === LAYER 2 (Upper Floor) === */}
                <div className="flex items-end justify-center" style={{ marginTop: -8 }}>
                    {layer2Rooms.map(room => (
                        <IsoRoom
                            key={room.id}
                            room={room}
                            width={getRoomWidth(room)}
                            height={WALL_H}
                            floorDepth={FLOOR_D}
                            isZoomed={false}
                            onDoubleClick={() => handleRoomDoubleClick(room.id)}
                            onClick={(e) => {
                                if (!room.unlocked) onUnlockRoom?.(room.id);
                                else handleFloorClick(e, room);
                            }}
                            onUnlock={() => onUnlockRoom?.(room.id)}
                            onRemoveSticker={(id) => handleRemoveSticker(room, id)}
                            staffElements={renderStaffOnFloor(room)}
                            placingSticker={null}
                        />
                    ))}
                </div>

                {/* Floor divider beam */}
                <div className="relative" style={{ width: totalW + 8, height: 8, marginTop: -2 }}>
                    <div className="absolute inset-0" style={{
                        background: 'linear-gradient(180deg, #8D6E63, #6D4C41)',
                        clipPath: 'polygon(0% 0%, 100% 0%, 98% 100%, 2% 100%)',
                    }}/>
                </div>

                {/* === LAYER 1 (Ground Floor) === */}
                <div className="flex items-end justify-center" style={{ marginTop: -2 }}>
                    {layer1Rooms.map(room => (
                        <IsoRoom
                            key={room.id}
                            room={room}
                            width={getRoomWidth(room)}
                            height={WALL_H}
                            floorDepth={FLOOR_D}
                            isZoomed={false}
                            onDoubleClick={() => handleRoomDoubleClick(room.id)}
                            onClick={(e) => {
                                if (!room.unlocked) onUnlockRoom?.(room.id);
                                else handleFloorClick(e, room);
                            }}
                            onUnlock={() => onUnlockRoom?.(room.id)}
                            onRemoveSticker={(id) => handleRemoveSticker(room, id)}
                            staffElements={renderStaffOnFloor(room)}
                            placingSticker={null}
                        />
                    ))}
                </div>

                {/* Ground / Base platform */}
                <div className="relative" style={{ width: totalW + 20, height: 20, marginTop: -4 }}>
                    <div className="absolute inset-0" style={{
                        background: 'linear-gradient(180deg, #6D4C41, #5D4037)',
                        clipPath: 'polygon(4% 0%, 96% 0%, 100% 100%, 0% 100%)',
                        borderRadius: '0 0 4px 4px',
                    }}/>
                </div>
            </div>

            {/* Visitor at entrance */}
            {visitor && (
                <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 flex flex-col items-center animate-fade-in z-30 pointer-events-none">
                    <div className={`bg-white/95 p-2 rounded-xl shadow-lg text-[9px] text-[#5D4037] max-w-[100px] border mb-1 ${
                        getVisitorPet(visitor.char.id) ? 'border-pink-300' : 'border-[#FFE0B2]'
                    }`}>
                        {getVisitorPet(visitor.char.id) && <span className="absolute -top-2 -right-2 text-sm animate-bounce">💕</span>}
                        {visitor.msg}
                    </div>
                    <img src={visitor.char.avatar} className="w-10 h-10 rounded-full object-cover shadow-xl border-2 border-white" />
                    <span className="text-[7px] font-bold text-white bg-[#8D6E63] px-2 py-0.5 rounded-full mt-0.5">{visitor.char.name}</span>
                </div>
            )}

            {/* Love Effect */}
            {showLoveEffect && (
                <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
                    {[...Array(15)].map((_, i) => (
                        <div key={i} className="absolute text-xl animate-float-up"
                            style={{ left: `${10 + Math.random() * 80}%`, animationDelay: `${Math.random() * 2}s`, animationDuration: `${2 + Math.random() * 2}s` }}>
                            {['💕', '💗', '💖'][Math.floor(Math.random() * 3)]}
                        </div>
                    ))}
                </div>
            )}

            {/* HUD */}
            {/* Appeal */}
            <div className="absolute top-3 left-3 z-40">
                <div className="bg-white/70 backdrop-blur-xl px-2.5 py-1.5 rounded-xl shadow-lg border border-white/50 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#FFD54F] to-[#FFB300] flex items-center justify-center shadow-md">
                        <span className="text-xs">✨</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[7px] text-[#8D6E63] font-medium uppercase tracking-wider">人气</span>
                        <span className="text-sm font-black text-[#5D4037] leading-none">{shopState.appeal}</span>
                    </div>
                </div>
            </div>

            {/* Guestbook */}
            <button onClick={(e) => { e.stopPropagation(); onOpenGuestbook(); }}
                className="absolute top-3 right-3 z-40 group hover:scale-105 active:scale-95 transition-all">
                <div className="relative bg-gradient-to-b from-[#6D4C41] to-[#5D4037] w-11 h-13 rounded-xl shadow-xl flex flex-col items-center justify-center gap-0.5 border border-[#8D6E63]/50 p-2">
                    <span className="text-lg">📖</span>
                    <span className="text-[5px] font-bold text-[#D7CCC8]">情报志</span>
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-pulse"/>
                </div>
            </button>

            {/* Invite */}
            <div className="absolute bottom-[8%] right-3 z-40">
                <button onClick={(e) => { e.stopPropagation(); handleInvite(); }} disabled={isInviting} className="relative group">
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center shadow-xl transition-all ${
                        isInviting ? 'bg-[#BDBDBD]' : 'bg-gradient-to-br from-[#FF8A65] to-[#E64A19] hover:scale-110 active:scale-95'
                    }`}>
                        {isInviting
                            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                            : <span className="text-xl">🛎️</span>
                        }
                    </div>
                    <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[7px] font-bold text-[#5D4037]/60 bg-white/50 px-1.5 rounded-full whitespace-nowrap">招揽客人</span>
                </button>
            </div>

            {/* Hint */}
            <div className="absolute bottom-[8%] left-3 z-40">
                <div className="bg-white/60 backdrop-blur-sm px-2.5 py-1 rounded-xl text-[7px] text-[#8D6E63] font-medium border border-white/30">
                    双击房间放大装饰
                </div>
            </div>
        </div>
    );
};

export default BankShopScene;
