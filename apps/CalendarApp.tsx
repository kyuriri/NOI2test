
import React, { useState, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { CalendarEvent } from '../types';
import Modal from '../components/os/Modal';

const CalendarApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, userProfile } = useOS();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showAddModal, setShowAddModal] = useState(false);
    const [newEventTitle, setNewEventTitle] = useState('');

    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = async () => {
        const all = await DB.getAllEvents();
        setEvents(all);
    };

    const handleAddEvent = async () => {
        if (!newEventTitle.trim()) return;
        const dateStr = selectedDate.toISOString().split('T')[0];
        
        const newEvent: CalendarEvent = {
            id: `evt-${Date.now()}`,
            date: dateStr,
            title: newEventTitle,
            createdAt: Date.now(),
            createdByCharId: undefined // User created
        };
        
        await DB.saveEvent(newEvent);
        setEvents(prev => [...prev, newEvent]);
        setNewEventTitle('');
        setShowAddModal(false);
    };

    const handleDeleteEvent = async (id: string) => {
        await DB.deleteEvent(id);
        setEvents(prev => prev.filter(e => e.id !== id));
    };

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const changeMonth = (offset: number) => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setSelectedDate(newDate);
    };

    const renderCalendar = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayEvents = events.filter(e => e.date === dateStr);
            const hasEvent = dayEvents.length > 0;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;
            const isSelected = selectedDate.getDate() === d && selectedDate.getMonth() === month;

            // Determine border color based on who created events
            const hasUserEvent = dayEvents.some(e => !e.createdByCharId);
            const hasCharEvent = dayEvents.some(e => e.createdByCharId);
            let indicatorClass = '';
            if (hasUserEvent && hasCharEvent) indicatorClass = 'bg-gradient-to-r from-blue-400 to-pink-400';
            else if (hasUserEvent) indicatorClass = 'bg-blue-400';
            else if (hasCharEvent) indicatorClass = 'bg-pink-400';

            days.push(
                <div 
                    key={d} 
                    onClick={() => setSelectedDate(new Date(year, month, d))}
                    className={`
                        aspect-square flex flex-col items-center justify-center relative cursor-pointer 
                        rounded-lg border-2 transition-all 
                        ${isSelected ? 'border-amber-600 bg-amber-50' : 'border-amber-200 hover:border-amber-400 bg-white'}
                        ${isToday ? 'ring-2 ring-red-400 ring-offset-1' : ''}
                    `}
                >
                    <span className={`text-sm font-bold font-mono ${isSelected ? 'text-amber-800' : 'text-amber-700'}`}>{d}</span>
                    {hasEvent && <div className={`w-2 h-2 rounded-full mt-1 ${indicatorClass}`}></div>}
                </div>
            );
        }
        return days;
    };

    const currentEvents = events.filter(e => {
        const d = selectedDate.toISOString().split('T')[0];
        return e.date === d;
    });

    const getCreatorInfo = (charId?: string) => {
        if (!charId) return { name: '我', color: 'text-blue-500', bg: 'bg-blue-50' };
        const char = characters.find(c => c.id === charId);
        return { 
            name: char?.name || 'Unknown', 
            color: 'text-pink-500', 
            bg: 'bg-pink-50',
            avatar: char?.avatar
        };
    };

    return (
        <div className="h-full w-full bg-[#fdf6e3] flex flex-col font-sans select-none overflow-hidden">
            {/* Header (Game Style) */}
            <div className="h-20 bg-amber-500 flex items-center justify-between px-4 border-b-4 border-amber-600 shadow-md shrink-0 z-20">
                <button onClick={closeApp} className="p-2 bg-amber-400 rounded-lg border-2 border-amber-600 text-white active:translate-y-1 transition-transform shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>
                <div className="flex flex-col items-center">
                    <span className="text-white font-bold text-xl tracking-widest drop-shadow-md" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2)' }}>CALENDAR</span>
                    <div className="bg-amber-700/30 px-3 py-0.5 rounded-full text-[10px] text-white font-mono">{selectedDate.getFullYear()}</div>
                </div>
                <button onClick={() => setShowAddModal(true)} className="p-2 bg-amber-400 rounded-lg border-2 border-amber-600 text-white active:translate-y-1 transition-transform shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Month Navigator */}
                <div className="flex items-center justify-between bg-white border-2 border-amber-200 rounded-xl p-2 shadow-sm">
                    <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-amber-50 rounded-lg text-amber-600 font-bold text-xl">❮</button>
                    <span className="text-lg font-bold text-amber-800 uppercase tracking-widest">
                        {selectedDate.toLocaleString('default', { month: 'long' })}
                    </span>
                    <button onClick={() => changeMonth(1)} className="p-2 hover:bg-amber-50 rounded-lg text-amber-600 font-bold text-xl">❯</button>
                </div>

                {/* Calendar Grid */}
                <div className="bg-white border-2 border-amber-200 rounded-xl p-3 shadow-[4px_4px_0px_rgba(251,191,36,0.4)]">
                    <div className="grid grid-cols-7 mb-2 text-center">
                        {['S','M','T','W','T','F','S'].map((d,i) => <span key={i} className="text-xs font-bold text-amber-400">{d}</span>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {renderCalendar()}
                    </div>
                </div>

                {/* Events List */}
                <div className="space-y-3 pb-20">
                    <h3 className="text-xs font-bold text-amber-800/50 uppercase tracking-widest px-1">
                        Events for {selectedDate.toLocaleDateString()}
                    </h3>
                    
                    {currentEvents.length === 0 ? (
                        <div className="text-center py-8 text-amber-800/30 text-sm font-bold border-2 border-dashed border-amber-200/50 rounded-xl">
                            No Events
                        </div>
                    ) : (
                        currentEvents.map(evt => {
                            const creator = getCreatorInfo(evt.createdByCharId);
                            return (
                                <div key={evt.id} className="bg-white border-2 border-amber-100 rounded-xl p-3 flex items-center justify-between shadow-sm group">
                                    <div className="flex items-center gap-3">
                                        {creator.avatar ? (
                                            <img src={creator.avatar} className="w-8 h-8 rounded-lg border border-amber-200 object-cover" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-500 font-bold text-xs">ME</div>
                                        )}
                                        <div>
                                            <div className="font-bold text-amber-900 text-sm">{evt.title}</div>
                                            <div className={`text-[10px] font-bold ${creator.color}`}>Recorded by {creator.name}</div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteEvent(evt.id)} className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:bg-red-50 rounded-lg transition-all">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <Modal
                isOpen={showAddModal}
                title="添加纪念日"
                onClose={() => setShowAddModal(false)}
                footer={<button onClick={handleAddEvent} className="w-full py-3 bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-200">保存</button>}
            >
                <div className="space-y-4">
                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-center">
                        <span className="text-xs font-bold text-amber-600 uppercase">Selected Date</span>
                        <div className="text-lg font-bold text-amber-800">{selectedDate.toISOString().split('T')[0]}</div>
                    </div>
                    <input 
                        value={newEventTitle} 
                        onChange={e => setNewEventTitle(e.target.value)} 
                        className="w-full bg-white border-2 border-amber-200 rounded-xl px-4 py-3 text-sm font-bold text-amber-900 placeholder:text-amber-300 focus:border-amber-500 outline-none" 
                        placeholder="Event Title..." 
                        autoFocus
                    />
                </div>
            </Modal>
        </div>
    );
};

export default CalendarApp;
