import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    BankShopState, DollhouseState, DollhouseRoom, DollhouseSticker,
    ShopStaff, CharacterProfile, UserProfile, APIConfig, RoomLayout
} from '../../types';
import {
    ROOM_LAYOUTS, WALLPAPER_PRESETS, FLOOR_PRESETS, STICKER_LIBRARY, INITIAL_DOLLHOUSE
} from './BankGameConstants';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';

const ROOM_UNLOCK_COSTS: Record<string, number> = {
    'room-1f-left': 0,
    'room-1f-right': 120,
    'room-2f-left': 200,
    'room-2f-right': 300,
};

const MAIN_ROOM_ID = 'room-1f-left';
const FLOOR_H_RATIO = 0.3;
const WALL_H_RATIO = 0.7;
const CUSTOM_FURNITURE_ASSET_KEY = 'bank_custom_furniture_assets_v1';

type DecorTab = 'layout' | 'rename' | 'wallpaper' | 'furniture' | 'floor';

interface CustomFurnitureAsset {
    id: string;
    name: string;
    url: string;
}

interface Props {
    shopState: BankShopState;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: APIConfig;
    updateState: (s: BankShopState) => Promise<void>;
    onStaffClick?: (staff: ShopStaff) => void;
    onOpenGuestbook: () => void;
    onRefreshVisitor?: () => void;
    isRefreshingVisitor?: boolean;
}

