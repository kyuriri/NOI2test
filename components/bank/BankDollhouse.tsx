import React, { useState, useCallback, useEffect } from 'react';
import {
    BankShopState, DollhouseState, DollhouseRoom, DollhouseSticker,
    ShopStaff, CharacterProfile, UserProfile, APIConfig, RoomLayout
} from '../../types';
import {
    ROOM_LAYOUTS, WALLPAPER_PRESETS, FLOOR_PRESETS, STICKER_LIBRARY, INITIAL_DOLLHOUSE
} from './BankGameConstants';
import { useOS } from '../../context/OSContext';

// ==================== CONSTANTS ====================
const ROOM_UNLOCK_COSTS: Record<string, number> = {
    'room-1f-left': 0,
    'room-1f-right': 120,
    'room-2f-left': 200,
    'room-2f-right': 300,
};

const MAIN_ROOM_ID = 'room-1f-left';
const FLOOR_H_RATIO = 0.3;   // bottom 30% is walkable floor
const WALL_H_RATIO = 0.7;    // top 70% is wall backdrop
const ROOM_GAP = 6;

// ==================== PROPS ====================
interface Props {
    shopState: BankShopState;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: APIConfig;
    updateState: (s: BankShopState) => Promise<void>;
    onStaffClick?: (staff: ShopStaff) => void;
    onOpenGuestbook: () => void;
}

