
import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { GameSession, GameTheme, CharacterProfile, GameLog } from '../types';
import { ContextBuilder } from '../utils/context';
import Modal from '../components/os/Modal';

// --- Themes Configuration ---
const GAME_THEMES: Record<GameTheme, { bg: string, text: string, accent: string, font: string, border: string }> = {
    fantasy: {
        bg: 'bg-[#fdf6e3]',
        text: 'text-[#5c4033]',
        accent: 'text-[#c2410c]',
        font: 'font-serif',
        border: 'border-[#d4c4a8]'
    },
    cyber: {
        bg: 'bg-[#0f172a]',
        text: 'text-[#94a3b8]',
        accent: 'text-[#06b6d4]',
        font: 'font-mono',
        border: 'border-[#1e293b]'
    },
    horror: {
        bg: 'bg-[#1a0505]',
        text: 'text-[#a1a1aa]',
        accent: 'text-[#ef4444]',
        font: 'font-serif',
        border: 'border-[#450a0a]'
    },
    modern: {
        bg: 'bg-white',
        text: 'text-slate-700',
        accent: 'text-blue-500',
        font: 'font-sans',
        border: 'border-slate-200'
    }
};

const GameApp: React.FC = () => {
    const { closeApp, characters, userProfile, apiConfig, addToast, updateCharacter } = useOS();
    const [view, setView] = useState<'lobby' | 'create' | 'play'>('lobby');
    const [games, setGames] = useState<GameSession[]>([]);
    const [activeGame, setActiveGame] = useState<GameSession | null>(null);
    
    // Creation State
    const [newTitle, setNewTitle] = useState('');
    const [newWorld, setNewWorld] = useState('');
    const [newTheme, setNewTheme] = useState<GameTheme>('fantasy');
    const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());

    // Play State
    const [userInput, setUserInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [diceResult, setDiceResult] = useState<number | null>(null);
    const [isRolling, setIsRolling] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Archive State
    const [isArchiving, setIsArchiving] = useState(false);

    useEffect(() => {
        loadGames();
    }, []);

    useEffect(() => {
        if (view === 'play' && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [activeGame?.logs]);

    const loadGames = async () => {
        const list = await DB.getAllGames();
        setGames(list.sort((a,b) => b.lastPlayedAt - a.lastPlayedAt));
    };

    // --- Creation Logic ---
    const handleCreateGame = async () => {
        if (!newTitle.trim() || !newWorld.trim() || selectedPlayers.size === 0) {
            addToast('请填写完整信息并选择角色', 'error');
            return;
        }

        const newGame: GameSession = {
            id: `game-${Date.now()}`,
            title: newTitle,
            theme: newTheme,
            worldSetting: newWorld,
            playerCharIds: Array.from(selectedPlayers),
            logs: [{
                id: 'init',
                role: 'gm',
                content: `欢迎来到 "${newTitle}"。\n世界观载入中...\n${newWorld}`,
                timestamp: Date.now()
            }],
            status: {
                location: 'Start Point',
                health: 100,
                inventory: []
            },
            createdAt: Date.now(),
            lastPlayedAt: Date.now()
        };

        await DB.saveGame(newGame);
        setGames(prev => [newGame, ...prev]);
        setActiveGame(newGame);
        setView('play');
        
        // Reset form
        setNewTitle('');
        setNewWorld('');
        setSelectedPlayers(new Set());
    };

    // --- Gameplay Logic ---
    const rollDice = () => {
        if (isRolling || isTyping) return;
        setIsRolling(true);
        const duration = 1000;
        const start = Date.now();
        
        const animate = () => {
            const now = Date.now();
            if (now - start > duration) {
                const final = Math.floor(Math.random() * 20) + 1;
                setDiceResult(final);
                setIsRolling(false);
                handleAction(`[系统: 投掷了 D20 骰子，结果: ${final}]`);
            } else {
                setDiceResult(Math.floor(Math.random() * 20) + 1);
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    };

    const handleAction = async (actionText: string) => {
        if (!activeGame || !apiConfig.apiKey) return;
        
        // 1. Add User/System Action to Log
        const userLog: GameLog = {
            id: `log-${Date.now()}`,
            role: actionText.startsWith('[系统') ? 'system' : 'player',
            speakerName: userProfile.name,
            content: actionText,
            timestamp: Date.now(),
            diceRoll: diceResult ? { result: diceResult, max: 20 } : undefined
        };
        
        const updatedLogs = [...activeGame.logs, userLog];
        const updatedGame = { ...activeGame, logs: updatedLogs, lastPlayedAt: Date.now() };
        setActiveGame(updatedGame);
        await DB.saveGame(updatedGame);
        
        setUserInput('');
        setDiceResult(null);
        setIsTyping(true);

        try {
            // 2. Build Context WITH MEMORY
            const players = characters.filter(c => activeGame.playerCharIds.includes(c.id));
            let playerContext = "";
            for (const p of players) {
                // FIXED: Include detailed memories (true) so characters act based on history
                playerContext += `\n<<< 玩家角色档案: ${p.name} >>>\n${ContextBuilder.buildCoreContext(p, userProfile, true)}\n`;
            }

            const prompt = `### TRPG Mode (Tabletop Role-Playing Game)
**World Setting**: ${activeGame.worldSetting}
**Current Location**: ${activeGame.status.location}
**Party Status**: HP ${activeGame.status.health}% | Inventory: ${activeGame.status.inventory.join(', ') || 'Empty'}

### Players
User: ${userProfile.name}
Characters (AI Controlled): ${players.map(p => p.name).join(', ')}

### Character Contexts (Identity & Memories)
${playerContext}

### Recent Log
${updatedLogs.slice(-15).map(l => `[${l.role === 'gm' ? 'GM' : (l.speakerName || 'System')}]: ${l.content}`).join('\n')}

### Task (You play the Game Master & The Characters)
1. **GM Narrate**: Describe the outcome of the user's action/dice roll. Be descriptive based on the Theme (${activeGame.theme}).
2. **Character Roleplay**: 
   - If appropriate, make the characters react. 
   - **CRITICAL**: You MUST use their "Context" and "Memory". If something in the game reminds them of a past memory (from their context), mention it! 
   - Example: If they are scared of water in their backstory/memory, they should be scared of a river in the game.
3. **State Update**: Update location/health/inventory if changed.

### Output Format (JSON Only)
{
  "narrative": "GM's description of the scene...",
  "characterReactions": [
    { "charId": "id_of_character", "text": "Dialogue..." }
  ],
  "newLocation": "Optional new location name",
  "hpChange": 0,
  "newItem": "Optional item name"
}
`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.85, // Slightly higher for creativity
                    max_tokens: 3000
                })
            });

            if (response.ok) {
                const data = await response.json();
                let content = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
                const res = JSON.parse(content);

                const newLogs: GameLog[] = [];
                
                // GM Narrative
                if (res.narrative) {
                    newLogs.push({
                        id: `gm-${Date.now()}`,
                        role: 'gm',
                        content: res.narrative,
                        timestamp: Date.now()
                    });
                }

                // Character Reactions
                if (res.characterReactions && Array.isArray(res.characterReactions)) {
                    for (const reaction of res.characterReactions) {
                        const char = players.find(p => p.id === reaction.charId);
                        if (char) {
                            newLogs.push({
                                id: `char-${Date.now()}-${Math.random()}`,
                                role: 'character',
                                speakerName: char.name,
                                content: reaction.text,
                                timestamp: Date.now()
                            });
                        }
                    }
                }

                // Update State
                const newStatus = { ...activeGame.status };
                if (res.newLocation) newStatus.location = res.newLocation;
                if (res.hpChange) newStatus.health = Math.max(0, Math.min(100, newStatus.health + res.hpChange));
                if (res.newItem) newStatus.inventory = [...newStatus.inventory, res.newItem];

                const finalGame = {
                    ...updatedGame,
                    logs: [...updatedLogs, ...newLogs],
                    status: newStatus
                };
                
                setActiveGame(finalGame);
                await DB.saveGame(finalGame);
            }

        } catch (e: any) {
            addToast(`GM 掉线了: ${e.message}`, 'error');
        } finally {
            setIsTyping(false);
        }
    };

    const handleSaveAndQuit = async () => {
        if (!activeGame) return;
        setIsArchiving(true);
        
        try {
            // Generate Summary Memory
            const players = characters.filter(c => activeGame.playerCharIds.includes(c.id));
            const logText = activeGame.logs.slice(-20).map(l => `${l.role}: ${l.content}`).join('\n');
            
            const prompt = `Task: Summarize this RPG session into a short memory fragment (1 sentence) for the character.
Game: ${activeGame.title}
Logs:
${logText}
Output: A first-person memory summary in Chinese.`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: prompt }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const summary = data.choices[0].message.content.trim();
                
                // Distribute memory
                for (const p of players) {
                    const mem = {
                        id: `mem-${Date.now()}`,
                        date: new Date().toLocaleDateString(),
                        summary: `[异界冒险: ${activeGame.title}] ${summary}`,
                        mood: 'fun'
                    };
                    updateCharacter(p.id, { memories: [...(p.memories || []), mem] });
                }
                addToast('游戏进度已保存并生成记忆', 'success');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsArchiving(false);
            setView('lobby');
            setActiveGame(null);
        }
    };

    const handleDeleteGame = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('确定删除此存档吗？')) {
            await DB.deleteGame(id);
            setGames(prev => prev.filter(g => g.id !== id));
        }
    };

    // --- Renderers ---

    if (view === 'lobby') {
        return (
            <div className="h-full w-full bg-slate-900 text-slate-200 flex flex-col font-sans">
                <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 shrink-0">
                    <button onClick={closeApp} className="p-2 -ml-2 hover:bg-slate-800 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                    <span className="font-bold tracking-widest text-lg text-orange-500">异界罗盘</span>
                    <button onClick={() => setView('create')} className="bg-orange-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-orange-500">NEW GAME</button>
                </div>
                <div className="p-6 grid grid-cols-1 gap-4 overflow-y-auto no-scrollbar">
                    {games.length === 0 && <div className="text-center text-slate-600 mt-20 text-sm">暂无存档，开始新的冒险吧。</div>}
                    {games.map(g => (
                        <div key={g.id} onClick={() => { setActiveGame(g); setView('play'); }} className="bg-slate-800 border border-slate-700 p-4 rounded-xl cursor-pointer hover:border-orange-500 transition-colors relative group">
                            <div className="flex justify-between mb-2">
                                <h3 className="font-bold text-lg text-slate-200">{g.title}</h3>
                                <span className="text-[10px] bg-black/30 px-2 py-1 rounded text-slate-400 uppercase">{g.theme}</span>
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-2 mb-3">{g.worldSetting}</p>
                            <div className="flex justify-between items-end">
                                <div className="flex -space-x-2">
                                    {characters.filter(c => g.playerCharIds.includes(c.id)).map(c => (
                                        <img key={c.id} src={c.avatar} className="w-6 h-6 rounded-full border border-slate-800" />
                                    ))}
                                </div>
                                <span className="text-[10px] text-slate-600">{new Date(g.lastPlayedAt).toLocaleDateString()}</span>
                            </div>
                            <button onClick={(e) => handleDeleteGame(e, g.id)} className="absolute top-2 right-2 p-1 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (view === 'create') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans">
                <div className="h-16 flex items-center px-4 border-b border-slate-200 bg-white shrink-0">
                    <button onClick={() => setView('lobby')} className="p-2 -ml-2 text-slate-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                    <span className="font-bold text-slate-700 ml-2">创建世界</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">剧本标题</label>
                        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 outline-none" placeholder="例如：勇者斗恶龙" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">世界观设定 (Lore)</label>
                        <textarea value={newWorld} onChange={e => setNewWorld(e.target.value)} className="w-full h-32 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 outline-none resize-none" placeholder="这是一个魔法与科技共存的世界..." />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">画风主题</label>
                        <div className="flex gap-2">
                            {(['fantasy', 'cyber', 'horror', 'modern'] as GameTheme[]).map(t => (
                                <button key={t} onClick={() => setNewTheme(t)} className={`px-3 py-2 rounded-lg text-xs font-bold capitalize border ${newTheme === t ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-500 border-slate-200'}`}>{t}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">邀请玩家</label>
                        <div className="grid grid-cols-4 gap-2">
                            {characters.map(c => (
                                <div key={c.id} onClick={() => { const s = new Set(selectedPlayers); if(s.has(c.id)) s.delete(c.id); else s.add(c.id); setSelectedPlayers(s); }} className={`flex flex-col items-center p-2 rounded-xl border cursor-pointer ${selectedPlayers.has(c.id) ? 'border-orange-500 bg-orange-50' : 'border-transparent hover:bg-slate-100'}`}>
                                    <img src={c.avatar} className="w-10 h-10 rounded-full object-cover" />
                                    <span className="text-[9px] mt-1 text-slate-600 truncate w-full text-center">{c.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-200 bg-white">
                    <button onClick={handleCreateGame} className="w-full py-3 bg-slate-800 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform">开始冒险</button>
                </div>
            </div>
        );
    }

    // PLAY VIEW
    if (!activeGame) return null;
    const theme = GAME_THEMES[activeGame.theme];

    return (
        <div className={`h-full w-full flex flex-col ${theme.bg} ${theme.text} ${theme.font} transition-colors duration-500 relative`}>
            {/* Header */}
            <div className={`h-14 flex items-center justify-between px-4 border-b ${theme.border} shrink-0 bg-opacity-90 backdrop-blur`}>
                <button onClick={handleSaveAndQuit} className={`px-3 py-1 text-xs font-bold border ${theme.border} rounded hover:bg-white/10`}>Save & Quit</button>
                <div className="flex flex-col items-center">
                    <span className="font-bold text-sm tracking-wide">{activeGame.title}</span>
                    <span className="text-[9px] opacity-60">{activeGame.status.location}</span>
                </div>
                <div className={`text-xs font-bold ${theme.accent}`}>HP {activeGame.status.health}</div>
            </div>

            {/* Stage / Log Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar relative">
                {activeGame.logs.map((log, i) => {
                    const isGM = log.role === 'gm';
                    const isSystem = log.role === 'system';
                    
                    if (isSystem) {
                        return (
                            <div key={log.id || i} className="flex justify-center my-4">
                                <span className="text-[10px] opacity-50 border-b border-dashed border-current pb-0.5">{log.content}</span>
                            </div>
                        );
                    }

                    return (
                        <div key={log.id || i} className={`flex flex-col ${log.role === 'player' ? 'items-end' : 'items-start'} animate-fade-in`}>
                            <div className={`max-w-[85%] ${isGM ? 'w-full' : ''}`}>
                                {isGM ? (
                                    <div className={`p-4 rounded-lg border-2 ${theme.border} bg-black/5 leading-relaxed text-sm shadow-sm relative`}>
                                        <div className="absolute -top-2.5 left-4 bg-inherit px-2 text-[9px] font-bold uppercase tracking-widest opacity-70">Narrator</div>
                                        {log.content}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        <span className={`text-[9px] font-bold opacity-60 ${log.role === 'player' ? 'text-right' : ''}`}>{log.speakerName}</span>
                                        <div className={`px-4 py-2 rounded-xl text-sm ${log.role === 'player' ? 'bg-orange-500 text-white rounded-tr-none' : `bg-white/10 border ${theme.border} rounded-tl-none`}`}>
                                            {log.content}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {isTyping && <div className="text-xs opacity-50 animate-pulse pl-2">DM 正在编写剧情...</div>}
                <div ref={logsEndRef} />
            </div>

            {/* Controls */}
            <div className={`p-4 border-t ${theme.border} bg-opacity-90 backdrop-blur shrink-0`}>
                <div className="flex gap-2 mb-3">
                    <button 
                        onClick={rollDice} 
                        disabled={isRolling}
                        className={`flex-1 py-2 rounded border ${theme.border} hover:bg-white/10 active:scale-95 transition-transform flex items-center justify-center gap-2 font-bold text-sm`}
                    >
                        <span className="text-xl">🎲</span> {isRolling ? 'Rolling...' : (diceResult || 'Roll D20')}
                    </button>
                    {['调查', '攻击', '交涉'].map(action => (
                        <button key={action} onClick={() => handleAction(action)} className={`px-4 py-2 rounded border ${theme.border} hover:bg-white/10 text-xs font-bold`}>{action}</button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input 
                        value={userInput} 
                        onChange={e => setUserInput(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleAction(userInput)}
                        placeholder="你打算做什么..." 
                        className={`flex-1 bg-transparent border-b ${theme.border} px-2 py-2 outline-none text-sm placeholder-opacity-30 placeholder-current`}
                    />
                    <button onClick={() => handleAction(userInput)} className={`${theme.accent} font-bold text-sm px-2`}>执行</button>
                </div>
            </div>

            {/* Archive Overlay */}
            {isArchiving && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center text-white flex-col gap-4">
                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs tracking-widest">SAVING MEMORIES...</span>
                </div>
            )}
        </div>
    );
};

export default GameApp;
