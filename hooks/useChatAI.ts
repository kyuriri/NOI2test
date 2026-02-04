import { useState } from 'react';
import { CharacterProfile, UserProfile, Message, Emoji, EmojiCategory, GroupProfile } from '../types';
import { DB } from '../utils/db';
import { ChatPrompts } from '../utils/chatPrompts';
import { ChatParser } from '../utils/chatParser';
import { BrainAgent } from '../utils/brainAgent';

interface UseChatAIProps {
    char: CharacterProfile | undefined;
    userProfile: UserProfile;
    apiConfig: any;
    groups: GroupProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    addToast: (msg: string, type: 'info'|'success'|'error') => void;
    setMessages: (msgs: Message[]) => void;
}

export const useChatAI = ({ 
    char, 
    userProfile, 
    apiConfig, 
    groups, 
    emojis, 
    categories, 
    addToast,
    setMessages 
}: UseChatAIProps) => {
    
    const [isTyping, setIsTyping] = useState(false);
    const [recallStatus, setRecallStatus] = useState<string>('');
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);
    const [isBrainProcessing, setIsBrainProcessing] = useState(false);

    // 创建 BrainAgent 实例
    const brainAgent = char ? new BrainAgent(char) : null;

    // LLM 调用包装器
    const callLLM = async (messages: any[], temperature: number = 0.85): Promise<string> => {
        const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
        const headers = { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}` 
        };
        
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
                model: apiConfig.model, 
                messages, 
                temperature, 
                stream: false 
            })
        });
        
        if (!response.ok) throw new Error(`API Error ${response.status}`);
        const data = await response.json();
        if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
        
        return data.choices?.[0]?.message?.content || '';
    };

    const triggerAI = async (currentMsgs: Message[]) => {
        if (isTyping || !char) return;
        if (!apiConfig.baseUrl) { alert("请先在设置中配置 API URL"); return; }

        setIsTyping(true);
        setRecallStatus('');

        try {
            // ========== 🧠 BRAIN INTEGRATION ==========
            // 使用 BrainAgent 处理用户输入
            if (brainAgent) {
                const lastUserMsg = currentMsgs[currentMsgs.length - 1];
                const history = currentMsgs.slice(0, -1);
                
                const llmProvider = {
                    chat: async (msgs: any[]) => {
                        // 构建完整的系统提示
                        const baseSystemPrompt = await ChatPrompts.buildSystemPrompt(char, userProfile, groups, emojis, categories, currentMsgs);
                        const fullMessages = [{ role: 'system', content: baseSystemPrompt }, ...msgs];
                        return await callLLM(fullMessages, 0.85);
                    }
                };

                // 调用 BrainAgent 处理
                const result = await brainAgent.processUserInput(
                    lastUserMsg.content,
                    history,
                    llmProvider
                );

                // 处理 BrainAgent 返回结果
                if (result.type === 'chat') {
                    // 纯聊天 - 直接显示
                    let content = result.reply;
                    content = content.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                    content = content.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                    content = await ChatParser.parseAndExecuteActions(content, char.id, char.name, addToast);
                    
                    await streamContent(content, currentMsgs);
                    setIsTyping(false);
                    return;
                    
                } else if (result.type === 'brain') {
                    // 需要外置大脑 - 显示即时反馈 + 执行结果
                    setIsBrainProcessing(true);
                    
                    // 1. 先显示即时反馈（如果还没显示）
                    if (result.displayImmediately) {
                        await streamContent(result.reply, currentMsgs);
                    }
                    
                    // 2. 如果有 brainResult，包装并显示
                    if (result.brainResult) {
                        // 让 LLM 把结果包装成人话
                        const wrapPrompt = `你是${char.name}。外置大脑刚刚完成了一个任务。

【执行结果】
${result.brainResult.output}

用你自然的语气告诉用户结果。保持角色性格，可以加入情感反应。直接输出回复内容。`;

                        const wrappedReply = await callLLM([
                            { role: 'system', content: wrapPrompt }
                        ], 0.8);

                        await streamContent(wrappedReply, currentMsgs);
                    }
                    
                    setIsBrainProcessing(false);
                    setIsTyping(false);
                    return;
                    
                } else if (result.type === 'error') {
                    // 错误
                    await DB.saveMessage({ 
                        charId: char.id, 
                        role: 'assistant', 
                        type: 'text', 
                        content: result.reply 
                    });
                    setMessages(await DB.getMessagesByCharId(char.id));
                    setIsTyping(false);
                    return;
                }
            }
            // ========== END BRAIN INTEGRATION ==========

            // 如果没有 BrainAgent 或处理失败，回退到原来的逻辑
            await fallbackAI(currentMsgs);

        } catch (e: any) {
            await DB.saveMessage({ charId: char.id, role: 'system', type: 'text', content: `[连接中断: ${e.message}]` });
            setMessages(await DB.getMessagesByCharId(char.id));
        } finally {
            setIsTyping(false);
            setRecallStatus('');
        }
    };

    // 流式显示内容
    const streamContent = async (content: string, currentMsgs: Message[]) => {
        const baseSystemPrompt = await ChatPrompts.buildSystemPrompt(char!, userProfile, groups, emojis, categories, currentMsgs);
        const limit = char!.contextLimit || 500;
        const { historySlice } = ChatPrompts.buildMessageHistory(currentMsgs, limit, char!, userProfile, emojis);

        // Handle Quote/Reply
        let aiReplyTarget: { id: number, content: string, name: string } | undefined;
        const firstQuoteMatch = content.match(/\[\[QUOTE:\s*(.*?)\]\]/);
        if (firstQuoteMatch) {
            const quotedText = firstQuoteMatch[1];
            const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText));
            if (targetMsg) aiReplyTarget = { id: targetMsg.id, content: targetMsg.content, name: userProfile.name };
        }

        // Split and stream
        const parts = ChatParser.splitResponse(content);

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex];
            
            if (part.type === 'emoji') {
                const foundEmoji = emojis.find(e => e.name === part.content);
                if (foundEmoji) {
                    const delay = Math.random() * 500 + 300;
                    await new Promise(r => setTimeout(r, delay));
                    await DB.saveMessage({ charId: char!.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                    setMessages(await DB.getMessagesByCharId(char!.id));
                }
            } else {
                const chunks = ChatParser.chunkText(part.content);
                if (chunks.length === 0 && part.content.trim()) chunks.push(part.content.trim());

                for (let i = 0; i < chunks.length; i++) {
                    let chunk = chunks[i];
                    const delay = Math.min(Math.max(chunk.length * 50, 500), 2000);
                    await new Promise(r => setTimeout(r, delay));
                    
                    let chunkReplyTarget: { id: number, content: string, name: string } | undefined;
                    const chunkQuoteMatch = chunk.match(/\[\[QUOTE:\s*(.*?)\]\]/);
                    if (chunkQuoteMatch) {
                        const quotedText = chunkQuoteMatch[1];
                        const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText));
                        if (targetMsg) chunkReplyTarget = { id: targetMsg.id, content: targetMsg.content, name: userProfile.name };
                        chunk = chunk.replace(chunkQuoteMatch[0], '').trim();
                    }
                    
                    const replyData = chunkReplyTarget || (partIndex === 0 && i === 0 ? aiReplyTarget : undefined);
                    
                    if (chunk) {
                        await DB.saveMessage({ charId: char!.id, role: 'assistant', type: 'text', content: chunk, replyTo: replyData });
                        setMessages(await DB.getMessagesByCharId(char!.id));
                    }
                }
            }
        }
    };

    // 回退的原始 AI 逻辑
    const fallbackAI = async (currentMsgs: Message[]) => {
        const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}` };

        const baseSystemPrompt = await ChatPrompts.buildSystemPrompt(char!, userProfile, groups, emojis, categories, currentMsgs);
        const limit = char!.contextLimit || 500;
        const { apiMessages, historySlice } = ChatPrompts.buildMessageHistory(currentMsgs, limit, char!, userProfile, emojis);

        const fullMessages = [{ role: 'system', content: baseSystemPrompt }, ...apiMessages];

        let response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST', headers,
            body: JSON.stringify({ model: apiConfig.model, messages: fullMessages, temperature: 0.85, stream: false })
        });

        if (!response.ok) throw new Error(`API Error ${response.status}`);
        let data = await response.json();
        if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);

        let aiContent = data.choices?.[0]?.message?.content || '';
        aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
        aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
        aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');

        // Handle Recall
        const recallMatch = aiContent.match(/\[\[RECALL:\s*(\d{4})[-/年](\d{1,2})\]\]/);
        if (recallMatch) {
            const year = recallMatch[1];
            const month = recallMatch[2];
            setRecallStatus(`正在调阅 ${year}年${month}月 的详细档案...`);
            
            const getDetailedLogs = (y: string, m: string) => {
                if (!char!.memories) return null;
                const target = `${y}-${m.padStart(2, '0')}`;
                const logs = char!.memories.filter(mem => mem.date.includes(target) || mem.date.includes(`${y}年${parseInt(m)}月`));
                if (logs.length === 0) return null;
                return logs.map(mem => `[${mem.date}] (${mem.mood || 'normal'}): ${mem.summary}`).join('\n');
            };

            const detailedLogs = getDetailedLogs(year, month);
            if (detailedLogs) {
                const recallMessages = [...fullMessages, { role: 'system', content: `[系统: 已成功调取 ${year}-${month} 的详细日志]\n${detailedLogs}\n[系统: 现在请结合这些细节回答用户。保持对话自然。]` }];
                response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST', headers,
                    body: JSON.stringify({ model: apiConfig.model, messages: recallMessages, temperature: 0.8, stream: false })
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

        aiContent = await ChatParser.parseAndExecuteActions(aiContent, char!.id, char!.name, addToast);
        await streamContent(aiContent, currentMsgs);
    };

    return {
        isTyping,
        isBrainProcessing,
        recallStatus,
        lastTokenUsage,
        setLastTokenUsage,
        triggerAI
    };
};