// ==================== COMPONENT ====================
const BankDollhouse: React.FC<Props> = ({
    shopState, characters, userProfile, apiConfig, updateState,
    onStaffClick, onOpenGuestbook
}) => {
    const { addToast } = useOS();
    const dollhouse = shopState.dollhouse || INITIAL_DOLLHOUSE;

    // --- State ---
    const [zoomedRoomId, setZoomedRoomId] = useState<string | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [editMode, setEditMode] = useState<'none' | 'sticker' | 'wallpaper' | 'floor'>('none');
    const [editSurface, setEditSurface] = useState<'floor' | 'leftWall' | 'rightWall'>('floor');
    const [draggingSticker, setDraggingSticker] = useState<DollhouseSticker | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [showUnlockConfirm, setShowUnlockConfirm] = useState<string | null>(null);
    const [showLayoutPicker, setShowLayoutPicker] = useState<string | null>(null);
    const [stickerTab, setStickerTab] = useState<string>('decor');

    // --- Helpers ---
    const getDollhouse = (): DollhouseState => shopState.dollhouse || INITIAL_DOLLHOUSE;

    const saveDollhouse = async (newDH: DollhouseState) => {
        await updateState({ ...shopState, dollhouse: newDH });
    };

    const getRoom = (id: string): DollhouseRoom | undefined => getDollhouse().rooms.find(r => r.id === id);
    const getLayout = (layoutId: string): RoomLayout | undefined => ROOM_LAYOUTS.find(l => l.id === layoutId);

    // --- Zoom (double-tap to fill screen) ---
    const handleRoomTap = (roomId: string) => {
        const room = getRoom(roomId);
        if (!room || !room.isUnlocked || isAnimating) return;
        setIsAnimating(true);
        setZoomedRoomId(roomId);
        setTimeout(() => setIsAnimating(false), 400);
    };

    const handleZoomOut = () => {
        if (isAnimating) return;
        setIsAnimating(true);
        setEditMode('none');
        setZoomedRoomId(null);
        setTimeout(() => setIsAnimating(false), 400);
    };

    // --- Unlock Room ---
    const handleUnlockRoom = async (roomId: string) => {
        const cost = ROOM_UNLOCK_COSTS[roomId] || 150;
        if (shopState.actionPoints < cost) {
            addToast(`AP 不足 (需 ${cost})`, 'error');
            return;
        }
        const dh = getDollhouse();
        const newRooms = dh.rooms.map(r =>
            r.id === roomId ? {
                ...r,
                isUnlocked: true,
                wallpaperLeft: 'linear-gradient(180deg, #FEF9F0, #F5EBD8)',
                wallpaperRight: 'linear-gradient(180deg, #FEF9F0, #F5EBD8)',
                floorStyle: 'linear-gradient(135deg, #C4A77D, #B8956E)',
            } : r
        );
        await updateState({
            ...shopState,
            actionPoints: shopState.actionPoints - cost,
            dollhouse: { ...dh, rooms: newRooms }
        });
        setShowUnlockConfirm(null);
        addToast(`房间已解锁！-${cost} AP`, 'success');
    };

    // --- Change Layout ---
    const handleChangeLayout = async (roomId: string, layoutId: string) => {
        const layout = getLayout(layoutId);
        if (!layout) return;
        if (layout.apCost > 0 && shopState.actionPoints < layout.apCost) {
            addToast(`AP 不足 (需 ${layout.apCost})`, 'error');
            return;
        }
        const dh = getDollhouse();
        const newRooms = dh.rooms.map(r =>
            r.id === roomId ? { ...r, layoutId } : r
        );
        const apCost = layout.apCost > 0 ? layout.apCost : 0;
        await updateState({
            ...shopState,
            actionPoints: shopState.actionPoints - apCost,
            dollhouse: { ...dh, rooms: newRooms }
        });
        setShowLayoutPicker(null);
        if (apCost > 0) addToast(`房型已更换！-${apCost} AP`, 'success');
        else addToast('房型已更换！', 'success');
    };

    // --- Wallpaper / Floor ---
    const handleSetWallpaper = async (roomId: string, surface: 'leftWall' | 'rightWall', style: string) => {
        const dh = getDollhouse();
        const newRooms = dh.rooms.map(r => {
            if (r.id !== roomId) return r;
            if (surface === 'leftWall') return { ...r, wallpaperLeft: style };
            return { ...r, wallpaperRight: style };
        });
        await saveDollhouse({ ...dh, rooms: newRooms });
    };

    const handleSetFloor = async (roomId: string, style: string) => {
        const dh = getDollhouse();
        const newRooms = dh.rooms.map(r =>
            r.id === roomId ? { ...r, floorStyle: style } : r
        );
        await saveDollhouse({ ...dh, rooms: newRooms });
    };

    // --- Stickers ---
    const handleAddSticker = async (roomId: string, stickerUrl: string, surface: 'floor' | 'leftWall' | 'rightWall') => {
        const dh = getDollhouse();
        const newSticker: DollhouseSticker = {
            id: `stk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            url: stickerUrl,
            x: 50,
            y: 50,
            scale: 1,
            rotation: 0,
            zIndex: 10,
            surface,
        };
        const newRooms = dh.rooms.map(r =>
            r.id === roomId ? { ...r, stickers: [...r.stickers, newSticker] } : r
        );
        await saveDollhouse({ ...dh, rooms: newRooms });
    };

    const handleUpdateSticker = async (roomId: string, stickerId: string, updates: Partial<DollhouseSticker>) => {
        const dh = getDollhouse();
        const newRooms = dh.rooms.map(r => {
            if (r.id !== roomId) return r;
            return {
                ...r,
                stickers: r.stickers.map(s => s.id === stickerId ? { ...s, ...updates } : s)
            };
        });
        await saveDollhouse({ ...dh, rooms: newRooms });
    };

    const handleDeleteSticker = async (roomId: string, stickerId: string) => {
        const dh = getDollhouse();
        const newRooms = dh.rooms.map(r => {
            if (r.id !== roomId) return r;
            return { ...r, stickers: r.stickers.filter(s => s.id !== stickerId) };
        });
        await saveDollhouse({ ...dh, rooms: newRooms });
    };

    // --- Staff movement (room-local coordinates) ---
    const handleFloorClick = (roomId: string, e: React.MouseEvent<HTMLDivElement>) => {
        if (editMode !== 'none') return;
        const room = getRoom(roomId);
        if (!room || !room.isUnlocked) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const xPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
        const yPct = Math.max(10, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));

        const staffInRoom = shopState.staff.filter(s => {
            const dh = getDollhouse();
            const r = dh.rooms.find(rm => rm.staffIds.includes(s.id));
            return r?.id === roomId;
        });
        const staffToMove = staffInRoom[0] || shopState.staff[0];
        if (!staffToMove) return;

        const dh = getDollhouse();
        const needsRoomAssign = !dh.rooms.some(r => r.staffIds.includes(staffToMove.id) && r.id === roomId);

        const newStaff = shopState.staff.map(s =>
            s.id === staffToMove.id ? { ...s, x: xPct, y: yPct } : s
        );

        let newRooms = dh.rooms;
        if (needsRoomAssign) {
            newRooms = dh.rooms.map(r => ({
                ...r,
                staffIds: r.id === roomId
                    ? [...r.staffIds.filter(id => id !== staffToMove.id), staffToMove.id]
                    : r.staffIds.filter(id => id !== staffToMove.id)
            }));
        }

        updateState({
            ...shopState,
            staff: newStaff,
            dollhouse: { ...dh, rooms: newRooms }
        });
    };

    // --- Sticker drag (room-local) ---
    const handleStickerDragStart = (sticker: DollhouseSticker, e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setDraggingSticker(sticker);
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        setDragOffset({ x: clientX, y: clientY });
    };

    const handleStickerDragMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!draggingSticker || !zoomedRoomId) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const dx = clientX - dragOffset.x;
        const dy = clientY - dragOffset.y;
        setDragOffset({ x: clientX, y: clientY });

        const surfaceEl = document.getElementById(`surface-${draggingSticker.surface}-${zoomedRoomId}`);
        if (!surfaceEl) return;
        const rect = surfaceEl.getBoundingClientRect();
        const dxPct = (dx / rect.width) * 100;
        const dyPct = (dy / rect.height) * 100;

        const newX = Math.max(0, Math.min(100, draggingSticker.x + dxPct));
        const newY = Math.max(0, Math.min(100, draggingSticker.y + dyPct));

        handleUpdateSticker(zoomedRoomId, draggingSticker.id, { x: newX, y: newY });
        setDraggingSticker({ ...draggingSticker, x: newX, y: newY });
    }, [draggingSticker, dragOffset, zoomedRoomId]);

    const handleStickerDragEnd = useCallback(() => {
        setDraggingSticker(null);
    }, []);

    useEffect(() => {
        if (draggingSticker) {
            window.addEventListener('mousemove', handleStickerDragMove);
            window.addEventListener('mouseup', handleStickerDragEnd);
            window.addEventListener('touchmove', handleStickerDragMove);
            window.addEventListener('touchend', handleStickerDragEnd);
            return () => {
                window.removeEventListener('mousemove', handleStickerDragMove);
                window.removeEventListener('mouseup', handleStickerDragEnd);
                window.removeEventListener('touchmove', handleStickerDragMove);
                window.removeEventListener('touchend', handleStickerDragEnd);
            };
        }
    }, [draggingSticker, handleStickerDragMove, handleStickerDragEnd]);

    // ==================== ROOM MODULE RENDERER ====================
    // Each room is an independent module with its own local coordinate system.
    // Layers (bottom to top): floor -> wall -> sticker_layer -> character_layer

    const renderRoomModule = (room: DollhouseRoom, isActive: boolean) => {
        const layout = getLayout(room.layoutId) || ROOM_LAYOUTS[0];
        const locked = !room.isUnlocked;
        const isOtherRoom = zoomedRoomId !== null && zoomedRoomId !== room.id;

        // Styles
        const leftWall = room.wallpaperLeft || 'linear-gradient(180deg, #F8F6F0, #EBE5D8)';
        const rightWall = room.wallpaperRight || 'linear-gradient(180deg, #EFEDE6, #E0DCD0)';
        const floorBg = room.floorStyle || 'linear-gradient(135deg, #E8E4D8, #D8D4C8)';

        // Staff in this room
        const roomStaff = shopState.staff.filter(s => {
            const dh = getDollhouse();
            const r = dh.rooms.find(rm => rm.staffIds.includes(s.id));
            if (r) return r.id === room.id;
            if (room.id === MAIN_ROOM_ID && !dh.rooms.some(rm => rm.staffIds.includes(s.id))) return true;
            return false;
        });

        // Render stickers on a given surface
        const renderStickers = (surface: 'floor' | 'leftWall' | 'rightWall') => {
            return room.stickers.filter(s => s.surface === surface).map(sticker => (
                <div
                    key={sticker.id}
                    className={`absolute select-none ${isActive ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingSticker?.id === sticker.id ? 'z-50 opacity-80' : ''}`}
                    style={{
                        left: `${sticker.x}%`,
                        top: `${sticker.y}%`,
                        transform: `translate(-50%, -50%) scale(${sticker.scale * (isActive ? 1.4 : 0.9)}) rotate(${sticker.rotation}deg)`,
                        zIndex: sticker.zIndex,
                        fontSize: isActive ? '1.6rem' : '0.85rem',
                    }}
                    onMouseDown={(e) => isActive && editMode === 'sticker' && handleStickerDragStart(sticker, e)}
                    onTouchStart={(e) => isActive && editMode === 'sticker' && handleStickerDragStart(sticker, e)}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (isActive && editMode === 'sticker') {
                            handleDeleteSticker(room.id, sticker.id);
                        }
                    }}
                >
                    {sticker.url.startsWith('http') || sticker.url.startsWith('data')
                        ? <img src={sticker.url} className="object-contain pointer-events-none" style={{ width: isActive ? 32 : 16, height: isActive ? 32 : 16 }} />
                        : sticker.url
                    }
                </div>
            ));
        };

        // Render character layer (staff on walkable area)
        const renderCharacters = () => {
            if (locked) return null;
            return roomStaff.map((staff) => {
                const sx = staff.x || 50;
                const sy = staff.y || 60;
                return (
                    <div
                        key={staff.id}
                        className="absolute transition-all duration-700 ease-in-out cursor-pointer group"
                        style={{
                            left: `${sx}%`,
                            top: `${sy}%`,
                            transform: 'translate(-50%, -100%)',
                            zIndex: 30,
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onStaffClick?.(staff);
                        }}
                    >
                        <div className="relative">
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-black/10 rounded-full blur-[2px]"
                                style={{ width: isActive ? 20 : 10, height: isActive ? 6 : 3 }} />
                            {staff.fatigue > 80 && <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs animate-bounce">💤</div>}
                            <div className={`filter drop-shadow-md transform group-hover:scale-110 transition-transform ${isActive ? 'text-3xl' : 'text-base'}`}>
                                {staff.avatar.startsWith('http') || staff.avatar.startsWith('data')
                                    ? <img src={staff.avatar} className={`object-contain rounded-lg ${isActive ? 'w-10 h-10' : 'w-5 h-5'}`} />
                                    : staff.avatar
                                }
                            </div>
                            <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white/90 backdrop-blur-sm rounded-full border border-slate-200 shadow-sm ${isActive ? 'text-[9px] px-2 py-0.5' : 'text-[6px] px-1 py-px'}`}>
                                {staff.isPet && <span className="mr-0.5">🐾</span>}
                                {staff.name}
                            </div>
                        </div>
                    </div>
                );
            });
        };

        const floorH = `${FLOOR_H_RATIO * 100}%`;
        const wallH = `${WALL_H_RATIO * 100}%`;

        return (
            <div
                className={`relative w-full h-full select-none overflow-hidden transition-all duration-300 ease-in-out ${
                    isOtherRoom ? 'opacity-0 pointer-events-none' : 'opacity-100'
                } ${locked ? 'cursor-pointer' : ''}`}
                style={{
                    borderRadius: isActive ? 0 : 8,
                    boxShadow: isActive
                        ? 'none'
                        : '0 2px 12px rgba(93,64,55,0.12), inset 0 0 0 1px rgba(141,110,99,0.15)',
                }}
                onDoubleClick={() => !locked && !isActive && handleRoomTap(room.id)}
                onClick={() => locked && setShowUnlockConfirm(room.id)}
            >
                {/* ====== LAYER 1: WALL BACKDROP ====== */}
                <div className="absolute top-0 left-0 right-0" style={{ height: wallH }}>
                    {/* Left wall half */}
                    <div
                        id={`surface-leftWall-${room.id}`}
                        className="absolute top-0 left-0 overflow-hidden"
                        style={{
                            width: '50%',
                            height: '100%',
                            background: locked ? 'linear-gradient(180deg, #F0F0F0, #E0E0E0)' : leftWall,
                        }}
                    >
                        <div className="absolute inset-0" style={{
                            background: 'linear-gradient(to right, rgba(0,0,0,0.04), rgba(0,0,0,0.01))',
                        }} />
                        <div className="absolute inset-0 opacity-[0.04]" style={{
                            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.3) 1px, transparent 1px)',
                            backgroundSize: isActive ? '14px 14px' : '8px 8px',
                        }} />
                        {!locked && layout.hasWindow && (
                            <div className="absolute overflow-hidden" style={{
                                top: '15%', left: '15%', width: '60%', height: '45%',
                                borderRadius: isActive ? 6 : 3,
                                border: `${isActive ? 3 : 2}px solid #A09080`,
                            }}>
                                <div className="w-full h-full" style={{
                                    background: 'linear-gradient(135deg, #D4EAFC, #A8D4F0, #7EC8E3)',
                                }}>
                                    <div className="absolute inset-0" style={{
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 60%)',
                                    }} />
                                    <div className="absolute top-1/2 left-0 w-full bg-[#A09080]" style={{ height: isActive ? 2 : 1 }} />
                                    <div className="absolute top-0 left-1/2 h-full bg-[#A09080]" style={{ width: isActive ? 2 : 1 }} />
                                </div>
                            </div>
                        )}
                        {!locked && renderStickers('leftWall')}
                    </div>

                    {/* Right wall half */}
                    <div
                        id={`surface-rightWall-${room.id}`}
                        className="absolute top-0 right-0 overflow-hidden"
                        style={{
                            width: '50%',
                            height: '100%',
                            background: locked ? 'linear-gradient(180deg, #E8E8E8, #D8D8D8)' : rightWall,
                        }}
                    >
                        <div className="absolute inset-0" style={{
                            background: 'linear-gradient(to left, rgba(0,0,0,0.03), rgba(0,0,0,0.06))',
                        }} />
                        <div className="absolute inset-0 opacity-[0.04]" style={{
                            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.3) 1px, transparent 1px)',
                            backgroundSize: isActive ? '14px 14px' : '8px 8px',
                        }} />
                        {!locked && renderStickers('rightWall')}
                    </div>

                    {/* Center seam */}
                    <div className="absolute top-0 left-1/2 h-full" style={{
                        width: 1,
                        background: 'rgba(120,100,80,0.15)',
                        transform: 'translateX(-0.5px)',
                    }} />
                </div>

                {/* ====== LAYER 2: FLOOR ====== */}
                <div
                    id={`surface-floor-${room.id}`}
                    className="absolute left-0 right-0 bottom-0 overflow-hidden"
                    style={{
                        height: floorH,
                        background: locked ? 'linear-gradient(135deg, #E0E0E0, #D0D0D0)' : floorBg,
                        borderTop: '2px solid rgba(120,100,80,0.2)',
                    }}
                    onClick={(e) => !locked && !isOtherRoom && handleFloorClick(room.id, e)}
                >
                    <div className="absolute inset-0 opacity-[0.08]" style={{
                        backgroundImage: `
                            linear-gradient(0deg, rgba(0,0,0,0.2) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,0,0,0.2) 1px, transparent 1px)
                        `,
                        backgroundSize: isActive ? '24px 24px' : '14px 14px',
                    }} />
                    {!locked && layout.hasCounter && (
                        <div className="absolute" style={{
                            width: '35%',
                            height: isActive ? 14 : 8,
                            left: '10%',
                            top: '15%',
                            background: 'linear-gradient(180deg, #6D4C41, #4E342E)',
                            border: '1px solid #3E2723',
                            borderRadius: 2,
                        }} />
                    )}
                    {!locked && renderStickers('floor')}
                </div>

                {/* ====== LAYER 3: CHARACTER LAYER ====== */}
                <div
                    className="absolute left-0 right-0 bottom-0 pointer-events-none"
                    style={{ height: floorH }}
                >
                    <div className="relative w-full h-full pointer-events-auto">
                        {renderCharacters()}
                    </div>
                </div>

                {/* ====== LOCK OVERLAY ====== */}
                {locked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-black/5">
                        <div className="bg-white/70 backdrop-blur-[2px] rounded-xl px-3 py-2 flex flex-col items-center shadow-lg">
                            <div className="text-2xl mb-0.5">🔒</div>
                            <div className="text-[9px] font-bold text-slate-500">{ROOM_UNLOCK_COSTS[room.id] || 150} AP</div>
                            <div className="text-[7px] text-slate-400">点击解锁</div>
                        </div>
                    </div>
                )}

                {/* ====== ROOM NAME LABEL ====== */}
                <div className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${isActive ? 'text-[11px]' : 'text-[8px]'} font-bold ${locked ? 'text-slate-400' : 'text-[#8D6E63]'} bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-full border ${locked ? 'border-slate-200' : 'border-[#E8DCC8]'} shadow-sm z-40`}
                    style={{ top: 4 }}>
                    {layout.icon} {room.name}
                </div>
            </div>
        );
    };

    // ==================== SCENE LAYOUT ====================
    // Mobile-first vertical layout:
    //   - Main room (大厅): full-width, taller
    //   - Sub-rooms: 2-column grid, smaller
    // When zoomed: selected room fills entire container

    const dh = getDollhouse();
    const zoomedRoom = zoomedRoomId ? getRoom(zoomedRoomId) : null;
    const mainRoom = dh.rooms.find(r => r.id === MAIN_ROOM_ID);
    const subRooms = dh.rooms.filter(r => r.id !== MAIN_ROOM_ID);

    return (
        <div
            className="relative w-full overflow-hidden select-none"
            style={{
                height: '65vh',
                background: 'linear-gradient(180deg, #FEF7E8 0%, #FDF2DC 40%, #E8DCC8 100%)',
            }}
        >
            {/* === ZOOMED VIEW: room fills entire container === */}
            {zoomedRoomId && zoomedRoom && (
                <div className="absolute inset-0 z-30 transition-all duration-300">
                    {renderRoomModule(zoomedRoom, true)}
                </div>
            )}

            {/* === OVERVIEW: scrollable vertical layout === */}
            {!zoomedRoomId && (
                <div
                    className="absolute inset-0 overflow-y-auto overflow-x-hidden px-3 pt-12 pb-3"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    <div className="flex flex-col" style={{ gap: ROOM_GAP }}>
                        {/* Main room - full width, taller */}
                        {mainRoom && (
                            <div style={{ width: '100%', height: 200 }}>
                                {renderRoomModule(mainRoom, false)}
                            </div>
                        )}

                        {/* Sub-rooms - 2-column grid, shorter */}
                        <div className="grid grid-cols-2" style={{ gap: ROOM_GAP }}>
                            {subRooms.map(room => (
                                <div key={room.id} style={{ height: 140 }}>
                                    {renderRoomModule(room, false)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* === HUD: Top-left Appeal === */}
            <div className="absolute top-3 left-3 z-40">
                <div className="bg-white/70 backdrop-blur-xl px-3 py-1.5 rounded-xl shadow-lg border border-white/50 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FFD54F] to-[#FFB300] flex items-center justify-center shadow-md">
                        <span className="text-sm">✨</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[8px] text-[#8D6E63] font-medium uppercase tracking-wider">人气</span>
                        <span className="text-base font-black text-[#5D4037] leading-none">{shopState.appeal}</span>
                    </div>
                </div>
            </div>

            {/* === HUD: Top-right Guestbook === */}
            <button
                onClick={(e) => { e.stopPropagation(); onOpenGuestbook(); }}
                className="absolute top-3 right-3 z-40 group hover:scale-105 active:scale-95 transition-all"
            >
                <div className="bg-gradient-to-b from-[#6D4C41] to-[#5D4037] w-11 h-13 rounded-xl shadow-xl flex flex-col items-center justify-center gap-0.5 border border-[#8D6E63]/50 px-1 py-2">
                    <div className="text-lg">📖</div>
                    <div className="text-[6px] font-bold text-[#D7CCC8]">情报志</div>
                </div>
            </button>

            {/* === ZOOM OUT BUTTON === */}
            {zoomedRoomId && (
                <button
                    onClick={handleZoomOut}
                    className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-[#E8DCC8] flex items-center gap-2 hover:bg-white active:scale-95 transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-[#8D6E63]">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                    </svg>
                    <span className="text-xs font-bold text-[#5D4037]">返回全景</span>
                </button>
            )}

            {/* === EDIT TOOLBAR (when a room is focused) === */}
            {zoomedRoomId && zoomedRoom?.isUnlocked && (
                <div className="absolute bottom-3 left-3 right-3 z-50">
                    <div className="flex items-center gap-1.5 mb-2 justify-center">
                        {[
                            { mode: 'none' as const, icon: '👆', label: '浏览' },
                            { mode: 'sticker' as const, icon: '🎨', label: '贴纸' },
                            { mode: 'wallpaper' as const, icon: '🖼️', label: '墙纸' },
                            { mode: 'floor' as const, icon: '🪵', label: '地板' },
                        ].map(item => (
                            <button
                                key={item.mode}
                                onClick={() => setEditMode(item.mode)}
                                className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                    editMode === item.mode
                                        ? 'bg-[#5D4037] text-white shadow-lg scale-105'
                                        : 'bg-white/80 text-[#8D6E63] shadow-sm hover:bg-white'
                                }`}
                            >
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                            </button>
                        ))}
                        <button
                            onClick={() => setShowLayoutPicker(zoomedRoomId)}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-white/80 text-[#8D6E63] shadow-sm hover:bg-white transition-all"
                        >
                            <span>🏠</span>
                            <span>房型</span>
                        </button>
                    </div>

                    {editMode === 'sticker' && (
                        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-[#E8DCC8] p-3 max-h-[35vh] overflow-y-auto">
                            <div className="flex gap-1 mb-2">
                                {(['floor', 'leftWall', 'rightWall'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setEditSurface(s)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                            editSurface === s ? 'bg-[#5D4037] text-white' : 'bg-[#FDF6E3] text-[#8D6E63]'
                                        }`}
                                    >
                                        {s === 'floor' ? '地板' : s === 'leftWall' ? '左墙' : '右墙'}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-1 mb-2 overflow-x-auto no-scrollbar">
                                {['decor', 'wall', 'furniture', 'food', 'floor', 'pet'].map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setStickerTab(cat)}
                                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap transition-all ${
                                            stickerTab === cat ? 'bg-[#FFE0B2] text-[#E65100]' : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {cat === 'decor' ? '装饰' : cat === 'wall' ? '墙饰' : cat === 'furniture' ? '家具' : cat === 'food' ? '食物' : cat === 'floor' ? '地面' : '宠物'}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-6 gap-2">
                                {STICKER_LIBRARY.filter(s => s.category === stickerTab).map(sticker => (
                                    <button
                                        key={sticker.id}
                                        onClick={() => handleAddSticker(zoomedRoomId!, sticker.url, editSurface)}
                                        className="w-10 h-10 rounded-xl bg-[#FDF6E3] hover:bg-[#FFE0B2] flex items-center justify-center text-xl transition-all hover:scale-110 active:scale-95 border border-[#E8DCC8]"
                                        title={sticker.name}
                                    >
                                        {sticker.url}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] text-center text-[#BCAAA4] mt-2">点击添加 | 拖拽移动 | 双击删除</p>
                        </div>
                    )}

                    {editMode === 'wallpaper' && (
                        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-[#E8DCC8] p-3">
                            <div className="flex gap-1 mb-2">
                                {(['leftWall', 'rightWall'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setEditSurface(s)}
                                        className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                            editSurface === s ? 'bg-[#5D4037] text-white' : 'bg-[#FDF6E3] text-[#8D6E63]'
                                        }`}
                                    >
                                        {s === 'leftWall' ? '左墙' : '右墙'}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {WALLPAPER_PRESETS.map(wp => (
                                    <button
                                        key={wp.id}
                                        onClick={() => handleSetWallpaper(
                                            zoomedRoomId!,
                                            editSurface === 'leftWall' ? 'leftWall' : 'rightWall',
                                            wp.style
                                        )}
                                        className="flex flex-col items-center gap-1 group"
                                    >
                                        <div
                                            className="w-12 h-12 rounded-lg border-2 border-[#E8DCC8] group-hover:border-[#FF7043] transition-all shadow-sm group-hover:scale-105"
                                            style={{ background: wp.style }}
                                        />
                                        <span className="text-[8px] text-[#8D6E63] font-medium">{wp.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {editMode === 'floor' && (
                        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-[#E8DCC8] p-3">
                            <div className="grid grid-cols-3 gap-2">
                                {FLOOR_PRESETS.map(fl => (
                                    <button
                                        key={fl.id}
                                        onClick={() => handleSetFloor(zoomedRoomId!, fl.style)}
                                        className="flex flex-col items-center gap-1 group"
                                    >
                                        <div
                                            className="w-14 h-10 rounded-lg border-2 border-[#E8DCC8] group-hover:border-[#FF7043] transition-all shadow-sm group-hover:scale-105"
                                            style={{ background: fl.style }}
                                        />
                                        <span className="text-[8px] text-[#8D6E63] font-medium">{fl.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* === UNLOCK CONFIRM MODAL === */}
            {showUnlockConfirm && (() => {
                const room = getRoom(showUnlockConfirm);
                const cost = ROOM_UNLOCK_COSTS[showUnlockConfirm] || 150;
                return (
                    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
                         onClick={() => setShowUnlockConfirm(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl p-5 mx-6 max-w-[280px] w-full"
                             onClick={e => e.stopPropagation()}>
                            <div className="text-center mb-4">
                                <div className="text-4xl mb-2">🔓</div>
                                <h3 className="font-bold text-lg text-[#5D4037]">解锁 {room?.name || '新房间'}？</h3>
                                <p className="text-xs text-[#A1887F] mt-1">
                                    消耗 <span className="font-bold text-[#FF7043]">{cost} AP</span> 解锁这个空间
                                </p>
                                <p className="text-[10px] text-[#BCAAA4] mt-1">
                                    当前 AP: {shopState.actionPoints}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowUnlockConfirm(null)}
                                    className="flex-1 py-3 rounded-xl bg-[#EFEBE9] text-[#8D6E63] font-bold text-sm active:scale-95 transition-all"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => handleUnlockRoom(showUnlockConfirm)}
                                    disabled={shopState.actionPoints < cost}
                                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                                        shopState.actionPoints >= cost
                                            ? 'bg-gradient-to-r from-[#FF8A65] to-[#FF7043] text-white shadow-lg active:scale-95'
                                            : 'bg-slate-200 text-slate-400'
                                    }`}
                                >
                                    解锁 ✨
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* === LAYOUT PICKER MODAL === */}
            {showLayoutPicker && (() => {
                const room = getRoom(showLayoutPicker);
                return (
                    <div className="absolute inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-[2px]"
                         onClick={() => setShowLayoutPicker(null)}>
                        <div className="bg-white rounded-t-2xl shadow-2xl p-4 w-full max-h-[60%] overflow-y-auto"
                             onClick={e => e.stopPropagation()}>
                            <div className="text-center mb-3">
                                <h3 className="font-bold text-base text-[#5D4037]">🏠 更换房型</h3>
                                <p className="text-[10px] text-[#A1887F]">为「{room?.name}」选择新的布局</p>
                            </div>
                            <div className="space-y-2">
                                {ROOM_LAYOUTS.map(layout => {
                                    const isCurrent = room?.layoutId === layout.id;
                                    return (
                                        <button
                                            key={layout.id}
                                            onClick={() => !isCurrent && handleChangeLayout(showLayoutPicker, layout.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                                                isCurrent
                                                    ? 'bg-[#FFF3E0] border-2 border-[#FF7043]'
                                                    : 'bg-[#FDF6E3] border border-[#E8DCC8] hover:border-[#FFB74D]'
                                            }`}
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-2xl shadow-sm">
                                                {layout.icon}
                                            </div>
                                            <div className="flex-1 text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-[#5D4037]">{layout.name}</span>
                                                    {isCurrent && <span className="text-[8px] bg-[#FF7043] text-white px-1.5 py-0.5 rounded-full font-bold">当前</span>}
                                                </div>
                                                <p className="text-[10px] text-[#A1887F]">{layout.description}</p>
                                            </div>
                                            {layout.apCost > 0 && !isCurrent && (
                                                <div className="text-xs font-bold text-[#FF7043]">{layout.apCost} AP</div>
                                            )}
                                            {layout.apCost === 0 && !isCurrent && (
                                                <div className="text-xs font-bold text-green-500">免费</div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => setShowLayoutPicker(null)}
                                className="w-full mt-3 py-3 rounded-xl bg-[#EFEBE9] text-[#8D6E63] font-bold text-sm active:scale-95 transition-all"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default BankDollhouse;
