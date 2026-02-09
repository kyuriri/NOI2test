import React, { useMemo, useState } from 'react';
import {
    BankShopState, DollhouseState, DollhouseRoom, DollhouseSticker,
    ShopStaff, CharacterProfile, UserProfile, APIConfig, RoomLayout
} from '../../types';
import {
    ROOM_LAYOUTS, WALLPAPER_PRESETS, FLOOR_PRESETS, STICKER_LIBRARY, INITIAL_DOLLHOUSE
} from './BankGameConstants';
import { useOS } from '../../context/OSContext';

const ROOM_UNLOCK_COSTS: Record<string, number> = {
    'room-1f-left': 0,
    'room-1f-right': 120,
    'room-2f-left': 200,
    'room-2f-right': 300,
};

const MAIN_ROOM_ID = 'room-1f-left';
const FLOOR_H_RATIO = 0.3;
const WALL_H_RATIO = 0.7;

interface Props {
    shopState: BankShopState;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: APIConfig;
    updateState: (s: BankShopState) => Promise<void>;
    onStaffClick?: (staff: ShopStaff) => void;
    onOpenGuestbook: () => void;
}

const BankDollhouse: React.FC<Props> = ({
    shopState, updateState, onStaffClick, onOpenGuestbook
}) => {
    const { addToast } = useOS();
    const [editMode, setEditMode] = useState<'none' | 'sticker' | 'wallpaper' | 'floor'>('none');
    const [showUnlockConfirm, setShowUnlockConfirm] = useState<string | null>(null);
    const [showLayoutPicker, setShowLayoutPicker] = useState<string | null>(null);
    const [stickerTab, setStickerTab] = useState<string>('decor');
    const [showRoomMap, setShowRoomMap] = useState(false);

    const getDollhouse = (): DollhouseState => shopState.dollhouse || INITIAL_DOLLHOUSE;

    const saveDollhouse = async (newDH: DollhouseState) => {
        await updateState({ ...shopState, dollhouse: newDH });
    };

    const dh = getDollhouse();
    const normalizedRooms = useMemo(() => dh.rooms.map(room => (
        room.id === MAIN_ROOM_ID ? { ...room, name: '咖啡店' } : room
    )), [dh.rooms]);

    const roomOrder = ['room-2f-left', 'room-1f-left', 'room-1f-right', 'room-2f-right'];
    const orderedRooms = roomOrder
        .map(id => normalizedRooms.find(r => r.id === id))
        .filter((room): room is DollhouseRoom => Boolean(room));

    const [activeRoomId, setActiveRoomId] = useState<string>(MAIN_ROOM_ID);
    const activeRoom = orderedRooms.find(r => r.id === activeRoomId) || orderedRooms[0];
    const activeRoomIndex = orderedRooms.findIndex(r => r.id === activeRoom.id);

    const getLayout = (layoutId: string): RoomLayout | undefined => ROOM_LAYOUTS.find(l => l.id === layoutId);

    const handleUnlockRoom = async (roomId: string) => {
        const cost = ROOM_UNLOCK_COSTS[roomId] || 150;
        if (shopState.actionPoints < cost) {
            addToast(`AP 不足 (需 ${cost})`, 'error');
            return;
        }
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

    const handleRenameRoom = async (room: DollhouseRoom) => {
        if (room.id === MAIN_ROOM_ID) {
            addToast('初始房间固定为「咖啡店」', 'error');
            return;
        }
        const nextName = window.prompt('给房间起个新名字（最多10字）', room.name);
        if (!nextName) return;
        const name = nextName.trim().slice(0, 10);
        if (!name) return;
        await saveDollhouse({
            ...dh,
            rooms: dh.rooms.map(r => r.id === room.id ? { ...r, name } : r)
        });
        addToast('房间名已更新', 'success');
    };

    const handleFloorClick = (roomId: string, e: React.MouseEvent<HTMLDivElement>) => {
        if (editMode !== 'none') return;
        const room = dh.rooms.find(r => r.id === roomId);
        if (!room || !room.isUnlocked) return;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const xPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
        const yPct = Math.max(10, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));

        const staffInRoom = shopState.staff.filter(s => {
            const target = dh.rooms.find(rm => rm.staffIds.includes(s.id));
            return target?.id === roomId;
        });
        const staffToMove = staffInRoom[0] || shopState.staff[0];
        if (!staffToMove) return;

        const needsRoomAssign = !dh.rooms.some(r => r.staffIds.includes(staffToMove.id) && r.id === roomId);
        const newStaff = shopState.staff.map(s => s.id === staffToMove.id ? { ...s, x: xPct, y: yPct } : s);
        let newRooms = dh.rooms;

        if (needsRoomAssign) {
            newRooms = dh.rooms.map(r => ({
                ...r,
                staffIds: r.id === roomId
                    ? [...r.staffIds.filter(id => id !== staffToMove.id), staffToMove.id]
                    : r.staffIds.filter(id => id !== staffToMove.id)
            }));
        }

        updateState({ ...shopState, staff: newStaff, dollhouse: { ...dh, rooms: newRooms } });
    };

    const handleSetWallpaper = async (roomId: string, style: string) => {
        await saveDollhouse({
            ...dh,
            rooms: dh.rooms.map(r => r.id === roomId ? { ...r, wallpaperLeft: style, wallpaperRight: style } : r)
        });
    };

    const handleSetFloor = async (roomId: string, style: string) => {
        await saveDollhouse({
            ...dh,
            rooms: dh.rooms.map(r => r.id === roomId ? { ...r, floorStyle: style } : r)
        });
    };

    const handleAddSticker = async (roomId: string, stickerUrl: string, surface: 'floor' | 'leftWall') => {
        const newSticker: DollhouseSticker = {
            id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            url: stickerUrl,
            x: 50,
            y: 50,
            scale: 1,
            rotation: 0,
            zIndex: 10,
            surface,
        };
        await saveDollhouse({
            ...dh,
            rooms: dh.rooms.map(r => r.id === roomId ? { ...r, stickers: [...r.stickers, newSticker] } : r)
        });
    };

    const handleDeleteSticker = async (roomId: string, stickerId: string) => {
        await saveDollhouse({
            ...dh,
            rooms: dh.rooms.map(r => r.id === roomId ? { ...r, stickers: r.stickers.filter(s => s.id !== stickerId) } : r)
        });
    };

    const handleChangeLayout = async (roomId: string, layoutId: string) => {
        const layout = getLayout(layoutId);
        if (!layout) return;
        if (layout.apCost > 0 && shopState.actionPoints < layout.apCost) {
            addToast(`AP 不足 (需 ${layout.apCost})`, 'error');
            return;
        }

        await updateState({
            ...shopState,
            actionPoints: shopState.actionPoints - layout.apCost,
            dollhouse: {
                ...dh,
                rooms: dh.rooms.map(r => r.id === roomId ? { ...r, layoutId } : r)
            }
        });
        setShowLayoutPicker(null);
        addToast('房型已更换！', 'success');
    };

    const renderRoom = (room: DollhouseRoom) => {
        const locked = !room.isUnlocked;
        const layout = getLayout(room.layoutId) || ROOM_LAYOUTS[0];
        const wallBg = room.wallpaperLeft || room.wallpaperRight || 'linear-gradient(180deg, #FFF5E9, #FDE5D8)';
        const floorBg = room.floorStyle || 'linear-gradient(135deg, #D6B48C, #C69767)';

        const roomStaff = shopState.staff.filter(s => {
            const targetRoom = dh.rooms.find(rm => rm.staffIds.includes(s.id));
            if (targetRoom) return targetRoom.id === room.id;
            return room.id === MAIN_ROOM_ID;
        });

        const wallStickers = room.stickers.filter(s => s.surface === 'leftWall' || s.surface === 'rightWall');
        const floorStickers = room.stickers.filter(s => s.surface === 'floor');

        return (
            <div className="w-full rounded-[26px] overflow-hidden border-4 border-[#FFE7D2] shadow-[0_14px_40px_rgba(214,151,103,0.35)] bg-[#FFF9F4]">
                <div className="relative w-full" style={{ aspectRatio: '3 / 4' }}>
                    <div className="absolute left-0 right-0 top-0" style={{ height: `${WALL_H_RATIO * 100}%`, background: wallBg }}>
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1.5px, transparent 2px)', backgroundSize: '20px 20px' }} />
                        {!locked && wallStickers.map(sticker => (
                            <div
                                key={sticker.id}
                                className="absolute select-none cursor-pointer"
                                style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) scale(${sticker.scale})`, zIndex: sticker.zIndex, fontSize: '1.35rem' }}
                                onDoubleClick={() => handleDeleteSticker(room.id, sticker.id)}
                            >
                                {sticker.url}
                            </div>
                        ))}
                    </div>

                    <div
                        className="absolute left-0 right-0 bottom-0"
                        style={{ height: `${FLOOR_H_RATIO * 100}%`, background: floorBg, borderTop: '3px solid rgba(156,104,64,0.22)' }}
                        onClick={(e) => !locked && handleFloorClick(room.id, e)}
                    >
                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,0.2) 1px, transparent 1px),linear-gradient(90deg, rgba(0,0,0,0.2) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
                        {!locked && layout.hasCounter && (
                            <div className="absolute left-[11%] top-[16%] h-3 w-[34%] rounded-sm border border-[#5B3C2A]" style={{ background: 'linear-gradient(180deg, #7A5238, #5A3A29)' }} />
                        )}

                        {!locked && floorStickers.map(sticker => (
                            <div
                                key={sticker.id}
                                className="absolute select-none cursor-pointer"
                                style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) scale(${sticker.scale})`, zIndex: sticker.zIndex, fontSize: '1.35rem' }}
                                onDoubleClick={() => handleDeleteSticker(room.id, sticker.id)}
                            >
                                {sticker.url}
                            </div>
                        ))}
                    </div>

                    {!locked && roomStaff.map(staff => (
                        <div
                            key={staff.id}
                            className="absolute cursor-pointer"
                            style={{ left: `${staff.x || 50}%`, top: `${staff.y || 72}%`, transform: 'translate(-50%, -100%)', zIndex: 30 }}
                            onClick={(e) => { e.stopPropagation(); onStaffClick?.(staff); }}
                        >
                            <div className="text-3xl drop-shadow-md">{staff.avatar}</div>
                            <div className="mt-1 px-2 py-0.5 rounded-full bg-white/90 border border-[#F2D5BE] text-[10px] font-bold text-[#8A5A3D]">{staff.name}</div>
                        </div>
                    ))}

                    {locked && (
                        <button
                            onClick={() => setShowUnlockConfirm(room.id)}
                            className="absolute inset-0 z-40 bg-black/20 backdrop-blur-[1px] flex items-center justify-center"
                        >
                            <div className="bg-white/90 px-4 py-3 rounded-2xl shadow-lg text-center">
                                <div className="text-2xl">🔒</div>
                                <div className="text-sm font-bold text-[#8A5A3D]">解锁 {ROOM_UNLOCK_COSTS[room.id] || 150} AP</div>
                            </div>
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const goPrevRoom = () => {
        const prev = activeRoomIndex <= 0 ? orderedRooms.length - 1 : activeRoomIndex - 1;
        setActiveRoomId(orderedRooms[prev].id);
    };

    const goNextRoom = () => {
        const next = activeRoomIndex >= orderedRooms.length - 1 ? 0 : activeRoomIndex + 1;
        setActiveRoomId(orderedRooms[next].id);
    };

    return (
        <div className="relative w-full px-3 pt-3 pb-4 rounded-2xl overflow-hidden" style={{ minHeight: 'calc(100vh - 180px)', background: 'linear-gradient(180deg, #FFF5ED 0%, #FFEEDB 100%)' }}>
            <div className="flex items-center justify-between mb-2">
                <button onClick={goPrevRoom} className="w-10 h-10 rounded-full bg-white/90 shadow text-lg">⬅️</button>
                <div className="text-center">
                    <div className="text-xs text-[#B07A59] font-bold">当前房间</div>
                    <div className="text-base font-black text-[#7A5238]">{activeRoom.name}</div>
                </div>
                <button onClick={goNextRoom} className="w-10 h-10 rounded-full bg-white/90 shadow text-lg">➡️</button>
            </div>

            <div className="mb-2 flex justify-center">
                <button
                    onClick={() => setShowRoomMap(v => !v)}
                    className="px-3 py-1.5 rounded-full bg-[#7A5238] text-white text-xs font-bold shadow"
                >
                    {showRoomMap ? '收起房间地图' : '展开房间地图'}
                </button>
            </div>

            {showRoomMap && (
                <div className="mb-3 p-2 rounded-2xl bg-white/75 border border-[#F7DCC3] shadow-sm">
                    <div className="grid grid-cols-2 gap-2">
                        {orderedRooms.map(room => (
                            <button
                                key={room.id}
                                onClick={() => setActiveRoomId(room.id)}
                                className={`p-2 rounded-xl text-left border ${activeRoom.id === room.id ? 'bg-[#FFF1E4] border-[#F0B887]' : 'bg-white border-[#F3E1CF]'}`}
                            >
                                <div className="text-[11px] font-bold text-[#8A5A3D] truncate">{room.name}</div>
                                <div className="text-[10px] text-[#B1896D]">{room.isUnlocked ? '已解锁' : `🔒 ${ROOM_UNLOCK_COSTS[room.id] || 150} AP`}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {renderRoom(activeRoom)}

            <div className="mt-3 flex flex-wrap gap-2 justify-center">
                <button onClick={onOpenGuestbook} className="px-3 py-2 rounded-xl bg-white/90 text-[#7A5238] text-xs font-bold border border-[#F4D8BE]">📖 情报志</button>
                <button onClick={() => setShowLayoutPicker(activeRoom.id)} className="px-3 py-2 rounded-xl bg-white/90 text-[#7A5238] text-xs font-bold border border-[#F4D8BE]">🏠 房型</button>
                <button onClick={() => handleRenameRoom(activeRoom)} className="px-3 py-2 rounded-xl bg-white/90 text-[#7A5238] text-xs font-bold border border-[#F4D8BE]">✏️ 改名</button>
                {activeRoom.isUnlocked && (
                    <>
                        <button onClick={() => setEditMode('sticker')} className={`px-3 py-2 rounded-xl text-xs font-bold border ${editMode === 'sticker' ? 'bg-[#7A5238] text-white border-[#7A5238]' : 'bg-white/90 text-[#7A5238] border-[#F4D8BE]'}`}>🎀 贴纸</button>
                        <button onClick={() => setEditMode('wallpaper')} className={`px-3 py-2 rounded-xl text-xs font-bold border ${editMode === 'wallpaper' ? 'bg-[#7A5238] text-white border-[#7A5238]' : 'bg-white/90 text-[#7A5238] border-[#F4D8BE]'}`}>🧱 墙纸</button>
                        <button onClick={() => setEditMode('floor')} className={`px-3 py-2 rounded-xl text-xs font-bold border ${editMode === 'floor' ? 'bg-[#7A5238] text-white border-[#7A5238]' : 'bg-white/90 text-[#7A5238] border-[#F4D8BE]'}`}>🪵 地板</button>
                    </>
                )}
            </div>

            {activeRoom.isUnlocked && editMode === 'wallpaper' && (
                <div className="mt-3 p-2 rounded-2xl bg-white/85 border border-[#F7DCC3] max-h-36 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                        {WALLPAPER_PRESETS.map(wp => (
                            <button key={wp.id} onClick={() => handleSetWallpaper(activeRoom.id, wp.style)} className="rounded-xl border border-[#F2D2B6] p-2 text-left">
                                <div className="h-8 rounded-lg mb-1" style={{ background: wp.style }} />
                                <div className="text-[10px] font-bold text-[#7A5238]">{wp.name}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {activeRoom.isUnlocked && editMode === 'floor' && (
                <div className="mt-3 p-2 rounded-2xl bg-white/85 border border-[#F7DCC3] max-h-36 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                        {FLOOR_PRESETS.map(fl => (
                            <button key={fl.id} onClick={() => handleSetFloor(activeRoom.id, fl.style)} className="rounded-xl border border-[#F2D2B6] p-2 text-left">
                                <div className="h-8 rounded-lg mb-1" style={{ background: fl.style }} />
                                <div className="text-[10px] font-bold text-[#7A5238]">{fl.name}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {activeRoom.isUnlocked && editMode === 'sticker' && (
                <div className="mt-3 p-2 rounded-2xl bg-white/85 border border-[#F7DCC3]">
                    <div className="flex gap-2 mb-2">
                        {['decor', 'furniture', 'wall', 'food', 'pet', 'floor'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setStickerTab(tab)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold ${stickerTab === tab ? 'bg-[#7A5238] text-white' : 'bg-[#FCEBDB] text-[#8A5A3D]'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                        {STICKER_LIBRARY.filter(s => s.category === stickerTab).map(sticker => (
                            <button
                                key={sticker.id}
                                onClick={() => handleAddSticker(activeRoom.id, sticker.url, sticker.category === 'wall' ? 'leftWall' : 'floor')}
                                className="h-10 rounded-lg bg-[#FFF4E8] border border-[#F2D2B6] text-xl"
                            >
                                {sticker.url}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {showUnlockConfirm && (() => {
                const room = dh.rooms.find(r => r.id === showUnlockConfirm);
                const cost = ROOM_UNLOCK_COSTS[showUnlockConfirm] || 150;
                return (
                    <div className="absolute inset-0 z-[70] bg-black/35 flex items-center justify-center" onClick={() => setShowUnlockConfirm(null)}>
                        <div className="w-[88%] bg-white rounded-2xl p-4" onClick={e => e.stopPropagation()}>
                            <div className="text-center text-[#7A5238] font-bold mb-3">解锁「{room?.name || '房间'}」需要 {cost} AP</div>
                            <div className="flex gap-2">
                                <button className="flex-1 py-2 rounded-xl bg-[#F1E6DD]" onClick={() => setShowUnlockConfirm(null)}>取消</button>
                                <button className="flex-1 py-2 rounded-xl bg-[#FF8C63] text-white" onClick={() => handleUnlockRoom(showUnlockConfirm)}>解锁</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showLayoutPicker && (() => {
                const room = dh.rooms.find(r => r.id === showLayoutPicker);
                return (
                    <div className="absolute inset-0 z-[70] bg-black/35 flex items-end" onClick={() => setShowLayoutPicker(null)}>
                        <div className="w-full bg-white rounded-t-2xl p-3 max-h-[58%] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="text-sm font-bold text-[#7A5238] mb-2">为「{room?.name}」选择房型</div>
                            <div className="space-y-2">
                                {ROOM_LAYOUTS.map(layout => (
                                    <button key={layout.id} onClick={() => handleChangeLayout(showLayoutPicker, layout.id)} className="w-full p-2 rounded-xl border border-[#F3E0CE] flex items-center gap-2 text-left">
                                        <span className="text-xl">{layout.icon}</span>
                                        <span className="text-xs font-bold text-[#7A5238]">{layout.name}</span>
                                        <span className="ml-auto text-[10px] text-[#B1896D]">{layout.apCost > 0 ? `${layout.apCost} AP` : '免费'}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default BankDollhouse;
