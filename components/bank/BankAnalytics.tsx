
import React, { useMemo, useState } from 'react';
import { BankTransaction, SavingsGoal } from '../../types';

interface Props {
    transactions: BankTransaction[];
    goals: SavingsGoal[];
    currency: string;
    onDeleteTx: (id: string) => void;
}

const BankAnalytics: React.FC<Props> = ({ transactions, goals, currency, onDeleteTx }) => {
    const [filter, setFilter] = useState<'week' | 'month' | 'year'>('month');
    const [viewMode, setViewMode] = useState<'list' | 'report'>('report');

    // --- Data Processing ---
    
    // Group transactions
    const groupedData = useMemo(() => {
        const now = new Date();
        const groups: Record<string, { total: number, items: BankTransaction[] }> = {};
        
        transactions.forEach(tx => {
            const date = new Date(tx.timestamp);
            let key = '';
            
            if (filter === 'week') {
                // Modified: Show Start Date instead of Week Number
                const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                const dayNum = d.getUTCDay() || 7;
                d.setUTCDate(d.getUTCDate() + 1 - dayNum); // Set to Monday
                const month = d.getUTCMonth() + 1;
                const day = d.getUTCDate();
                key = `${month}/${day}周`; // "10/24周"
            } else if (filter === 'month') {
                key = `${date.getMonth() + 1}月`;
            } else {
                key = `${date.getFullYear()}年`;
            }

            if (!groups[key]) groups[key] = { total: 0, items: [] };
            groups[key].total += tx.amount;
            groups[key].items.push(tx);
        });

        // Sort keys
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            // Simple heuristic sort, robust enough for MM/DD format or YYYY format
            // Reverse order (Newest first)
            return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
        });

        return sortedKeys.map(k => ({ key: k, ...groups[k] }));
    }, [transactions, filter]);

    // Total Savings (Goals Progress)
    const totalSaved = useMemo(() => goals.reduce((sum, g) => sum + g.currentAmount, 0), [goals]);
    const nextGoal = useMemo(() => goals.find(g => !g.isCompleted) || goals[0], [goals]);

    // --- Chart Component (CSS-only) ---
    const SimpleBarChart = ({ data }: { data: typeof groupedData }) => {
        if (data.length === 0) return <div className="h-40 flex items-center justify-center text-stone-300 text-xs">暂无数据</div>;
        
        const maxVal = Math.max(...data.map(d => d.total));
        // Take top 7 for visual clarity
        const displayData = data.slice(0, 7).reverse(); // Show oldest to newest left to right

        return (
            <div className="h-40 flex items-end justify-between gap-2 pt-6">
                {displayData.map((d, i) => {
                    const heightPercent = Math.max(10, (d.total / maxVal) * 100);
                    return (
                        <div key={d.key} className="flex-1 flex flex-col items-center gap-2 group">
                            <div className="text-[9px] text-stone-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity absolute -mt-4">{d.total}</div>
                            <div 
                                className="w-full bg-orange-200 rounded-t-lg transition-all duration-500 hover:bg-orange-400 relative"
                                style={{ height: `${heightPercent}%` }}
                            ></div>
                            <div className="text-[10px] text-stone-400 font-bold scale-90 whitespace-nowrap">{d.key}</div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="p-6 pb-20 space-y-6">
            
            {/* Filter Toggle */}
            <div className="flex bg-white p-1 rounded-xl shadow-sm border border-stone-100">
                {(['week', 'month', 'year'] as const).map(f => (
                    <button 
                        key={f} 
                        onClick={() => setFilter(f)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === f ? 'bg-stone-800 text-white shadow-md' : 'text-stone-400 hover:bg-stone-50'}`}
                    >
                        {f === 'week' ? '周' : f === 'month' ? '月' : '年'}
                    </button>
                ))}
            </div>

            {/* View Toggle */}
            <div className="flex justify-end px-1">
                <button 
                    onClick={() => setViewMode(viewMode === 'list' ? 'report' : 'list')}
                    className="text-xs font-bold text-orange-500 hover:text-orange-600 flex items-center gap-1 bg-orange-50 px-3 py-1 rounded-full transition-colors"
                >
                    {viewMode === 'list' ? '📊看报表' : '📝看明细'}
                </button>
            </div>

            {viewMode === 'report' ? (
                <div className="space-y-6 animate-fade-in">
                    {/* 1. Achievement Card */}
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                        <div className="relative z-10">
                            <div className="text-xs font-bold text-white/60 uppercase tracking-widest mb-1">累计节省成就</div>
                            <div className="text-4xl font-black font-mono tracking-tight mb-4">{currency}{totalSaved.toFixed(0)}</div>
                            
                            {nextGoal && (
                                <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                                    <div className="flex justify-between text-xs mb-2">
                                        <span className="opacity-90">距离 "{nextGoal.name}" 还差</span>
                                        <span className="font-bold">{currency}{Math.max(0, nextGoal.targetAmount - nextGoal.currentAmount).toFixed(0)}</span>
                                    </div>
                                    <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
                                        <div className="h-full bg-white/90 rounded-full" style={{ width: `${Math.min(100, (nextGoal.currentAmount / nextGoal.targetAmount) * 100)}%` }}></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Visual Chart */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-sm font-bold text-stone-600">消费趋势</h3>
                            <span className="text-[10px] text-stone-400">近7个周期</span>
                        </div>
                        <SimpleBarChart data={groupedData} />
                    </div>

                    {/* 3. Summary Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100">
                            <div className="text-[10px] font-bold text-orange-400 uppercase mb-1">本周期支出</div>
                            <div className="text-xl font-black text-orange-600 font-mono">{currency}{groupedData[0]?.total.toFixed(0) || 0}</div>
                        </div>
                        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                            <div className="text-[10px] font-bold text-emerald-500 uppercase mb-1">笔数</div>
                            <div className="text-xl font-black text-emerald-700 font-mono">{groupedData[0]?.items.length || 0}</div>
                        </div>
                    </div>
                </div>
            ) : (
                /* List View */
                <div className="space-y-6 animate-fade-in">
                    {groupedData.map(group => (
                        <div key={group.key}>
                            <div className="flex items-center justify-between px-2 mb-3 sticky top-0 bg-[#fdfbf7]/90 backdrop-blur py-2 z-10">
                                <h3 className="text-sm font-bold text-stone-500">{group.key}</h3>
                                <span className="text-xs font-mono font-bold text-stone-400">-{currency}{group.total.toFixed(1)}</span>
                            </div>
                            <div className="space-y-3">
                                {group.items.map(tx => (
                                    <div key={tx.id} className="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex justify-between items-center group relative">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-lg text-stone-400">
                                                🧾
                                            </div>
                                            <div>
                                                <div className="font-bold text-stone-700 text-sm">{tx.note}</div>
                                                <div className="text-[10px] text-stone-400">{new Date(tx.timestamp).getDate()}日 {new Date(tx.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                                            </div>
                                        </div>
                                        <div className="font-mono font-bold text-stone-800 text-base">
                                            -{tx.amount}
                                        </div>
                                        <button 
                                            onClick={() => onDeleteTx(tx.id)}
                                            className="absolute right-2 top-2 p-1 text-stone-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-sm rounded-full"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {groupedData.length === 0 && <div className="text-center text-stone-300 py-10 text-xs">空空如也</div>}
                </div>
            )}
        </div>
    );
};

export default BankAnalytics;