const BankDollhouse: React.FC<Props> = ({
    shopState, characters, updateState, onStaffClick, onOpenGuestbook, onRefreshVisitor, isRefreshingVisitor = false
}) => {
    const { addToast } = useOS();
    const [showUnlockConfirm, setShowUnlockConfirm] = useState<string | null>(null);
    const [showRoomMap, setShowRoomMap] = useState(false);
    const [showDecorPanel, setShowDecorPanel] = useState(false);
    const [decorTab, setDecorTab] = useState<DecorTab>('furniture');
    const [showFullscreen, setShowFullscreen] = useState(false);

    const [customAssets, setCustomAssets] = useState<CustomFurnitureAsset[]>([]);
    const [showAssetModal, setShowAssetModal] = useState(false);
    const [assetName, setAssetName] = useState('');
    const [assetUrl, setAssetUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getDollhouse = (): DollhouseState => shopState.dollhouse || INITIAL_DOLLHOUSE;
    const dh = getDollhouse();

    const saveDollhouse = async (newDH: DollhouseState) => {
        await updateState({ ...shopState, dollhouse: newDH });
    };

    useEffect(() => {
        const loadAssets = async () => {
            try {
                const fromDb = await DB.getAsset(CUSTOM_FURNITURE_ASSET_KEY);
                if (fromDb) {
                    const parsed = JSON.parse(fromDb);
                    if (Array.isArray(parsed)) {
                        setCustomAssets(parsed);
                        return;
                    }
                }

                // Migrate old localStorage data if exists
                const legacy = localStorage.getItem(CUSTOM_FURNITURE_ASSET_KEY);
                if (!legacy) return;
                const parsed = JSON.parse(legacy);
                if (Array.isArray(parsed)) {
                    setCustomAssets(parsed);
                    await DB.saveAsset(CUSTOM_FURNITURE_ASSET_KEY, JSON.stringify(parsed));
                    localStorage.removeItem(CUSTOM_FURNITURE_ASSET_KEY);
                }
            } catch {
                setCustomAssets([]);
            }
        };
        loadAssets();
    }, []);

    useEffect(() => {
        const mainRoom = dh.rooms.find(r => r.id === MAIN_ROOM_ID);
        if (!mainRoom || shopState.staff.length === 0) return;

        const mainHasStaff = mainRoom.staffIds.length > 0;
        const staffIdsInAnyRoom = dh.rooms.flatMap(r => r.staffIds);
        const missingStaff = shopState.staff.filter(s => !staffIdsInAnyRoom.includes(s.id)).map(s => s.id);

        if (mainHasStaff && missingStaff.length === 0) return;

        const allStaffIds = shopState.staff.map(s => s.id);
        const newRooms = dh.rooms.map(r => (
            r.id === MAIN_ROOM_ID
                ? { ...r, staffIds: Array.from(new Set([...allStaffIds, ...r.staffIds])) }
                : { ...r, staffIds: r.staffIds.filter(id => !allStaffIds.includes(id)) }
        ));
        updateState({ ...shopState, dollhouse: { ...dh, rooms: newRooms } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shopState.staff.length]);

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
        addToast('墙纸已更换', 'success');
    };

    const handleSetFloor = async (roomId: string, style: string) => {
        await saveDollhouse({
            ...dh,
            rooms: dh.rooms.map(r => r.id === roomId ? { ...r, floorStyle: style } : r)
        });
        addToast('地板已更换', 'success');
    };

    const handleAddFurniture = async (roomId: string, stickerUrl: string, surface: 'floor' | 'leftWall') => {
        const newSticker: DollhouseSticker = {
            id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            url: stickerUrl,
            x: 50,
            y: surface === 'leftWall' ? 45 : 55,
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
        addToast('房型已更换！', 'success');
    };

    const goPrevRoom = () => {
        const prev = activeRoomIndex <= 0 ? orderedRooms.length - 1 : activeRoomIndex - 1;
        setActiveRoomId(orderedRooms[prev].id);
    };

    const goNextRoom = () => {
        const next = activeRoomIndex >= orderedRooms.length - 1 ? 0 : activeRoomIndex + 1;
        setActiveRoomId(orderedRooms[next].id);
    };

    const persistCustomAssets = async (nextAssets: CustomFurnitureAsset[]) => {
        setCustomAssets(nextAssets);
        await DB.saveAsset(CUSTOM_FURNITURE_ASSET_KEY, JSON.stringify(nextAssets));
    };

    const handleAddCustomAsset = async () => {
        if (!assetName.trim() || !assetUrl.trim()) {
            addToast('请填写家具名称和图片', 'error');
            return;
        }
        const next = [...customAssets, { id: `custom-${Date.now()}`, name: assetName.trim(), url: assetUrl.trim() }];
        await persistCustomAssets(next);
        setAssetName('');
        setAssetUrl('');
        setShowAssetModal(false);
        addToast('自定义家具已保存', 'success');
    };

    const handleDeleteCustomAsset = (id: string) => {
        void persistCustomAssets(customAssets.filter(a => a.id !== id));
        addToast('已删除自定义家具', 'success');
    };

    const handleUploadCustomAsset = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                setAssetUrl(reader.result);
                addToast('图片已载入', 'success');
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const renderArrowButton = (direction: 'left' | 'right', onClick: () => void) => (
        <button
            onClick={onClick}
            className="w-11 h-11 rounded-full border border-[#EED4BF] bg-gradient-to-b from-white to-[#FFF3E8] shadow-[0_6px_14px_rgba(174,123,89,0.25)] flex items-center justify-center active:scale-95 transition-transform"
            aria-label={direction === 'left' ? '上一房间' : '下一房间'}
        >
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#8B5E43]" fill="none" stroke="currentColor" strokeWidth="2.2">
                {direction === 'left'
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 4 7 12l8 8" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="m9 4 8 8-8 8" />}
            </svg>
        </button>
    );

    const renderRoom = (room: DollhouseRoom, immersive = false) => {
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
            <div className={`w-full rounded-[26px] overflow-hidden border-4 border-[#FFE7D2] shadow-[0_14px_40px_rgba(214,151,103,0.35)] bg-[#FFF9F4] ${immersive ? 'max-w-[560px] mx-auto' : ''}`}>
                <div className="relative w-full" style={{ aspectRatio: '3 / 4' }}>
                    <div className="absolute left-0 right-0 top-0" style={{ height: `${WALL_H_RATIO * 100}%`, background: wallBg }}>
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1.5px, transparent 2px)', backgroundSize: '20px 20px' }} />
                        {!locked && wallStickers.map(sticker => (
                            <div
                                key={sticker.id}
                                className="absolute select-none cursor-pointer"
                                style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) scale(${sticker.scale})`, zIndex: sticker.zIndex, fontSize: immersive ? '1.7rem' : '1.35rem' }}
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
                                style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) scale(${sticker.scale})`, zIndex: sticker.zIndex, fontSize: immersive ? '1.7rem' : '1.35rem' }}
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
                            <div className={`${immersive ? 'text-4xl' : 'text-3xl'} drop-shadow-md`}>{staff.avatar}</div>
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

                    <button
                        onClick={() => setShowFullscreen(true)}
                        className="absolute top-2 right-2 z-50 w-9 h-9 rounded-full bg-white/90 border border-[#EFD5BF] shadow flex items-center justify-center"
                        aria-label="全屏房间"
                    >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#8A5A3D]" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H4v4M16 3h4v4M8 21H4v-4M20 21h-4v-4" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    };

    const builtinFurniture = STICKER_LIBRARY.map(s => ({ id: s.id, name: s.name, url: s.url, category: s.category }));

    const visitorChar = characters.find(c => c.id === shopState.activeVisitor?.charId);

    return (
        <div className="relative w-full px-3 pt-3 pb-4 rounded-2xl" style={{ minHeight: 'calc(100vh - 180px)', background: 'linear-gradient(180deg, #FFF5ED 0%, #FFEEDB 100%)' }}>
            <div className="flex items-center justify-between mb-2">
                {renderArrowButton('left', goPrevRoom)}
                <div className="text-center">
                    <div className="text-xs text-[#B07A59] font-bold">当前房间</div>
                    <div className="text-base font-black text-[#7A5238]">{activeRoom.name}</div>
                </div>
                {renderArrowButton('right', goNextRoom)}
            </div>

            <div className="mb-2 flex justify-center gap-2">
                <button
                    onClick={() => setShowRoomMap(v => !v)}
                    className="px-3 py-1.5 rounded-full bg-[#7A5238] text-white text-xs font-bold shadow"
                >
                    {showRoomMap ? '收起房间地图' : '展开房间地图'}
                </button>
                <button
                    onClick={() => { setShowDecorPanel(true); setDecorTab('furniture'); }}
                    className="px-3 py-1.5 rounded-full bg-gradient-to-r from-[#FF9A75] to-[#FF7D6A] text-white text-xs font-bold shadow"
                >
                    🛠️ 装修
                </button>
            </div>

            <div className="mb-3 rounded-2xl border border-[#F4D8BE] bg-gradient-to-r from-[#FFE8CE] to-[#FFDDBA] p-3 shadow-md">
                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={onOpenGuestbook}
                        className="flex-1 rounded-xl bg-gradient-to-r from-[#8D6E63] to-[#6D4C41] text-white px-3 py-3 text-sm font-black shadow"
                    >
                        📖 打开情报志
                    </button>
                    <button
                        onClick={() => onRefreshVisitor?.()}
                        disabled={!onRefreshVisitor || isRefreshingVisitor}
                        className={`rounded-xl px-3 py-3 text-xs font-bold shadow ${
                            isRefreshingVisitor
                                ? 'bg-[#EFEBE9] text-[#BCAAA4]'
                                : 'bg-gradient-to-r from-[#42A5F5] to-[#1E88E5] text-white'
                        }`}
                    >
                        {isRefreshingVisitor ? '刷新中...' : '刷新访客'}
                    </button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-[#7A5238]">
                    <span className="font-bold">当前访客：</span>
                    {visitorChar ? (
                        <>
                            <img src={visitorChar.sprites?.chibi || visitorChar.avatar} className="w-7 h-7 rounded-lg object-cover border border-white/70" />
                            <span className="font-bold">{visitorChar.name}</span>
                            <span className="text-[11px] text-[#9D745A] truncate">{shopState.activeVisitor?.message || '来店里逛逛~'}</span>
                        </>
                    ) : (
                        <span className="text-[#9D745A]">暂无访客，点“刷新访客”邀请一个吧</span>
                    )}
                </div>
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

            {showDecorPanel && (
                <div className="absolute inset-0 z-[80] bg-black/35 flex items-end" onClick={() => setShowDecorPanel(false)}>
                    <div
                        className="w-full rounded-t-3xl bg-white p-3 max-h-[62vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-black text-[#7A5238]">装修面板</div>
                            <button onClick={() => setShowDecorPanel(false)} className="px-2 py-1 text-xs rounded-lg bg-[#F4E6DA] text-[#8A5A3D]">完成</button>
                        </div>

                        <div className="grid grid-cols-5 gap-1.5 mb-3">
                            {[
                                { id: 'layout', label: '房型' },
                                { id: 'rename', label: '改名' },
                                { id: 'wallpaper', label: '墙纸' },
                                { id: 'furniture', label: '家具' },
                                { id: 'floor', label: '地板' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setDecorTab(tab.id as DecorTab)}
                                    className={`py-2 rounded-xl text-xs font-bold ${decorTab === tab.id ? 'bg-[#7A5238] text-white' : 'bg-[#FDF0E4] text-[#8A5A3D]'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {decorTab === 'layout' && (
                            <div className="space-y-2">
                                {ROOM_LAYOUTS.map(layout => (
                                    <button key={layout.id} onClick={() => handleChangeLayout(activeRoom.id, layout.id)} className="w-full p-2 rounded-xl border border-[#F3E0CE] flex items-center gap-2 text-left">
                                        <span className="text-xl">{layout.icon}</span>
                                        <span className="text-xs font-bold text-[#7A5238]">{layout.name}</span>
                                        <span className="ml-auto text-[10px] text-[#B1896D]">{layout.apCost > 0 ? `${layout.apCost} AP` : '免费'}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {decorTab === 'rename' && (
                            <button onClick={() => handleRenameRoom(activeRoom)} className="w-full py-3 rounded-xl bg-[#FDEBDD] border border-[#F1D1B2] text-[#7A5238] text-sm font-bold">给当前房间改名</button>
                        )}

                        {decorTab === 'wallpaper' && (
                            <div className="grid grid-cols-2 gap-2">
                                {WALLPAPER_PRESETS.map(wp => (
                                    <button key={wp.id} onClick={() => handleSetWallpaper(activeRoom.id, wp.style)} className="rounded-xl border border-[#F2D2B6] p-2 text-left">
                                        <div className="h-8 rounded-lg mb-1" style={{ background: wp.style }} />
                                        <div className="text-[10px] font-bold text-[#7A5238]">{wp.name}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {decorTab === 'floor' && (
                            <div className="grid grid-cols-2 gap-2">
                                {FLOOR_PRESETS.map(fl => (
                                    <button key={fl.id} onClick={() => handleSetFloor(activeRoom.id, fl.style)} className="rounded-xl border border-[#F2D2B6] p-2 text-left">
                                        <div className="h-8 rounded-lg mb-1" style={{ background: fl.style }} />
                                        <div className="text-[10px] font-bold text-[#7A5238]">{fl.name}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {decorTab === 'furniture' && (
                            <>
                                <div className="mb-2 flex gap-2">
                                    <button onClick={() => setShowAssetModal(true)} className="px-3 py-1.5 rounded-lg bg-[#FF8E6B] text-white text-xs font-bold">+ 上传/添加家具</button>
                                </div>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {builtinFurniture.map(sticker => (
                                        <button
                                            key={sticker.id}
                                            onClick={() => handleAddFurniture(activeRoom.id, sticker.url, sticker.category === 'wall' ? 'leftWall' : 'floor')}
                                            className="h-12 rounded-lg bg-[#FFF4E8] border border-[#F2D2B6] text-xl"
                                            title={sticker.name}
                                        >
                                            {sticker.url}
                                        </button>
                                    ))}
                                    {customAssets.map(asset => (
                                        <div key={asset.id} className="relative">
                                            <button
                                                onClick={() => handleAddFurniture(activeRoom.id, asset.url, 'floor')}
                                                className="h-12 w-full rounded-lg bg-[#FFF4E8] border border-[#F2D2B6] text-[0] overflow-hidden"
                                                title={asset.name}
                                            >
                                                <img src={asset.url} className="w-full h-full object-cover" />
                                            </button>
                                            <button onClick={() => handleDeleteCustomAsset(asset.id)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FF6B6B] text-white text-[10px] leading-none">×</button>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-2 text-[10px] text-[#A67E62]">提示：双击房间里的家具可删除。</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {showAssetModal && (
                <div className="absolute inset-0 z-[90] bg-black/35 flex items-center justify-center" onClick={() => setShowAssetModal(false)}>
                    <div className="w-[90%] bg-white rounded-2xl p-3" onClick={e => e.stopPropagation()}>
                        <div className="text-sm font-bold text-[#7A5238] mb-2">添加自定义家具</div>
                        <input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="家具名" className="w-full mb-2 px-2 py-2 rounded-lg border border-[#E9D0BD] text-sm" />
                        <input value={assetUrl} onChange={(e) => setAssetUrl(e.target.value)} placeholder="图床URL 或本地上传" className="w-full mb-2 px-2 py-2 rounded-lg border border-[#E9D0BD] text-sm" />
                        <div className="flex gap-2 mb-2">
                            <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-2 rounded-lg bg-[#F7E8DB] text-[#7A5238] text-xs font-bold">上传本地图片</button>
                            <button onClick={handleAddCustomAsset} className="flex-1 py-2 rounded-lg bg-[#FF8E6B] text-white text-xs font-bold">保存</button>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadCustomAsset} className="hidden" />
                    </div>
                </div>
            )}

            {showFullscreen && (
                <div className="fixed inset-0 z-[100] bg-[#2B1B13] p-3 overflow-y-auto">
                    <div className="max-w-[680px] mx-auto">
                        <div className="mb-3 flex justify-end">
                            <button onClick={() => setShowFullscreen(false)} className="px-3 py-1.5 rounded-lg bg-white/90 text-[#7A5238] text-xs font-bold">退出全屏</button>
                        </div>
                        {renderRoom(activeRoom, true)}
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
        </div>
    );
};

export default BankDollhouse;
