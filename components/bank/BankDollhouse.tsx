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
const FLOOR_H_RATIO = 0.24;
const WALL_H_RATIO = 0.76;
const CUSTOM_FURNITURE_ASSET_KEY = 'bank_custom_furniture_assets_v1';

type DecorTab = 'layout' | 'rename' | 'wallpaper' | 'furniture' | 'floor' | 'roomTexture';

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
    updateState: (updater: (prev: BankShopState) => BankShopState) => Promise<void>;
    onStaffClick?: (staff: ShopStaff) => void;
    onOpenGuestbook: () => void;
}

const BankDollhouse: React.FC<Props> = ({
    shopState, characters, updateState, onStaffClick, onOpenGuestbook
}) => {
    const { addToast } = useOS();
    const [showUnlockConfirm, setShowUnlockConfirm] = useState<string | null>(null);
    const [showDecorPanel, setShowDecorPanel] = useState(false);
    const [decorTab, setDecorTab] = useState<DecorTab>('furniture');
    const [draggingActorId, setDraggingActorId] = useState<string | null>(null);
    const [actorPositions, setActorPositions] = useState<Record<string, { x: number; y: number }>>({});

    const longPressTimerRef = useRef<number | null>(null);
    const dragStateRef = useRef<{ actorId: string; roomId: string; isVisitor: boolean } | null>(null);
    const suppressActorClickRef = useRef(false);

    const [customAssets, setCustomAssets] = useState<CustomFurnitureAsset[]>([]);
    const [showAssetModal, setShowAssetModal] = useState(false);
    const [assetName, setAssetName] = useState('');
    const [assetUrl, setAssetUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showTextureModal, setShowTextureModal] = useState(false);
    const [textureTarget, setTextureTarget] = useState<'room' | 'wallpaper' | 'floor'>('room');
    const [textureUrl, setTextureUrl] = useState('');
    const [textureScale, setTextureScale] = useState(1);
    const textureInputRef = useRef<HTMLInputElement>(null);

    // Sticker drag state
    const [draggingStickerInfo, setDraggingStickerInfo] = useState<{ stickerId: string; roomId: string; surface: string } | null>(null);
    const stickerLongPressRef = useRef<number | null>(null);

    const getDollhouse = (): DollhouseState => shopState.dollhouse || INITIAL_DOLLHOUSE;
    const dh = getDollhouse();

    const clampActorPos = (x: number, y: number) => ({
        x: Math.max(8, Math.min(92, x)),
        y: Math.max(56, Math.min(92, y)),
    });

    const saveDollhouse = async (newDH: DollhouseState) => {
        await updateState(prev => ({ ...prev, dollhouse: newDH }));
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
        updateState(prev => ({ ...prev, dollhouse: { ...dh, rooms: newRooms } }));
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

    useEffect(() => {
        const next: Record<string, { x: number; y: number }> = {};
        shopState.staff.forEach(staff => {
            next[staff.id] = clampActorPos(staff.x ?? 50, staff.y ?? 74);
        });
        if (shopState.activeVisitor?.charId) {
            next[shopState.activeVisitor.charId] = clampActorPos(shopState.activeVisitor.x ?? 55, shopState.activeVisitor.y ?? 76);
        }
        setActorPositions(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shopState.staff, shopState.activeVisitor?.charId, shopState.activeVisitor?.x, shopState.activeVisitor?.y]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (dragStateRef.current) return;
            setActorPositions(prev => {
                const updated: Record<string, { x: number; y: number }> = { ...prev };
                Object.entries(prev).forEach(([id, pos]) => {
                    if (Math.random() > 0.4) return;
                    const dx = (Math.random() - 0.5) * 3;
                    const dy = (Math.random() - 0.5) * 1.8;
                    updated[id] = clampActorPos(pos.x + dx, pos.y + dy);
                });
                return updated;
            });
        }, 3200);

        return () => {
            window.clearInterval(timer);
            cancelLongPress();
            cancelStickerLongPress();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        await updateState(prev => ({
            ...prev,
            actionPoints: prev.actionPoints - cost,
            dollhouse: { ...(prev.dollhouse || dh), rooms: newRooms }
        }));
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

    const persistActorPosition = async (actorId: string, x: number, y: number, isVisitor: boolean) => {
        const next = clampActorPos(x, y);
        if (isVisitor) {
            if (!shopState.activeVisitor || shopState.activeVisitor.charId !== actorId) return;
            await updateState(prev => ({
                ...prev,
                activeVisitor: prev.activeVisitor ? { ...prev.activeVisitor, x: next.x, y: next.y } : prev.activeVisitor,
            }));
            return;
        }

        await updateState(prev => ({
            ...prev,
            staff: prev.staff.map(s => s.id === actorId ? { ...s, x: next.x, y: next.y } : s)
        }));
    };

    const cancelLongPress = () => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handleActorPressStart = (actorId: string, roomId: string, isVisitor: boolean) => {
        cancelLongPress();
        longPressTimerRef.current = window.setTimeout(() => {
            dragStateRef.current = { actorId, roomId, isVisitor };
            setDraggingActorId(actorId);
            suppressActorClickRef.current = true;
        }, 320);
    };

    const handleRoomPointerMove = (roomId: string, e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.roomId !== roomId) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        const next = clampActorPos(xPct, yPct);
        setActorPositions(prev => ({ ...prev, [drag.actorId]: next }));
    };

    const handleRoomPointerUp = async () => {
        cancelLongPress();
        const drag = dragStateRef.current;
        if (!drag) return;
        const pos = actorPositions[drag.actorId];
        if (pos) {
            await persistActorPosition(drag.actorId, pos.x, pos.y, drag.isVisitor);
        }
        dragStateRef.current = null;
        setDraggingActorId(null);
        window.setTimeout(() => { suppressActorClickRef.current = false; }, 0);
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

    const cancelStickerLongPress = () => {
        if (stickerLongPressRef.current !== null) {
            window.clearTimeout(stickerLongPressRef.current);
            stickerLongPressRef.current = null;
        }
    };

    const handleStickerPressStart = (stickerId: string, roomId: string, surface: string) => {
        cancelStickerLongPress();
        stickerLongPressRef.current = window.setTimeout(() => {
            setDraggingStickerInfo({ stickerId, roomId, surface });
        }, 280);
    };

    const handleStickerPointerMove = (roomId: string, surface: 'floor' | 'leftWall' | 'rightWall', e: React.PointerEvent<HTMLDivElement>) => {
        if (!draggingStickerInfo || draggingStickerInfo.roomId !== roomId) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        const clampedX = Math.max(5, Math.min(95, xPct));
        const clampedY = Math.max(5, Math.min(95, yPct));

        const newRooms = dh.rooms.map(r => {
            if (r.id !== roomId) return r;
            return {
                ...r,
                stickers: r.stickers.map(s =>
                    s.id === draggingStickerInfo.stickerId ? { ...s, x: clampedX, y: clampedY } : s
                )
            };
        });
        // Update locally without persisting on every move
        saveDollhouse({ ...dh, rooms: newRooms });
    };

    const handleStickerPointerUp = async () => {
        cancelStickerLongPress();
        if (draggingStickerInfo) {
            // Position already saved via saveDollhouse during move
            setDraggingStickerInfo(null);
        }
    };

    const handleStickerScaleChange = async (roomId: string, stickerId: string, delta: number) => {
        await saveDollhouse({
            ...dh,
            rooms: dh.rooms.map(r => r.id === roomId ? {
                ...r,
                stickers: r.stickers.map(s =>
                    s.id === stickerId ? { ...s, scale: Math.max(0.3, Math.min(3, s.scale + delta)) } : s
                )
            } : r)
        });
    };

    const handleChangeLayout = async (roomId: string, layoutId: string) => {
        const layout = getLayout(layoutId);
        if (!layout) return;
        if (layout.apCost > 0 && shopState.actionPoints < layout.apCost) {
            addToast(`AP 不足 (需 ${layout.apCost})`, 'error');
            return;
        }

        await updateState(prev => ({
            ...prev,
            actionPoints: prev.actionPoints - layout.apCost,
            dollhouse: {
                ...(prev.dollhouse || dh),
                rooms: (prev.dollhouse?.rooms || dh.rooms).map(r => r.id === roomId ? { ...r, layoutId } : r)
            }
        }));
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

    const toCssBackground = (value?: string, fallback?: string) => {
        const source = (value || fallback || '').trim();
        if (!source) return fallback || 'transparent';
        if (/gradient\(|^#|^rgb\(|^hsl\(/i.test(source)) return source;
        return `url("${source}") center / cover no-repeat`;
    };

    const openTextureModal = (target: 'room' | 'wallpaper' | 'floor') => {
        setTextureTarget(target);
        setTextureUrl('');
        setTextureScale(1);
        setShowTextureModal(true);
    };

    const handleTextureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                setTextureUrl(reader.result);
                addToast('贴图已载入', 'success');
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleSaveCustomTexture = async () => {
        if (!textureUrl.trim()) {
            addToast('请填写图床 URL 或上传本地图片', 'error');
            return;
        }
        const url = textureUrl.trim();
        if (textureTarget === 'room') {
            await saveDollhouse({
                ...dh,
                rooms: dh.rooms.map(r => r.id === activeRoom.id ? { ...r, roomTextureUrl: url, roomTextureScale: textureScale } : r)
            });
            addToast('全屋贴图已更新', 'success');
        } else if (textureTarget === 'wallpaper') {
            await handleSetWallpaper(activeRoom.id, url);
        } else {
            await handleSetFloor(activeRoom.id, url);
        }
        setShowTextureModal(false);
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
        const wallBg = toCssBackground(room.wallpaperLeft || room.wallpaperRight, 'linear-gradient(180deg, #FFF5E9, #FDE5D8)');
        const floorBg = toCssBackground(room.floorStyle, 'linear-gradient(135deg, #D6B48C, #C69767)');
        const roomTexture = room.roomTextureUrl?.trim();
        const roomTextureScale = Math.max(0.5, Math.min(2.5, room.roomTextureScale ?? 1));

        const roomStaff = shopState.staff.filter(s => {
            const targetRoom = dh.rooms.find(rm => rm.staffIds.includes(s.id));
            if (targetRoom) return targetRoom.id === room.id;
            return room.id === MAIN_ROOM_ID;
        });

        const visitor = shopState.activeVisitor && shopState.activeVisitor.roomId === room.id
            ? characters.find(c => c.id === shopState.activeVisitor?.charId)
            : null;

        const wallStickers = room.stickers.filter(s => s.surface === 'leftWall' || s.surface === 'rightWall');
        const floorStickers = room.stickers.filter(s => s.surface === 'floor');

        return (
            <div className={`w-full h-full rounded-[18px] overflow-hidden border border-[#E8DAC6] shadow-[0_6px_14px_rgba(131,96,66,0.14)] bg-[#F9F3E6] ${immersive ? 'max-w-[560px] mx-auto' : ''}`}>
                <div
                    className="relative w-full h-full min-h-[420px] touch-none"
                    onPointerMove={(e) => handleRoomPointerMove(room.id, e)}
                    onPointerUp={handleRoomPointerUp}
                    onPointerCancel={handleRoomPointerUp}
                    onPointerLeave={handleRoomPointerUp}
                >
                    <div
                        className="absolute left-0 right-0 top-0"
                        style={{ height: `${WALL_H_RATIO * 100}%`, background: wallBg }}
                        onPointerMove={(e) => draggingStickerInfo && handleStickerPointerMove(room.id, 'leftWall', e)}
                        onPointerUp={handleStickerPointerUp}
                        onPointerCancel={handleStickerPointerUp}
                    >
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1.5px, transparent 2px)', backgroundSize: '20px 20px' }} />
                        {!locked && wallStickers.map(sticker => {
                            const isDraggingThis = draggingStickerInfo?.stickerId === sticker.id;
                            const isUrl = sticker.url.startsWith('http') || sticker.url.startsWith('data');
                            return (
                                <div
                                    key={sticker.id}
                                    className={`absolute select-none transition-shadow ${isDraggingThis ? 'cursor-grabbing ring-2 ring-[#FF8E6B] ring-offset-1 rounded-lg' : 'cursor-grab'}`}
                                    style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) scale(${sticker.scale})`, zIndex: isDraggingThis ? 50 : sticker.zIndex, fontSize: immersive ? '1.7rem' : '1.35rem' }}
                                    onPointerDown={(e) => { e.stopPropagation(); handleStickerPressStart(sticker.id, room.id, sticker.surface); }}
                                    onPointerUp={(e) => { e.stopPropagation(); handleStickerPointerUp(); }}
                                    onDoubleClick={() => handleDeleteSticker(room.id, sticker.id)}
                                >
                                    {isUrl ? <img src={sticker.url} alt="" className="w-10 h-10 object-contain" draggable={false} /> : sticker.url}
                                </div>
                            );
                        })}
                    </div>

                    <div
                        className="absolute left-0 right-0 bottom-0"
                        style={{ height: `${FLOOR_H_RATIO * 100}%`, background: floorBg, borderTop: '3px solid rgba(156,104,64,0.22)' }}
                        onPointerMove={(e) => draggingStickerInfo && handleStickerPointerMove(room.id, 'floor', e)}
                        onPointerUp={handleStickerPointerUp}
                        onPointerCancel={handleStickerPointerUp}
                    >
                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,0.2) 1px, transparent 1px),linear-gradient(90deg, rgba(0,0,0,0.2) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

                        {!locked && floorStickers.map(sticker => {
                            const isDraggingThis = draggingStickerInfo?.stickerId === sticker.id;
                            const isUrl = sticker.url.startsWith('http') || sticker.url.startsWith('data');
                            return (
                                <div
                                    key={sticker.id}
                                    className={`absolute select-none transition-shadow ${isDraggingThis ? 'cursor-grabbing ring-2 ring-[#FF8E6B] ring-offset-1 rounded-lg' : 'cursor-grab'}`}
                                    style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) scale(${sticker.scale})`, zIndex: isDraggingThis ? 50 : sticker.zIndex, fontSize: immersive ? '1.7rem' : '1.35rem' }}
                                    onPointerDown={(e) => { e.stopPropagation(); handleStickerPressStart(sticker.id, room.id, sticker.surface); }}
                                    onPointerUp={(e) => { e.stopPropagation(); handleStickerPointerUp(); }}
                                    onDoubleClick={() => handleDeleteSticker(room.id, sticker.id)}
                                >
                                    {isUrl ? <img src={sticker.url} alt="" className="w-10 h-10 object-contain" draggable={false} /> : sticker.url}
                                </div>
                            );
                        })}
                    </div>

                    {!locked && roomTexture && (
                        <div className="absolute inset-0 pointer-events-none z-[5]" style={{ willChange: 'auto', isolation: 'isolate' }}>
                            <img
                                src={roomTexture}
                                alt=""
                                draggable={false}
                                className="absolute inset-0 w-full h-full object-contain"
                                style={{
                                    transform: `scale(${roomTextureScale})`,
                                    transformOrigin: 'center center',
                                    willChange: 'transform',
                                }}
                            />
                        </div>
                    )}

                    {!locked && roomStaff.map(staff => {
                        const pos = actorPositions[staff.id] || clampActorPos(staff.x || 50, staff.y || 72);
                        return (
                            <div
                                key={staff.id}
                                className={`absolute ${draggingActorId === staff.id ? 'cursor-grabbing' : 'cursor-pointer'} select-none transition-all duration-[1600ms] ease-in-out`}
                                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -100%)', zIndex: 30 }}
                                onPointerDown={(e) => { e.stopPropagation(); handleActorPressStart(staff.id, room.id, false); }}
                                onPointerUp={(e) => {
                                    e.stopPropagation();
                                    void handleRoomPointerUp();
                                    if (!suppressActorClickRef.current) onStaffClick?.(staff);
                                }}
                            >
                                <div className={`${immersive ? 'text-4xl' : 'text-3xl'} drop-shadow-md`}>{staff.avatar}</div>
                                <div className="mt-1 px-2 py-0.5 rounded-full bg-white/90 border border-[#F2D5BE] text-[10px] font-bold text-[#8A5A3D]">{staff.name}</div>
                            </div>
                        );
                    })}

                    {!locked && visitor && shopState.activeVisitor && (() => {
                        const visitorPos = actorPositions[visitor.id] || clampActorPos(shopState.activeVisitor.x ?? 55, shopState.activeVisitor.y ?? 76);
                        return (
                            <div
                                className={`absolute ${draggingActorId === visitor.id ? 'cursor-grabbing' : 'cursor-grab'} select-none transition-all duration-[1600ms] ease-in-out`}
                                style={{ left: `${visitorPos.x}%`, top: `${visitorPos.y}%`, transform: 'translate(-50%, -100%)', zIndex: 35 }}
                                onPointerDown={(e) => { e.stopPropagation(); handleActorPressStart(visitor.id, room.id, true); }}
                                onPointerUp={(e) => { e.stopPropagation(); void handleRoomPointerUp(); }}
                            >
                                <img src={visitor.sprites?.chibi || visitor.avatar} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-md" />
                                <div className="mt-1 px-2 py-0.5 rounded-full bg-white/95 border border-[#D9C1AE] text-[10px] font-bold text-[#8A5A3D]">{visitor.name}</div>
                            </div>
                        );
                    })()}

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

    const builtinFurniture = STICKER_LIBRARY.map(s => ({ id: s.id, name: s.name, url: s.url, category: s.category }));

    return (
        <div className="relative w-full h-full pt-2 pb-3 rounded-2xl flex flex-col" style={{ background: 'linear-gradient(180deg, #F8F0E0 0%, #F2E9D6 100%)' }}>
            <div className="flex items-center justify-between mb-2">
                {renderArrowButton('left', goPrevRoom)}
                <div className="text-center">
                    <div className="text-xs text-[#B07A59] font-bold">当前房间</div>
                    <div className="text-base font-black text-[#7A5238]">{activeRoom.name}</div>
                </div>
                {renderArrowButton('right', goNextRoom)}
            </div>

            <div className="absolute right-3 top-[72px] z-[40] flex flex-col gap-2">
                <button
                    onClick={() => { setShowDecorPanel(true); setDecorTab('furniture'); }}
                    className="w-11 h-11 rounded-2xl bg-gradient-to-r from-[#FF9A75] to-[#FF7D6A] text-white text-lg shadow-md"
                    aria-label="装修"
                >
                    🛠️
                </button>
                <button
                    onClick={onOpenGuestbook}
                    className="w-11 h-11 rounded-2xl bg-white/85 border border-[#EAD3BF] text-[#7A5238] text-lg shadow-sm"
                    aria-label="翻开情报志"
                >
                    📖
                </button>
            </div>

            <div className="flex-1 min-h-0 px-0.5">
                {renderRoom(activeRoom)}
            </div>

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

                        <div className="grid grid-cols-6 gap-1.5 mb-3">
                            {[
                                { id: 'layout', label: '房型' },
                                { id: 'rename', label: '改名' },
                                { id: 'wallpaper', label: '墙纸' },
                                { id: 'furniture', label: '家具' },
                                { id: 'floor', label: '地板' },
                                { id: 'roomTexture', label: '全屋' },
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
                            <div className="space-y-2"> 
                                <button onClick={() => openTextureModal('wallpaper')} className="w-full py-2 rounded-xl bg-[#FFE7D4] border border-[#F2D2B6] text-[#7A5238] text-xs font-bold">上传自定义墙纸（本地/图床）</button>
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

                        {decorTab === 'floor' && (
                            <div className="space-y-2"> 
                                <button onClick={() => openTextureModal('floor')} className="w-full py-2 rounded-xl bg-[#FFE7D4] border border-[#F2D2B6] text-[#7A5238] text-xs font-bold">上传自定义地板（本地/图床）</button>
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

                        {decorTab === 'roomTexture' && (
                            <div className="space-y-3">
                                <button onClick={() => openTextureModal('room')} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF8E6B] to-[#FF7D5A] text-white text-xs font-bold shadow-md">
                                    上传全屋贴图（本地/图床）
                                </button>

                                {activeRoom.roomTextureUrl ? (
                                    <div className="bg-[#FDF8F2] rounded-xl p-3 border border-[#F2E5D6] space-y-2">
                                        <div className="text-[11px] text-[#7A5238] font-bold">当前贴图</div>
                                        <div className="rounded-lg overflow-hidden border border-[#E8DAC6] shadow-inner" style={{ aspectRatio: '4/3' }}>
                                            <div className="relative w-full h-full" style={{ background: toCssBackground(activeRoom.wallpaperLeft, 'linear-gradient(180deg, #FFF5E9, #FDE5D8)') }}>
                                                <div className="absolute left-0 right-0 bottom-0" style={{ height: `${FLOOR_H_RATIO * 100}%`, background: toCssBackground(activeRoom.floorStyle, 'linear-gradient(135deg, #D6B48C, #C69767)') }} />
                                                <img
                                                    src={activeRoom.roomTextureUrl}
                                                    alt="texture"
                                                    className="absolute inset-0 w-full h-full object-contain"
                                                    style={{ transform: `scale(${activeRoom.roomTextureScale ?? 1})`, transformOrigin: 'center center' }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="text-[10px] text-[#8A5A3D]">缩放</div>
                                            <div className="text-[10px] text-[#B8956E] font-mono">{(activeRoom.roomTextureScale ?? 1).toFixed(2)}x</div>
                                        </div>
                                        <input
                                            type="range" min={0.5} max={2.5} step={0.05}
                                            value={activeRoom.roomTextureScale ?? 1}
                                            onChange={async (e) => {
                                                const scale = parseFloat(e.target.value);
                                                await saveDollhouse({ ...dh, rooms: dh.rooms.map(r => r.id === activeRoom.id ? { ...r, roomTextureScale: scale } : r) });
                                            }}
                                            className="w-full accent-[#FF8E6B]"
                                        />

                                        <button
                                            onClick={async () => {
                                                await saveDollhouse({ ...dh, rooms: dh.rooms.map(r => r.id === activeRoom.id ? { ...r, roomTextureUrl: undefined, roomTextureScale: 1 } : r) });
                                                addToast('已清除全屋贴图', 'success');
                                            }}
                                            className="w-full py-2 rounded-xl bg-[#FCE4E4] text-[#AF4444] text-xs font-bold border border-[#F5CDCD]"
                                        >
                                            清除贴图
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-[10px] text-[#B8956E]">
                                        暂无全屋贴图，点击上方按钮上传
                                    </div>
                                )}
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
                                <p className="mt-2 text-[10px] text-[#A67E62]">提示：长按家具可拖动位置，双击可删除。</p>
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

            {showTextureModal && (
                <div className="absolute inset-0 z-[95] bg-black/35 flex items-center justify-center" onClick={() => setShowTextureModal(false)}>
                    <div className="w-[92%] max-h-[85vh] bg-white rounded-2xl p-4 overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-bold text-[#7A5238]">
                                {textureTarget === 'room' ? '全屋贴图' : textureTarget === 'wallpaper' ? '自定义墙纸' : '自定义地板'}
                            </div>
                            <button onClick={() => setShowTextureModal(false)} className="w-7 h-7 rounded-full bg-[#F4E6DA] text-[#8A5A3D] text-xs font-bold">x</button>
                        </div>

                        {/* Live Preview */}
                        {textureTarget === 'room' && (
                            <div className="mb-3 rounded-xl overflow-hidden border border-[#E8DAC6] shadow-inner" style={{ aspectRatio: '4/3' }}>
                                <div className="relative w-full h-full" style={{ background: toCssBackground(activeRoom.wallpaperLeft, 'linear-gradient(180deg, #FFF5E9, #FDE5D8)') }}>
                                    <div className="absolute left-0 right-0 bottom-0" style={{ height: `${FLOOR_H_RATIO * 100}%`, background: toCssBackground(activeRoom.floorStyle, 'linear-gradient(135deg, #D6B48C, #C69767)') }} />
                                    {textureUrl && (
                                        <div className="absolute inset-0">
                                            <img
                                                src={textureUrl}
                                                alt="preview"
                                                draggable={false}
                                                className="absolute inset-0 w-full h-full object-contain"
                                                style={{ transform: `scale(${textureScale})`, transformOrigin: 'center center' }}
                                            />
                                        </div>
                                    )}
                                    {!textureUrl && (
                                        <div className="absolute inset-0 flex items-center justify-center text-[#B8956E]/50 text-xs font-bold">
                                            上传图片后预览
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {textureTarget !== 'room' && textureUrl && (
                            <div className="mb-3 h-20 rounded-xl overflow-hidden border border-[#E8DAC6]">
                                <div className="w-full h-full" style={{ background: toCssBackground(textureUrl) }} />
                            </div>
                        )}

                        <input value={textureUrl} onChange={(e) => setTextureUrl(e.target.value)} placeholder="图床URL 或本地上传" className="w-full mb-2 px-3 py-2.5 rounded-xl border border-[#E9D0BD] text-sm bg-[#FDFAF5]" />

                        {textureTarget === 'room' && (
                            <div className="mb-3 bg-[#FDF8F2] rounded-xl p-3 border border-[#F2E5D6]">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-[11px] text-[#8A5A3D] font-bold">缩放</div>
                                    <div className="text-[11px] text-[#B8956E] font-mono">{textureScale.toFixed(2)}x</div>
                                </div>
                                <input type="range" min={0.5} max={2.5} step={0.05} value={textureScale} onChange={(e) => setTextureScale(parseFloat(e.target.value))} className="w-full accent-[#FF8E6B]" />
                                <div className="flex justify-between text-[9px] text-[#C4A882] mt-1">
                                    <span>0.5x</span>
                                    <span>1.0x</span>
                                    <span>2.5x</span>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button onClick={() => textureInputRef.current?.click()} className="flex-1 py-2.5 rounded-xl bg-[#F7E8DB] text-[#7A5238] text-xs font-bold border border-[#E9D0BD]">
                                上传本地图片
                            </button>
                            <button onClick={handleSaveCustomTexture} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF8E6B] to-[#FF7D5A] text-white text-xs font-bold shadow-md">
                                保存
                            </button>
                        </div>
                        <input ref={textureInputRef} type="file" accept="image/*" onChange={handleTextureUpload} className="hidden" />
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
