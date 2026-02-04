
import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { Message, MessageType, MemoryFragment, Emoji, EmojiCategory } from '../types';
import { processImage } from '../utils/file';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ContextBuilder } from '../utils/context';
import MessageItem from '../components/chat/MessageItem';
import { PRESET_THEMES, DEFAULT_ARCHIVE_PROMPTS } from '../components/chat/ChatConstants';
import ChatHeader from '../components/chat/ChatHeader';
import ChatInputArea from '../components/chat/ChatInputArea';
import ChatModals from '../components/chat/ChatModals';
import Modal from '../components/os/Modal';
import { toolbox } from '../utils/toolbox';

const Chat: React.FC = () => {
    const { characters, activeCharacterId, setActiveCharacterId, updateCharacter, apiConfig, closeApp, customThemes, removeCustomTheme, addToast, userProfile, lastMsgTimestamp, groups, clearUnread } = useOS();
    const [messages, setMessages] = useState<Message[]>([]);
    const [visibleCount, setVisibleCount] = useState(30);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [recallStatus, setRecallStatus] = useState<string>('');
    const [showPanel, setShowPanel] = useState<'none' | 'actions' | 'emojis' | 'chars'>('none');
    
    // Emoji State
    const [emojis, setEmojis] = useState<Emoji[]>([]);
    const [categories, setCategories] = useState<EmojiCategory[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('default');
    const [newCategoryName, setNewCategoryName] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);

    // Reply Logic
    const [replyTarget, setReplyTarget] = useState<Message | null>(null);

    // Stats
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);

    const [modalType, setModalType] = useState<'none' | 'transfer' | 'emoji-import' | 'chat-settings' | 'message-options' | 'edit-message' | 'delete-emoji' | 'delete-category' | 'add-category' | 'history-manager' | 'archive-settings' | 'prompt-editor'>('none');
    const [transferAmt, setTransferAmt] = useState('');
    const [emojiImportText, setEmojiImportText] = useState('');
    const [settingsContextLimit, setSettingsContextLimit] = useState(500);
    const [settingsHideSysLogs, setSettingsHideSysLogs] = useState(false);
    const [preserveContext, setPreserveContext] = useState(true); 
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [selectedEmoji, setSelectedEmoji] = useState<Emoji | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<EmojiCategory | null>(null); // For deletion modal
    const [editContent, setEditContent] = useState('');
    const [isSummarizing, setIsSummarizing] = useState(false);

    // Archive Prompts State
    const [archivePrompts, setArchivePrompts] = useState<{id: string, name: string, content: string}[]>(DEFAULT_ARCHIVE_PROMPTS);
    const [selectedPromptId, setSelectedPromptId] = useState<string>('preset_rational');
    const [editingPrompt, setEditingPrompt] = useState<{id: string, name: string, content: string} | null>(null);

    // --- Multi-Select State ---
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());

    // ===== OpenClaw Toolbox Functions =====
    const TOOLBOX_INSTRUCTION = `

### 🧰 扩展工具箱 (OpenClaw Toolbox)
当你需要执行以下操作时，使用工具调用格式 [[TOOL:工具名]]{"参数": "值"}：
- search - 网络搜索: [[TOOL:search]]{"query": "关键词"}
- fetch - 抓取网页: [[TOOL:fetch]]{"url": "https://..."}
- read - 读取文件: [[TOOL:read]]{"path": "/path/to/file"}
- write - 写入文件: [[TOOL:write]]{"path": "...", "content": "..."}
- edit - 编辑文件: [[TOOL:edit]]{"path": "...", "oldText": "...", "newText": "..."}
- exec - 执行命令: [[TOOL:exec]]{"command": "ls -la"}
- browser.open - 打开网页: [[TOOL:browser.open]]{"url": "https://..."}
- browser.screenshot - 截图: [[TOOL:browser.screenshot]]{}
- sendMessage - 发送消息: [[TOOL:sendMessage]]{"channel": "discord", "target": "#general", "message": "Hello"}

工具调用会立即执行，结果会反馈给你。`;

    const parseToolCalls = (text: string): Array<{name: string, params: any}> => {
        const calls: Array<{name: string, params: any}> = [];
        const regex = /\[\[TOOL:(\w+)\]\](\{[^\}]*\})/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            try { calls.push({ name: match[1], params: JSON.parse(match[2]) }); }
            catch (e) { console.error('Parse tool call failed:', match[0]); }
        }
        return calls;
    };

    const removeToolCalls = (text: string): string => {
        return text.replace(/\[\[TOOL:\w+\]\]\{[^\}]*\}/g, '').trim();
    };

    const executeTool = async (name: string, params: any): Promise<string> => {
        console.log(`[Toolbox] Executing: ${name}`, params);
        try {
            let result: any;
            switch (name) {
                case 'search':
                    result = await toolbox.search(params.query, params);
                    return result.ok ? result.results.map((r: any) => `[${r.title}] ${r.snippet}\n${r.url}`).join('\n\n') : '搜索失败';
                case 'fetch':
                    result = await toolbox.fetch(params.url, params.maxChars);
                    return result.ok ? result.text : '抓取失败';
                case 'read':
                    result = await toolbox.read(params.path, params.limit);
                    return result.ok ? result.content : '读取失败';
                case 'write':
                    result = await toolbox.write(params.path, params.content);
                    return result.ok ? '写入成功' : '写入失败';
                case 'edit':
                    result = await toolbox.edit(params.path, params.oldText, params.newText);
                    return result.ok ? '编辑成功' : '编辑失败';
                case 'exec':
                    result = await toolbox.exec(params.command, params.timeout);
                    return result.ok ? `退出码: ${result.exitCode}\n输出:\n${result.stdout}${result.stderr ? '\n错误:\n' + result.stderr : ''}` : '执行失败';
                case 'browser.open':
                    result = await toolbox.browser.open(params.url);
                    return result.ok ? `已打开: ${params.url}` : '打开失败';
                case 'browser.screenshot':
                    result = await toolbox.browser.screenshot(params.fullPage);
                    return result.ok ? '截图已保存' : '截图失败';
                case 'browser.snapshot':
                    result = await toolbox.browser.snapshot();
                    return result.ok ? result.snapshot : '快照失败';
                case 'sendMessage':
                    result = await toolbox.sendMessage(params.channel, params.target, params.message);
                    return result.ok ? '消息已发送' : '发送失败';
                default:
                    return `未知工具: ${name}`;
            }
        } catch (err: any) {
            return `工具执行错误: ${err.message}`;
        }
    };
    // ======================================

    const char = characters.find(c => c.id === activeCharacterId) || characters[0];
    const currentThemeId = char?.bubbleStyle || 'default';
    const activeTheme = useMemo(() => customThemes.find(t => t.id === currentThemeId) || PRESET_THEMES[currentThemeId] || PRESET_THEMES.default, [currentThemeId, customThemes]);
    const draftKey = `chat_draft_${activeCharacterId}`;

    const canReroll = !isTyping && messages.length > 0 && messages[messages.length - 1].role === 'assistant';

    const loadEmojiData = async () => {
        // Ensure default data exists
        await DB.initializeEmojiData();
        const [es, cats] = await Promise.all([DB.getEmojis(), DB.getEmojiCategories()]);
        setEmojis(es);
        setCategories(cats);
        // Ensure active category is valid
        if (activeCategory !== 'default' && !cats.some(c => c.id === activeCategory)) {
            setActiveCategory('default');
        }
    };

    useEffect(() => {
        if (activeCharacterId) {
            DB.getMessagesByCharId(activeCharacterId).then(setMessages);
            loadEmojiData();
            const savedDraft = localStorage.getItem(draftKey);
            setInput(savedDraft || '');
            if (char) {
                setSettingsContextLimit(char.contextLimit || 500);
                setSettingsHideSysLogs(char.hideSystemLogs || false);
                clearUnread(char.id);
            }
            setVisibleCount(30);
            setLastTokenUsage(null);
            setReplyTarget(null);
            setSelectionMode(false);
            setSelectedMsgIds(new Set());
        }
    }, [activeCharacterId]);

    useEffect(() => {
        const savedPrompts = localStorage.getItem('chat_archive_prompts');
        if (savedPrompts) {
            try {
                const parsed = JSON.parse(savedPrompts);
                const merged = [...DEFAULT_ARCHIVE_PROMPTS, ...parsed.filter((p: any) => !p.id.startsWith('preset_'))];
                setArchivePrompts(merged);
            } catch(e) {}
        }
        const savedId = localStorage.getItem('chat_active_archive_prompt_id');
        if (savedId && archivePrompts.some(p => p.id === savedId)) setSelectedPromptId(savedId);
    }, []);

    useEffect(() => {
        if (activeCharacterId && lastMsgTimestamp > 0) {
            DB.getMessagesByCharId(activeCharacterId).then(setMessages);
            clearUnread(activeCharacterId);
        }
    }, [lastMsgTimestamp]);

    const handleInputChange = (val: string) => {
        setInput(val);
        if (val.trim()) localStorage.setItem(draftKey, val);
        else localStorage.removeItem(draftKey);
    };

    useLayoutEffect(() => {
        if (scrollRef.current && !selectionMode) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length, activeCharacterId, selectionMode]);

    useEffect(() => {
        if (isTyping && scrollRef.current && !selectionMode) {
             scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [messages, isTyping, recallStatus, selectionMode]);

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };
    const formatDate = (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    };

    const getDetailedLogsForMonth = (year: string, month: string) => {
        if (!char.memories) return null;
        const target = `${year}-${month.padStart(2, '0')}`;
        const logs = char.memories.filter(m => {
            return m.date.includes(target) || m.date.includes(`${year}年${parseInt(month)}月`);
        });
        
        if (logs.length === 0) return null;
        return logs.map(m => `[${m.date}] (${m.mood || 'normal'}): ${m.summary}`).join('\n');
    };

    const getTimeGapHint = (lastMsg: Message | undefined, currentTimestamp: number): string => {
        if (!lastMsg) return '';
        const diffMs = currentTimestamp - lastMsg.timestamp;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const currentHour = new Date(currentTimestamp).getHours();
        const isNight = currentHour >= 23 || currentHour <= 6;
        if (diffMins < 10) return ''; 
        if (diffMins < 60) return `[系统提示: 距离上一条消息: ${diffMins} 分钟。短暂的停顿。]`;
        if (diffHours < 6) {
            if (isNight) return `[系统提示: 距离上一条消息: ${diffHours} 小时。现在是深夜/清晨。沉默是正常的（正在睡觉）。]`;
            return `[系统提示: 距离上一条消息: ${diffHours} 小时。用户离开了一会儿。]`;
        }
        if (diffHours < 24) return `[系统提示: 距离上一条消息: ${diffHours} 小时。很长的间隔。]`;
        const days = Math.floor(diffHours / 24);
        return `[系统提示: 距离上一条消息: ${days} 天。用户消失了很久。请根据你们的关系做出反应（想念、生气、担心或冷漠）。]`;
    };

    // --- Actions ---

    const handleSendText = async (customContent?: string, customType?: MessageType, metadata?: any) => {
        if (!char || (!input.trim() && !customContent)) return;
        const text = customContent || input.trim();
        const type = customType || 'text';

        if (!customContent) { setInput(''); localStorage.removeItem(draftKey); }
        
        if (type === 'image') {
            await DB.saveGalleryImage({
                id: `img-${Date.now()}-${Math.random()}`,
                charId: char.id,
                url: text,
                timestamp: Date.now()
            });
            addToast('图片已保存至相册', 'info');
        }

        const msgPayload: any = { charId: char.id, role: 'user', type, content: text, metadata };
        
        if (replyTarget) {
            msgPayload.replyTo = {
                id: replyTarget.id,
                content: replyTarget.content,
                name: replyTarget.role === 'user' ? '我' : char.name
            };
            setReplyTarget(null);
        }

        await DB.saveMessage(msgPayload);
        const updatedMsgs = await DB.getMessagesByCharId(char.id);
        setMessages(updatedMsgs);
        setShowPanel('none');
    };

    const handleReroll = async () => {
        if (isTyping || messages.length === 0) return;
        
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant') return;

        // Find all contiguous assistant messages at the end
        const toDeleteIds: number[] = [];
        let index = messages.length - 1;
        while (index >= 0 && messages[index].role === 'assistant') {
            toDeleteIds.push(messages[index].id);
            index--;
        }

        if (toDeleteIds.length === 0) return;

        await DB.deleteMessages(toDeleteIds);
        const newHistory = messages.slice(0, index + 1);
        setMessages(newHistory);
        addToast('回溯对话中...', 'info');

        triggerAI(newHistory);
    };

    const handleImageSelect = async (file: File) => {
        try {
            const base64 = await processImage(file, { maxWidth: 600, quality: 0.6, forceJpeg: true });
            setShowPanel('none');
            await handleSendText(base64, 'image');
        } catch (err: any) {
            addToast(err.message || '图片处理失败', 'error');
        }
    };

    const handlePanelAction = (type: string, payload?: any) => {
        switch (type) {
            case 'transfer': setModalType('transfer'); break;
            case 'poke': handleSendText('[戳一戳]', 'interaction'); break;
            case 'archive': setModalType('archive-settings'); break;
            case 'settings': setModalType('chat-settings'); break;
            case 'emoji-import': setModalType('emoji-import'); break;
            case 'send-emoji': if (payload) handleSendText(payload.url, 'emoji'); break;
            case 'delete-emoji-req': setSelectedEmoji(payload); setModalType('delete-emoji'); break;
            case 'add-category': setModalType('add-category'); break;
            case 'select-category': setActiveCategory(payload); break;
            case 'delete-category-req': setSelectedCategory(payload); setModalType('delete-category'); break;
        }
    };

    // --- Modal Handlers ---

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) {
             addToast('请输入分类名称', 'error');
             return;
        }
        const newCat = { id: `cat-${Date.now()}`, name: newCategoryName.trim() };
        await DB.saveEmojiCategory(newCat);
        await loadEmojiData();
        setActiveCategory(newCat.id);
        setModalType('none');
        setNewCategoryName('');
        addToast('分类创建成功', 'success');
    };

    // Import Emoji Logic Update: Support Category
    const handleImportEmoji = async () => {
        if (!emojiImportText.trim()) return;
        const lines = emojiImportText.split('\n');
        const targetCatId = activeCategory === 'default' ? undefined : activeCategory;

        for (const line of lines) {
            const parts = line.split('--');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const url = parts.slice(1).join('--').trim();
                if (name && url) {
                    await DB.saveEmoji(name, url, targetCatId);
                }
            }
        }
        await loadEmojiData();
        setModalType('none');
        setEmojiImportText('');
        addToast('表情包导入成功', 'success');
    };

    const handleDeleteCategory = async () => {
        if (!selectedCategory) return;
        await DB.deleteEmojiCategory(selectedCategory.id);
        await loadEmojiData();
        setActiveCategory('default');
        setModalType('none');
        setSelectedCategory(null);
        addToast('分类及包含表情已删除', 'success');
    };

    const handleSavePrompt = () => {
        if (!editingPrompt || !editingPrompt.name.trim() || !editingPrompt.content.trim()) {
            addToast('请填写完整', 'error');
            return;
        }
        setArchivePrompts(prev => {
            let next;
            if (prev.some(p => p.id === editingPrompt.id)) {
                next = prev.map(p => p.id === editingPrompt.id ? editingPrompt : p);
            } else {
                next = [...prev, editingPrompt];
            }
            const customOnly = next.filter(p => !p.id.startsWith('preset_'));
            localStorage.setItem('chat_archive_prompts', JSON.stringify(customOnly));
            return next;
        });
        setSelectedPromptId(editingPrompt.id);
        setModalType('archive-settings');
        setEditingPrompt(null);
    };

    const handleDeletePrompt = (id: string) => {
        if (id.startsWith('preset_')) {
            addToast('默认预设不可删除', 'error');
            return;
        }
        setArchivePrompts(prev => {
            const next = prev.filter(p => p.id !== id);
            const customOnly = next.filter(p => !p.id.startsWith('preset_'));
            localStorage.setItem('chat_archive_prompts', JSON.stringify(customOnly));
            return next;
        });
        if (selectedPromptId === id) setSelectedPromptId('preset_rational');
        addToast('预设已删除', 'success');
    };

    const createNewPrompt = () => {
        setEditingPrompt({ id: `custom_${Date.now()}`, name: '新预设', content: DEFAULT_ARCHIVE_PROMPTS[0].content });
        setModalType('prompt-editor');
    };

    const editSelectedPrompt = () => {
        const p = archivePrompts.find(a => a.id === selectedPromptId);
        if (!p) return;
        if (p.id.startsWith('preset_')) {
            setEditingPrompt({ id: `custom_${Date.now()}`, name: `${p.name} (Copy)`, content: p.content });
        } else {
            setEditingPrompt({ ...p });
        }
        setModalType('prompt-editor');
    };

    const handleBgUpload = async (file: File) => {
        try {
            const dataUrl = await processImage(file, { skipCompression: true });
            updateCharacter(char.id, { chatBackground: dataUrl });
            addToast('聊天背景已更新', 'success');
        } catch(err: any) {
            addToast(err.message, 'error');
        }
    };

    const saveSettings = () => {
        updateCharacter(char.id, { 
            contextLimit: settingsContextLimit,
            hideSystemLogs: settingsHideSysLogs
        });
        setModalType('none');
        addToast('设置已保存', 'success');
    };

    const handleClearHistory = async () => {
        if (!char) return;
        if (preserveContext) {
            const toDelete = messages.slice(0, -10);
            if (toDelete.length === 0) {
                addToast('消息太少，无需清理', 'info');
                return;
            }
            await DB.deleteMessages(toDelete.map(m => m.id));
            setMessages(messages.slice(-10));
            addToast(`已清理 ${toDelete.length} 条历史，保留最近10条`, 'success');
        } else {
            await DB.clearMessages(char.id);
            setMessages([]);
            addToast('已清空', 'success');
        }
        setModalType('none');
    };

    const handleSetHistoryStart = (messageId: number | undefined) => {
        updateCharacter(char.id, { hideBeforeMessageId: messageId });
        setModalType('none');
        addToast(messageId ? '已隐藏历史消息' : '已恢复全部历史记录', 'success');
    };

    const handleFullArchive = async () => {
        if (!apiConfig.apiKey || !char) {
            addToast('请先配置 API Key', 'error');
            return;
        }
        const msgsByDate: Record<string, Message[]> = {};
        messages
        .filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
        .forEach(m => {
            const d = new Date(m.timestamp);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!msgsByDate[dateStr]) msgsByDate[dateStr] = [];
            msgsByDate[dateStr].push(m);
        });

        const datesToProcess = Object.keys(msgsByDate).sort();
        if (datesToProcess.length === 0) {
            addToast('聊天记录为空，无法归档', 'info');
            return;
        }

        setIsSummarizing(true);
        setShowPanel('none');
        setModalType('none');
        
        try {
            let processedCount = 0;
            const newMemories: MemoryFragment[] = [];
            const templateObj = archivePrompts.find(p => p.id === selectedPromptId) || DEFAULT_ARCHIVE_PROMPTS[0];
            const template = templateObj.content;

            for (const dateStr of datesToProcess) {
                const dayMsgs = msgsByDate[dateStr];
                const rawLog = dayMsgs.map(m => `[${formatTime(m.timestamp)}] ${m.role === 'user' ? userProfile.name : char.name}: ${m.type === 'image' ? '[Image]' : m.content}`).join('\n');
                
                let prompt = template;
                prompt = prompt.replace(/\$\{dateStr\}/g, dateStr);
                prompt = prompt.replace(/\$\{char\.name\}/g, char.name);
                prompt = prompt.replace(/\$\{userProfile\.name\}/g, userProfile.name);
                prompt = prompt.replace(/\$\{rawLog.*?\}/g, rawLog.substring(0, 200000));

                const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.5,
                        max_tokens: 8000 
                    })
                });

                if (!response.ok) throw new Error(`API Error on ${dateStr}`);
                const data = await response.json();
                let summary = data.choices?.[0]?.message?.content || '';
                summary = summary.trim().replace(/^["']|["']$/g, ''); 

                if (summary) {
                    newMemories.push({ id: `mem-${Date.now()}`, date: dateStr, summary: summary, mood: 'archive' });
                    processedCount++;
                }
                await new Promise(r => setTimeout(r, 500));
            }

            const finalMemories = [...(char.memories || []), ...newMemories];
            updateCharacter(char.id, { memories: finalMemories });
            addToast(`成功归档 ${processedCount} 天`, 'success');

        } catch (e: any) {
            addToast(`归档中断: ${e.message}`, 'error');
        } finally {
            setIsSummarizing(false);
        }
    };

    // --- Message Management ---
    const handleDeleteMessage = async () => {
        if (!selectedMessage) return;
        await DB.deleteMessage(selectedMessage.id);
        setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已删除', 'success');
    };

    const confirmEditMessage = async () => {
        if (!selectedMessage) return;
        await DB.updateMessage(selectedMessage.id, editContent);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, content: editContent } : m));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已修改', 'success');
    };

    const handleReplyMessage = () => {
        if (!selectedMessage) return;
        setReplyTarget({
            ...selectedMessage,
            metadata: { ...selectedMessage.metadata, senderName: selectedMessage.role === 'user' ? '我' : char.name }
        });
        setModalType('none');
    };

    const handleDeleteEmoji = async () => {
        if (!selectedEmoji) return;
        await DB.deleteEmoji(selectedEmoji.name);
        await loadEmojiData();
        setModalType('none');
        setSelectedEmoji(null);
        addToast('表情包已删除', 'success');
    };

    // --- Batch Selection ---
    const handleEnterSelectionMode = () => {
        if (selectedMessage) {
            setSelectedMsgIds(new Set([selectedMessage.id]));
            setSelectionMode(true);
            setModalType('none');
            setSelectedMessage(null);
        }
    };

    const toggleMessageSelection = useCallback((id: number) => {
        setSelectedMsgIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleBatchDelete = async () => {
        if (selectedMsgIds.size === 0) return;
        await DB.deleteMessages(Array.from(selectedMsgIds));
        setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
        addToast(`已删除 ${selectedMsgIds.size} 条消息`, 'success');
        setSelectionMode(false);
        setSelectedMsgIds(new Set());
    };

    // --- AI Trigger Logic ---
    const triggerAI = async (currentMsgs: Message[]) => {
        if (isTyping || !char) return;
        if (!apiConfig.baseUrl) { alert("请先在设置中配置 API URL"); return; }

        setIsTyping(true);
        setRecallStatus('');

        try {
            const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}` };

            let baseSystemPrompt = ContextBuilder.buildCoreContext(char, userProfile);

            // ===== Add Toolbox Instruction =====
            baseSystemPrompt += TOOLBOX_INSTRUCTION;
            // ===================================

            // Group Context Injection
            try {
                const memberGroups = groups.filter(g => g.members.includes(char.id));
                if (memberGroups.length > 0) {
                    let allGroupMsgs: (Message & { groupName: string })[] = [];
                    for (const g of memberGroups) {
                        const gMsgs = await DB.getGroupMessages(g.id);
                        const enriched = gMsgs.map(m => ({ ...m, groupName: g.name }));
                        allGroupMsgs = [...allGroupMsgs, ...enriched];
                    }
                    allGroupMsgs.sort((a, b) => b.timestamp - a.timestamp);
                    const recentGroupMsgs = allGroupMsgs.slice(0, 200).reverse();

                    if (recentGroupMsgs.length > 0) {
                        const groupLogStr = recentGroupMsgs.map(m => {
                            const dateStr = new Date(m.timestamp).toLocaleString([], {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
                            const senderName = m.role === 'user' ? userProfile.name : (characters.find(c => c.id === m.charId)?.name || 'Unknown');
                            return `[${dateStr}] [Group: ${m.groupName}] ${senderName}: ${m.content}`;
                        }).join('\n');
                        baseSystemPrompt += `\n### [Background Context: Recent Group Activities]\n(注意：你是以下群聊的成员...)\n${groupLogStr}\n`;
                    }
                }
            } catch (e) { console.error("Failed to load group context", e); }

            // NEW: Build Categorized Emoji Context
            const emojiContextStr = (() => {
                if (emojis.length === 0) return '无';
                
                const grouped: Record<string, string[]> = {};
                const catMap: Record<string, string> = { 'default': '通用' };
                categories.forEach(c => catMap[c.id] = c.name);
                
                emojis.forEach(e => {
                    const cid = e.categoryId || 'default';
                    if (!grouped[cid]) grouped[cid] = [];
                    grouped[cid].push(e.name);
                });
                
                return Object.entries(grouped).map(([cid, names]) => {
                    const cName = catMap[cid] || '其他';
                    return `${cName}: [${names.join(', ')}]`;
                }).join('; ');
            })();

            baseSystemPrompt += `### 聊天 App 行为规范 (Chat App Rules)
            **严格注意，你正在手机聊天，无论之前是什么模式，哪怕上一句话你们还面对面在一起，当前，你都是已经处于线上聊天状态了，请不要输出你的行为**
1. **沉浸感**: 保持角色扮演。使用适合即时通讯(IM)的口语化短句。
2. **行为模式**: 不要总是围绕用户转。分享你自己的生活、想法或随意的观察。有时候要“任性”或“以自我为中心”一点，这更像真人，具体的程度视你的性格而定。
3. **格式要求**:
   - 将回复拆分成简短的气泡（句子）。内部使用句号"。"作为气泡分隔符。
   - 【严禁】在输出中包含时间戳、名字前缀或"[角色名]:"。
   - **【严禁】模仿历史记录中的系统日志格式（如"[你 发送了...]"）。**
   - **发送表情包**: 必须且只能使用命令: \`[[SEND_EMOJI: 表情名称]]\`。
   - **可用表情库 (按分类)**: 
     ${emojiContextStr}
4. **引用功能 (Quote/Reply)**:
   - 如果你想专门回复用户某句具体的话，可以在回复开头使用: \`[[QUOTE: 引用内容]]\`。这会在UI上显示为对该消息的引用。
5. **环境感知**:
   - 留意 [系统提示] 中的时间跨度。如果用户消失了很久，请根据你们的关系做出反应（如撒娇、生气、担心或冷漠）。
   - 如果用户发送了图片，请对图片内容进行评论。
6. **可用动作**:
   - 回戳用户: \`[[ACTION:POKE]]\`
   - 转账: \`[[ACTION:TRANSFER:100]]\`
   - 调取记忆: \`[[RECALL: YYYY-MM]]\`，请注意，当用户提及具体某个月份时，或者当你想仔细想某个月份的事情时，欢迎你随时使该动作
   - **添加纪念日**: 如果你觉得今天是个值得纪念的日子（或者你们约定了某天），你可以**主动**将它添加到用户的日历中。单独起一行输出: \`[[ACTION:ADD_EVENT | 标题(Title) | YYYY-MM-DD]]\`。
   - **定时发送消息**: 如果你想在未来某个时间主动发消息（比如晚安、早安或提醒），请单独起一行输出: \`[schedule_message | YYYY-MM-DD HH:MM:SS | fixed | 消息内容]\`，分行可以多输出很多该类消息，**请你尽可能多发此类消息**。
       -# 【主动性指令】
       - **积极使用定时发送消息功能**：不要等用户明确提出要求才使用。只要你觉得在未来某个时间点主动联系用户是合理的、符合你性格的，就应该主动安排。
       - **常见场景**：
         - 用户提到明天/未来有重要的事（考试、面试、约会等）→ 在事件前后主动发消息关心
         - 对话中提到某个时间点要做的事 → 到时候主动提醒或问候
         - 晚上道别后 → 第二天早上主动问候
         - 用户说要去忙某事 → 过一段时间后主动问问进展
         - 根据你的性格，定期主动分享日常、发送问候
         - **真实感**：真正的朋友/恋人不会只等对方说话才回应，会主动联系、主动关心、主动分享生活。
         # 思考范例 (AI的内心活动，不许输出)
[
  内在思考：用户说Ta明天上午有个重要的考试，我应该在考试结束后提醒Ta好好休息一下。现在是晚上10点，考试大概在明天上午11点结束。我可以在明天中午11点半左右发个提醒。
  秘密指令：\`[schedule_message | 2025-10-18 11:30:00 | fixed | 考试结束了吧？不许再想了，赶紧去放松一下，听到了没！]\`
  秘密指令：\`[schedule_message | 2025-10-18 11:30:03 | fixed | 哼，别以为我不知道你又在偷偷对答案。]\`
  正常对话：那你今晚就早点休息吧，别太紧张，我相信你没问题的！晚安。
]

[
  内在思考：现在是晚上11点，用户说要睡了。根据我的性格，我应该明天早上主动问候Ta。
  秘密指令：\`[schedule_message | 2025-10-18 08:30:00 | fixed | 早上好呀~]\`
  秘密指令：\`[schedule_message | 2025-10-18 08:30:03 | fixed | 昨晚睡得怎么样？]\`
  正常对话：晚安，好好休息~
]
         `;

            const previousMsg = currentMsgs.length > 1 ? currentMsgs[currentMsgs.length - 2] : null;
            if (previousMsg && previousMsg.metadata?.source === 'date') {
                baseSystemPrompt += `\n\n[System Note: You just finished a face-to-face meeting. You are now back on the phone. Switch back to texting style.]`;
            }

            const limit = char.contextLimit || 500;
            const effectiveHistory = currentMsgs.filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId);
            const historySlice = effectiveHistory.slice(-limit);
            
            let timeGapHint = "";
            if (historySlice.length >= 2) {
                const lastMsg = historySlice[historySlice.length - 2];
                const currentMsg = historySlice[historySlice.length - 1];
                if (lastMsg && currentMsg) timeGapHint = getTimeGapHint(lastMsg, currentMsg.timestamp);
            }

            const buildHistory = (msgs: Message[]) => msgs.map((m, index) => {
                let content: any = m.content;
                const timeStr = `[${formatDate(m.timestamp)}]`;
                if (m.replyTo) content = `[回复 "${m.replyTo.content.substring(0, 50)}..."]: ${content}`;
                if (m.type === 'image') {
                     let textPart = `${timeStr} [User sent an image]`;
                     if (index === msgs.length - 1 && timeGapHint && m.role === 'user') textPart += `\n\n${timeGapHint}`;
                     return { role: m.role, content: [{ type: "text", text: textPart }, { type: "image_url", image_url: { url: m.content } }] };
                }
                if (index === msgs.length - 1 && timeGapHint && m.role === 'user') content = `${content}\n\n${timeGapHint}`; 
                if (m.type === 'interaction') content = `${timeStr} [系统: 用户戳了你一下]`; 
                else if (m.type === 'transfer') content = `${timeStr} [系统: 用户转账 ${m.metadata?.amount}]`;
                else if (m.type === 'social_card') {
                    const post = m.metadata?.post || {};
                    const commentsSample = (post.comments || []).map((c: any) => `${c.authorName}: ${c.content}`).join(' | ');
                    content = `${timeStr} [用户分享了 Spark 笔记]\n标题: ${post.title}\n内容: ${post.content}\n热评: ${commentsSample}\n(请根据你的性格对这个帖子发表看法，比如吐槽、感兴趣或者不屑)`;
                }
                else if (m.type === 'emoji') {
                     const stickerName = emojis.find(e => e.url === m.content)?.name || 'Image/Sticker';
                     content = `${timeStr} [${m.role === 'user' ? '用户' : '你'} 发送了表情包: ${stickerName}]`;
                }
                else content = `${timeStr} ${content}`;
                return { role: m.role, content };
            });

            let apiMessages = [{ role: 'system', content: baseSystemPrompt }, ...buildHistory(historySlice)];

            let response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST', headers,
                body: JSON.stringify({ model: apiConfig.model, messages: apiMessages, temperature: 0.85, stream: false })
            });

            if (!response.ok) throw new Error(`API Error ${response.status}`);
            let data = await response.json();
            if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);

            let aiContent = data.choices?.[0]?.message?.content || '';

            // ===== Tool Call Processing =====
            const toolCalls = parseToolCalls(aiContent);

            if (toolCalls.length > 0) {
                const cleanContent = removeToolCalls(aiContent);

                if (cleanContent) {
                    await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: cleanContent });
                    setMessages(await DB.getMessagesByCharId(char.id));
                }

                const toolResults: string[] = [];
                for (const call of toolCalls) {
                    const result = await executeTool(call.name, call.params);
                    toolResults.push(`[${call.name}] ${result}`);
                }

                const toolFeedback = `[系统提示] 工具执行结果：\n${toolResults.join('\n---\n')}\n\n请根据结果继续回复用户。`;

                apiMessages.push({ role: 'assistant', content: aiContent });
                apiMessages.push({ role: 'system', content: toolFeedback });

                response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST', headers,
                    body: JSON.stringify({ model: apiConfig.model, messages: apiMessages, temperature: 0.8, stream: false })
                });

                if (!response.ok) throw new Error(`API Error ${response.status}`);
                data = await response.json();
                aiContent = data.choices?.[0]?.message?.content || '';
            }
            // ===============================
            aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
            aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, ''); 
            aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');

            // Recall Logic
            const recallMatch = aiContent.match(/\[\[RECALL:\s*(\d{4})[-/年](\d{1,2})\]\]/);
            if (recallMatch) {
                const year = recallMatch[1];
                const month = recallMatch[2];
                setRecallStatus(`正在调阅 ${year}年${month}月 的详细档案...`);
                const detailedLogs = getDetailedLogsForMonth(year, month);
                if (detailedLogs) {
                    apiMessages = [...apiMessages, { role: 'system', content: `[系统: 已成功调取 ${year}-${month} 的详细日志]\n${detailedLogs}\n[系统: 现在请结合这些细节回答用户。保持对话自然。]` }];
                    response = await fetch(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers,
                        body: JSON.stringify({ model: apiConfig.model, messages: apiMessages, temperature: 0.8, stream: false })
                    });
                    if (response.ok) {
                        data = await response.json();
                        aiContent = data.choices?.[0]?.message?.content || '';
                        aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                        aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                        aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
                        addToast(`已调用 ${year}-${month} 详细记忆`, 'info');
                    }
                }
            }
            setRecallStatus('');

            if (aiContent.includes('[[ACTION:POKE]]')) {
                await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'interaction', content: '[戳一戳]' });
                aiContent = aiContent.replace('[[ACTION:POKE]]', '').trim();
            }
            
            const transferMatch = aiContent.match(/\[\[ACTION:TRANSFER:(\d+)\]\]/);
            if (transferMatch) {
                await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'transfer', content: '[转账]', metadata: { amount: transferMatch[1] } });
                aiContent = aiContent.replace(transferMatch[0], '').trim();
            }

            const eventMatch = aiContent.match(/\[\[ACTION:ADD_EVENT\s*\|\s*(.*?)\s*\|\s*(.*?)\]\]/);
            if (eventMatch) {
                const title = eventMatch[1].trim();
                const date = eventMatch[2].trim();
                if (title && date) {
                    const anni: any = { id: `anni-${Date.now()}`, title: title, date: date, charId: char.id };
                    await DB.saveAnniversary(anni);
                    addToast(`${char.name} 添加了新日程: ${title}`, 'success');
                    await DB.saveMessage({ charId: char.id, role: 'system', type: 'text', content: `[系统: ${char.name} 新增了日程 "${title}" (${date})]` });
                }
                aiContent = aiContent.replace(eventMatch[0], '').trim();
            }

            const scheduleRegex = /\[schedule_message \| (.*?) \| fixed \| (.*?)\]/g;
            let match;
            while ((match = scheduleRegex.exec(aiContent)) !== null) {
                const timeStr = match[1].trim();
                const content = match[2].trim();
                const dueTime = new Date(timeStr).getTime();
                if (!isNaN(dueTime) && dueTime > Date.now()) {
                    await DB.saveScheduledMessage({ id: `sched-${Date.now()}-${Math.random()}`, charId: char.id, content: content, dueAt: dueTime, createdAt: Date.now() });
                    try {
                        const hasPerm = await LocalNotifications.checkPermissions();
                        if (hasPerm.display === 'granted') {
                            await LocalNotifications.schedule({ notifications: [{ title: char.name, body: content, id: Math.floor(Math.random() * 100000), schedule: { at: new Date(dueTime) }, smallIcon: 'ic_stat_icon_config_sample' }] });
                        }
                    } catch (e) { console.log("Notification schedule skipped (web mode)"); }
                    addToast(`${char.name} 似乎打算一会儿找你...`, 'info');
                }
            }
            aiContent = aiContent.replace(scheduleRegex, '').trim();

            // Quote Logic
            let aiReplyTarget: { id: number, content: string, name: string } | undefined;
            const firstQuoteMatch = aiContent.match(/\[\[QUOTE:\s*(.*?)\]\]/);
            if (firstQuoteMatch) {
                const quotedText = firstQuoteMatch[1];
                const targetMsg = historySlice.slice().reverse().find(m => m.role === 'user' && m.content.includes(quotedText));
                if (targetMsg) aiReplyTarget = { id: targetMsg.id, content: targetMsg.content, name: userProfile.name };
            }
            
            aiContent = aiContent.replace(/\[\[RECALL:.*?\]\]/g, '').trim();

            if (aiContent) {
                const emojiPattern = /\[\[SEND_EMOJI:\s*(.*?)\]\]/g;
                const parts: {type: 'text' | 'emoji', content: string}[] = [];
                let lastIndex = 0;
                let emojiMatch;
                while ((emojiMatch = emojiPattern.exec(aiContent)) !== null) {
                    if (emojiMatch.index > lastIndex) {
                        const textBefore = aiContent.slice(lastIndex, emojiMatch.index).trim();
                        if (textBefore) parts.push({ type: 'text', content: textBefore });
                    }
                    parts.push({ type: 'emoji', content: emojiMatch[1].trim() });
                    lastIndex = emojiMatch.index + emojiMatch[0].length;
                }
                if (lastIndex < aiContent.length) {
                    const remaining = aiContent.slice(lastIndex).trim();
                    if (remaining) parts.push({ type: 'text', content: remaining });
                }
                if (parts.length === 0 && aiContent.trim()) parts.push({ type: 'text', content: aiContent.trim() });

                for (let partIndex = 0; partIndex < parts.length; partIndex++) {
                    const part = parts[partIndex];
                    if (part.type === 'emoji') {
                        const foundEmoji = emojis.find(e => e.name === part.content);
                        if (foundEmoji) {
                            const delay = Math.random() * 500 + 300;
                            await new Promise(r => setTimeout(r, delay));
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                            setMessages(await DB.getMessagesByCharId(char.id));
                        }
                    } else {
                        let tempContent = part.content
                            .replace(/\.\.\./g, '{{ELLIPSIS_ENG}}')
                            .replace(/……/g, '{{ELLIPSIS_CN}}')
                            .replace(/([。])(?![）\)\]】"”'])/g, '{{SPLIT}}') 
                            .replace(/\.($|\s+)/g, '{{SPLIT}}')
                            .replace(/([！!？?~]+)(?![）\)\]】"”'])/g, '$1{{SPLIT}}') 
                            .replace(/\n+/g, '{{SPLIT}}')
                            .replace(/([\u4e00-\u9fa5])[ ]+([\u4e00-\u9fa5])/g, '$1{{SPLIT}}$2');

                        const chunks = tempContent.split('{{SPLIT}}').map(c => c.trim()).filter(c => c.length > 0)
                            .map(c => c.replace(/{{ELLIPSIS_ENG}}/g, '...').replace(/{{ELLIPSIS_CN}}/g, '……'));

                        if (chunks.length === 0 && part.content.trim()) chunks.push(part.content.trim());

                        for (let i = 0; i < chunks.length; i++) {
                            let chunk = chunks[i];
                            const delay = Math.min(Math.max(chunk.length * 50, 500), 2000);
                            await new Promise(r => setTimeout(r, delay));
                            
                            let chunkReplyTarget: { id: number, content: string, name: string } | undefined;
                            const chunkQuoteMatch = chunk.match(/\[\[QUOTE:\s*(.*?)\]\]/);
                            if (chunkQuoteMatch) {
                                const quotedText = chunkQuoteMatch[1];
                                const targetMsg = historySlice.slice().reverse().find(m => m.role === 'user' && m.content.includes(quotedText));
                                if (targetMsg) chunkReplyTarget = { id: targetMsg.id, content: targetMsg.content, name: userProfile.name };
                                chunk = chunk.replace(chunkQuoteMatch[0], '').trim();
                            }
                            
                            const replyData = chunkReplyTarget || (partIndex === 0 && i === 0 ? aiReplyTarget : undefined);
                            
                            if (chunk) {
                                await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: chunk, replyTo: replyData });
                                setMessages(await DB.getMessagesByCharId(char.id));
                            }
                        }
                    }
                }
            } else {
                setMessages(await DB.getMessagesByCharId(char.id));
            }

        } catch (e: any) {
            await DB.saveMessage({ charId: char.id, role: 'system', type: 'text', content: `[连接中断: ${e.message}]` });
            setMessages(await DB.getMessagesByCharId(char.id));
        } finally {
            setIsTyping(false);
            setRecallStatus('');
        }
    };

    const displayMessages = messages
        .filter(m => m.metadata?.source !== 'date')
        .filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
        .filter(m => { if (char.hideSystemLogs && m.role === 'system') return false; return true; })
        .slice(-visibleCount);

    return (
        <div 
            className="flex flex-col h-full bg-[#f1f5f9] overflow-hidden relative font-sans transition-all duration-500"
            style={{ 
                backgroundImage: char.chatBackground ? `url(${char.chatBackground})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        >
             {activeTheme.customCss && <style>{activeTheme.customCss}</style>}

             <ChatModals 
                modalType={modalType} setModalType={setModalType}
                transferAmt={transferAmt} setTransferAmt={setTransferAmt}
                emojiImportText={emojiImportText} setEmojiImportText={setEmojiImportText}
                settingsContextLimit={settingsContextLimit} setSettingsContextLimit={setSettingsContextLimit}
                settingsHideSysLogs={settingsHideSysLogs} setSettingsHideSysLogs={setSettingsHideSysLogs}
                preserveContext={preserveContext} setPreserveContext={setPreserveContext}
                editContent={editContent} setEditContent={setEditContent}
                archivePrompts={archivePrompts} selectedPromptId={selectedPromptId} setSelectedPromptId={setSelectedPromptId}
                editingPrompt={editingPrompt} setEditingPrompt={setEditingPrompt} isSummarizing={isSummarizing}
                selectedMessage={selectedMessage} selectedEmoji={selectedEmoji} activeCharacter={char} messages={messages}
                
                newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} onAddCategory={handleAddCategory}

                onTransfer={() => { if(transferAmt) handleSendText(`[转账]`, 'transfer', { amount: transferAmt }); setModalType('none'); }}
                onImportEmoji={handleImportEmoji} 
                onSaveSettings={saveSettings} onBgUpload={handleBgUpload} onRemoveBg={() => updateCharacter(char.id, { chatBackground: undefined })}
                onClearHistory={handleClearHistory} onArchive={handleFullArchive}
                onCreatePrompt={createNewPrompt} onEditPrompt={editSelectedPrompt} onSavePrompt={handleSavePrompt} onDeletePrompt={handleDeletePrompt}
                onSetHistoryStart={handleSetHistoryStart} onEnterSelectionMode={handleEnterSelectionMode}
                onReplyMessage={handleReplyMessage} onEditMessageStart={() => { if (selectedMessage) { setEditContent(selectedMessage.content); setModalType('edit-message'); } }}
                onConfirmEditMessage={confirmEditMessage} onDeleteMessage={handleDeleteMessage} onDeleteEmoji={handleDeleteEmoji}
             />
             
             <Modal
                isOpen={modalType === 'delete-category'} title="删除分类" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={handleDeleteCategory} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl">删除</button></>}
            >
                <div className="py-4 text-center">
                    <p className="text-sm text-slate-600">确定要删除分类 <br/><span className="font-bold">"{selectedCategory?.name}"</span> 吗？</p>
                    <p className="text-[10px] text-red-400 mt-2">注意：分类下的所有表情也将被删除！</p>
                </div>
            </Modal>

             <ChatHeader 
                selectionMode={selectionMode}
                selectedCount={selectedMsgIds.size}
                onCancelSelection={() => { setSelectionMode(false); setSelectedMsgIds(new Set()); }}
                activeCharacter={char}
                isTyping={isTyping}
                isSummarizing={isSummarizing}
                lastTokenUsage={lastTokenUsage}
                onClose={closeApp}
                onTriggerAI={() => triggerAI(messages)}
                onShowCharsPanel={() => setShowPanel('chars')}
             />

            <div ref={scrollRef} className="flex-1 overflow-y-auto pt-6 pb-6 no-scrollbar" style={{ backgroundImage: activeTheme.type === 'custom' && activeTheme.user.backgroundImage ? 'none' : undefined }}>
                {messages.length > visibleCount && (
                    <div className="flex justify-center mb-6">
                        <button onClick={() => setVisibleCount(prev => prev + 30)} className="px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full text-xs text-slate-500 shadow-sm border border-white hover:bg-white transition-colors">加载历史消息 ({messages.length - visibleCount})</button>
                    </div>
                )}

                {displayMessages.map((m, i) => {
                    const prevRole = i > 0 ? displayMessages[i - 1].role : null;
                    const nextRole = i < displayMessages.length - 1 ? displayMessages[i + 1].role : null;
                    return (
                        <MessageItem 
                            key={m.id || i}
                            msg={m}
                            isFirstInGroup={prevRole !== m.role}
                            isLastInGroup={nextRole !== m.role}
                            activeTheme={activeTheme}
                            charAvatar={char.avatar}
                            charName={char.name}
                            userAvatar={userProfile.avatar}
                            onLongPress={(msg) => { setSelectedMessage(msg); setModalType('message-options'); }}
                            selectionMode={selectionMode}
                            isSelected={selectedMsgIds.has(m.id)}
                            onToggleSelect={toggleMessageSelection}
                        />
                    );
                })}
                
                {(isTyping || recallStatus) && !selectionMode && (
                    <div className="flex items-end gap-3 px-3 mb-6 animate-fade-in">
                        <img src={char.avatar} className="w-9 h-9 rounded-[10px] object-cover" />
                        <div className="bg-white px-4 py-3 rounded-2xl shadow-sm">
                            {recallStatus ? (
                                <div className="flex items-center gap-2 text-xs text-indigo-500 font-medium">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    {recallStatus}
                                </div>
                            ) : (
                                <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div></div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="relative z-40">
                {replyTarget && (
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <div className="flex items-center gap-2 truncate"><span className="font-bold text-slate-700">正在回复:</span><span className="truncate max-w-[200px]">{replyTarget.content}</span></div>
                        <button onClick={() => setReplyTarget(null)} className="p-1 text-slate-400 hover:text-slate-600">×</button>
                    </div>
                )}
                
                <ChatInputArea 
                    input={input} setInput={handleInputChange}
                    isTyping={isTyping} selectionMode={selectionMode}
                    showPanel={showPanel} setShowPanel={setShowPanel}
                    onSend={() => handleSendText()}
                    onDeleteSelected={handleBatchDelete}
                    selectedCount={selectedMsgIds.size}
                    emojis={emojis.filter(e => {
                        if (activeCategory === 'default') return !e.categoryId || e.categoryId === 'default';
                        return e.categoryId === activeCategory;
                    })}
                    characters={characters} activeCharacterId={activeCharacterId}
                    onCharSelect={(id) => { setActiveCharacterId(id); setShowPanel('none'); }}
                    customThemes={customThemes} onUpdateTheme={(id) => updateCharacter(char.id, { bubbleStyle: id })}
                    onRemoveTheme={removeCustomTheme} activeThemeId={currentThemeId}
                    onPanelAction={handlePanelAction}
                    onImageSelect={handleImageSelect}
                    isSummarizing={isSummarizing}
                    categories={categories}
                    activeCategory={activeCategory}
                    onReroll={handleReroll}
                    canReroll={canReroll}
                />
            </div>
        </div>
    );
};

export default Chat;
