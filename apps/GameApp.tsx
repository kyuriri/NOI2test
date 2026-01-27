
import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { GameSession, GameTheme, CharacterProfile, GameLog } from '../types';
import { ContextBuilder } from '../utils/context';
import Modal from '../components/os/Modal';

// --- Themes Configuration ---
const GAME_THEMES: Record<GameTheme, { bg: string, text: string, accent: string, font: string, border: string, cardBg: string }> = {
    fantasy: {
        bg: 'bg-[#fdf6e3]',
        text: 'text-[#433422]',
        accent: 'text-[#c2410c]',
        font: 'font-serif',
        border: 'border-[#d4c4a8]',
        cardBg: 'bg-[#f5e6d3]'
    },
    cyber: {
        bg: 'bg-[#0b1120]',
        text: 'text-[#94a3b8]',
        accent: 'text-[#06b6d4]',
        font: 'font-mono',
        border: 'border-[#1e293b]',
        cardBg: 'bg-[#1e293b]/50'
    },
    horror: {
        bg: 'bg-[#1a0505]',
        text: 'text-[#a1a1aa]',
        accent: 'text-[#ef4444]',
        font: 'font-serif',
        border: 'border-[#450a0a]',
        cardBg: 'bg-[#2b0e0e]'
    },
    modern: {
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        accent: 'text-blue-600',
        font: 'font-sans',
        border: 'border-slate-200',
        cardBg: 'bg-white'
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
    }, [activeGame?.logs, view]);

    const loadGames = async () => {
        const list = await DB.getAllGames();
        setGames(list.sort((a,b) => b.lastPlayedAt - a.lastPlayedAt));
    };

    // --- Creation Logic ---
    const handleCreateGame = async () => {
        if (!newTitle.trim() || !newWorld.trim() || selectedPlayers.size === 0) {
            addToast('请填写完整信息并选择至少一名角色', 'error');
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
                handleAction(`[System: 投掷了 D20 骰子，结果: ${final}]`);
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
            role: actionText.startsWith('[System') ? 'system' : 'player',
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
                playerContext += `\n<<< 角色档案 (Player Character): ${p.name} (ID: ${p.id}) >>>\n${ContextBuilder.buildCoreContext(p, userProfile, true)}\n`;
            }

            const prompt = `### TRPG 跑团模式 (Tabletop Role-Playing Game)
**世界观**: ${activeGame.worldSetting}
**当前地点**: ${activeGame.status.location}
**队伍状态**: HP ${activeGame.status.health}% | 物品栏: ${activeGame.status.inventory.join(', ') || '空'}

### 队伍成员 (AI 扮演)
${players.map(p => `- ${p.name} (ID: ${p.id})`).join('\n')}

### 玩家 (User)
${userProfile.name}

### 角色档案与记忆 (Character Contexts)
${playerContext}

### 最近记录 (Recent Logs)
${updatedLogs.slice(-10).map(l => `[${l.role === 'gm' ? 'GM' : (l.speakerName || 'System')}]: ${l.content}`).join('\n')}

### 任务：生成剧情响应
请根据玩家的行动，生成剧情发展和角色的反应。
**必须**包含以下两部分：
1. **GM (主持人)**: 判定玩家行动的结果。描述环境变化、敌人行动或发现的物品。客观、沉浸。
2. **角色反应 (Reactions)**: 队伍中的 **每一位** 角色都**必须**对当前情况或玩家的行动做出反应。
   - **对话 (Dialogue)**: 一句简短的台词。可以是吐槽、建议、情感表达或战术交流。
   - **动作 (Action)**: 一个具体的肢体动作。

### 输出格式 (Strict JSON)
请仅输出 JSON，不要包含markdown代码块。
{
  "gm_narrative": "GM的剧情描述 (中文)...",
  "characters": [
    { 
      "charId": "角色的ID (必须与上方列表一致)", 
      "action": "动作描述 (中文)", 
      "dialogue": "台词内容 (中文)" 
    }
  ],
  "newLocation": "可选：新地点名称",
  "hpChange": 0,
  "newItem": "可选：获得的物品名称"
}
`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.85, 
                    max_tokens: 3000
                })
            });

            if (response.ok) {
                const data = await response.json();
                let content = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
                const res = JSON.parse(content);

                const newLogs: GameLog[] = [];
                
                // 1. GM Narrative Log
                if (res.gm_narrative) {
                    newLogs.push({
                        id: `gm-${Date.now()}`,
                        role: 'gm',
                        content: res.gm_narrative,
                        timestamp: Date.now()
                    });
                }

                // 2. Character Reaction Logs
                if (res.characters && Array.isArray(res.characters)) {
                    for (const charAct of res.characters) {
                        const char = players.find(p => p.id === charAct.charId);
                        if (char) {
                            // Format: "*Action* “Dialogue”"
                            const combinedContent = `*${charAct.action}* “${charAct.dialogue}”`;
                            
                            newLogs.push({
                                id: `char-${Date.now()}-${Math.random()}`,
                                role: 'character',
                                speakerName: char.name, // Link name for UI lookup
                                content: combinedContent,
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
                <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 shrink-0 bg-slate-900/90 backdrop-blur z-10 sticky top-0">
                    <button onClick={closeApp} className="p-2 -ml-2 hover:bg-slate-800 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                    <span className="font-bold tracking-widest text-lg text-orange-500">异界罗盘</span>
                    <button onClick={() => setView('create')} className="bg-orange-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-orange-500 shadow-lg shadow-orange-900/20 active:scale-95 transition-transform">NEW GAME</button>
                </div>
                <div className="p-6 grid grid-cols-1 gap-4 overflow-y-auto no-scrollbar">
                    {games.length === 0 && <div className="text-center text-slate-600 mt-20 text-sm flex flex-col items-center gap-2"><span className="text-4xl opacity-50">🎲</span>暂无存档，开始新的冒险吧。</div>}
                    {games.map(g => (
                        <div key={g.id} onClick={() => { setActiveGame(g); setView('play'); }} className="bg-slate-800 border border-slate-700 p-4 rounded-xl cursor-pointer hover:border-orange-500 transition-all relative group active:scale-[0.98]">
                            <div className="flex justify-between mb-2">
                                <h3 className="font-bold text-lg text-slate-200">{g.title}</h3>
                                <span className="text-[10px] bg-black/30 px-2 py-1 rounded text-slate-400 uppercase font-mono">{g.theme}</span>
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed font-serif italic">"{g.worldSetting}"</p>
                            <div className="flex justify-between items-end border-t border-slate-700/50 pt-3">
                                <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2">
                                        {characters.filter(c => g.playerCharIds.includes(c.id)).map(c => (
                                            <img key={c.id} src={c.avatar} className="w-6 h-6 rounded-full border border-slate-800 object-cover" />
                                        ))}
                                    </div>
                                    <span className="text-[10px] text-slate-500">Last played: {new Date(g.lastPlayedAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <button onClick={(e) => handleDeleteGame(e, g.id)} className="absolute top-2 right-2 p-1.5 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (view === 'create') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans">
                <div className="h-16 flex items-center px-4 border-b border-slate-200 bg-white shrink-0 sticky top-0 z-10">
                    <button onClick={() => setView('lobby')} className="p-2 -ml-2 text-slate-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                    <span className="font-bold text-slate-700 ml-2">创建世界</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">剧本标题</label>
                        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 outline-none transition-colors" placeholder="例如：勇者斗恶龙" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">世界观设定 (Lore)</label>
                        <textarea value={newWorld} onChange={e => setNewWorld(e.target.value)} className="w-full h-32 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 outline-none resize-none transition-colors" placeholder="这是一个魔法与科技共存的世界..." />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">画风主题</label>
                        <div className="flex gap-2 flex-wrap">
                            {(['fantasy', 'cyber', 'horror', 'modern'] as GameTheme[]).map(t => (
                                <button key={t} onClick={() => setNewTheme(t)} className={`px-4 py-2 rounded-xl text-xs font-bold capitalize border transition-all active:scale-95 ${newTheme === t ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}>{t}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">邀请玩家</label>
                        <div className="grid grid-cols-4 gap-3">
                            {characters.map(c => (
                                <div key={c.id} onClick={() => { const s = new Set(selectedPlayers); if(s.has(c.id)) s.delete(c.id); else s.add(c.id); setSelectedPlayers(s); }} className={`flex flex-col items-center p-2 rounded-xl border cursor-pointer transition-all active:scale-95 ${selectedPlayers.has(c.id) ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-transparent hover:bg-slate-100'}`}>
                                    <img src={c.avatar} className="w-12 h-12 rounded-full object-cover shadow-sm" />
                                    <span className={`text-[9px] mt-2 truncate w-full text-center font-medium ${selectedPlayers.has(c.id) ? 'text-orange-600' : 'text-slate-600'}`}>{c.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-200 bg-white">
                    <button onClick={handleCreateGame} className="w-full py-3 bg-slate-800 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
                        <span>🚀</span> 开始冒险
                    </button>
                </div>
            </div>
        );
    }

    // PLAY VIEW
    if (!activeGame) return null;
    const theme = GAME_THEMES[activeGame.theme];
    const activePlayers = characters.filter(c => activeGame.playerCharIds.includes(c.id));

    return (
        <div className={`h-full w-full flex flex-col ${theme.bg} ${theme.text} ${theme.font} transition-colors duration-500 relative`}>
            
            {/* Header */}
            <div className={`h-14 flex items-center justify-between px-4 border-b ${theme.border} shrink-0 bg-opacity-90 backdrop-blur z-20`}>
                <button onClick={handleSaveAndQuit} className={`px-3 py-1 text-[10px] font-bold border ${theme.border} rounded hover:bg-white/10 active:scale-95 transition-transform`}>Save & Quit</button>
                <div className="flex flex-col items-center">
                    <span className="font-bold text-sm tracking-wide">{activeGame.title}</span>
                    <span className="text-[9px] opacity-60 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        {activeGame.status.location}
                    </span>
                </div>
                <div className={`text-xs font-bold ${theme.accent} font-mono`}>HP {activeGame.status.health}</div>
            </div>

            {/* Party HUD (Heads-Up Display) */}
            <div className={`px-4 py-3 border-b ${theme.border} bg-black/10 backdrop-blur-sm z-10 flex gap-4 overflow-x-auto no-scrollbar items-center justify-center shrink-0`}>
                {activePlayers.map(p => (
                    <div key={p.id} className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity relative group">
                        <div className={`w-10 h-10 rounded-full border-2 ${theme.border} p-0.5 relative`}>
                            <img src={p.avatar} className="w-full h-full rounded-full object-cover" />
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-black"></div>
                        </div>
                        <span className="text-[9px] font-bold opacity-70">{p.name}</span>
                    </div>
                ))}
            </div>

            {/* Stage / Log Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar relative">
                {activeGame.logs.map((log, i) => {
                    const isGM = log.role === 'gm';
                    const isSystem = log.role === 'system';
                    const isCharacter = log.role === 'character';
                    const charInfo = isCharacter ? activePlayers.find(p => p.name === log.speakerName) : null;

                    if (isSystem) {
                        return (
                            <div key={log.id || i} className="flex justify-center my-4 animate-fade-in">
                                <span className="text-[10px] opacity-50 border-b border-dashed border-current pb-0.5 font-mono">{log.content}</span>
                            </div>
                        );
                    }

                    if (isGM) {
                        return (
                            <div key={log.id || i} className="animate-fade-in my-4">
                                <div className={`p-5 rounded-lg border-2 ${theme.border} ${theme.cardBg} leading-relaxed text-sm shadow-sm relative mx-auto w-full`}>
                                    <div className="absolute -top-3 left-4 bg-inherit px-2 text-[10px] font-bold uppercase tracking-widest opacity-80 border border-inherit rounded">Game Master</div>
                                    <div className="whitespace-pre-wrap font-medium">{log.content}</div>
                                </div>
                            </div>
                        );
                    }

                    // Character Log
                    if (isCharacter && charInfo) {
                        return (
                            <div key={log.id || i} className="flex gap-3 animate-slide-up">
                                <img src={charInfo.avatar} className={`w-10 h-10 rounded-full object-cover border ${theme.border} shrink-0 mt-1`} />
                                <div className="flex flex-col max-w-[80%]">
                                    <span className="text-[10px] font-bold opacity-60 mb-1 ml-1">{charInfo.name}</span>
                                    <div className={`px-4 py-2 rounded-2xl rounded-tl-none text-sm ${theme.cardBg} border ${theme.border} shadow-sm`}>
                                        {/* Render Markdown-like bolding for Actions */}
                                        {log.content.split(/(\*.*?\*)/).map((part, idx) => 
                                            part.startsWith('*') && part.endsWith('*') 
                                            ? <span key={idx} className="italic opacity-70 block mb-1 text-xs">{part.slice(1, -1)}</span> 
                                            : <span key={idx}>{part}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // Player (User) Log
                    return (
                        <div key={log.id || i} className="flex flex-col items-end animate-slide-up">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold opacity-60`}>{log.speakerName}</span>
                                {log.diceRoll && (
                                    <span className="text-[10px] bg-white/20 px-1.5 rounded text-yellow-500 font-mono">
                                        🎲 {log.diceRoll.result}
                                    </span>
                                )}
                            </div>
                            <div className={`px-4 py-2 rounded-2xl rounded-tr-none text-sm bg-orange-600 text-white shadow-md max-w-[85%]`}>
                                {log.content}
                            </div>
                        </div>
                    );
                })}
                {isTyping && <div className="text-xs opacity-50 animate-pulse pl-2 font-mono">DM 正在计算结果...</div>}
                <div ref={logsEndRef} />
            </div>

            {/* Controls */}
            <div className={`p-4 border-t ${theme.border} bg-opacity-90 backdrop-blur shrink-0 z-20`}>
                <div className="flex gap-2 mb-3">
                    <button 
                        onClick={rollDice} 
                        disabled={isRolling}
                        className={`flex-1 py-2 rounded border ${theme.border} hover:bg-white/10 active:scale-95 transition-transform flex items-center justify-center gap-2 font-bold text-sm`}
                    >
                        <span className="text-xl">🎲</span> {isRolling ? 'Rolling...' : (diceResult || 'Roll D20')}
                    </button>
                    {['调查', '攻击', '交涉'].map(action => (
                        <button key={action} onClick={() => handleAction(action)} className={`px-4 py-2 rounded border ${theme.border} hover:bg-white/10 text-xs font-bold transition-colors active:scale-95`}>{action}</button>
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
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center text-white flex-col gap-4 animate-fade-in">
                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs tracking-widest font-mono">SAVING MEMORIES...</span>
                </div>
            )}
        </div>
    );
};

export default GameApp;
