
import React, { useEffect, useRef, useState } from 'react';
import { 
    CheckIcon, 
    BarChartIcon, 
    TrendingUpIcon, 
    TrendingDownIcon 
} from './icons';

interface GenerativeUIProps {
    toolName: string;
    args: any;
}

const ChartRenderer: React.FC<{ type: string; data: any; title?: string; height?: string; colors?: string[] }> = ({ type, data, title, height, colors }) => {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!window.Plotly || !chartRef.current || !data) return;

        let plotData: any[] = [];
        let layout: any = { 
            title: title ? { text: title, font: { color: '#e4e4e4' } } : undefined,
            autosize: true,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#888' },
            margin: { t: title ? 30 : 10, r: 10, l: 30, b: 30 },
            xaxis: { gridcolor: '#333', zerolinecolor: '#333' },
            yaxis: { gridcolor: '#333', zerolinecolor: '#333' },
            showlegend: false,
        };

        const defaultColor = colors ? colors[0] : '#1d9bf0';

        if (type === 'line' || type === 'bar') {
            if (Array.isArray(data)) {
                 if (data[0]?.x && data[0]?.y) {
                    plotData = data.map((trace: any, i: number) => ({ 
                        ...trace, 
                        type: type,
                        marker: { color: colors ? colors[i % colors.length] : defaultColor },
                        line: { color: colors ? colors[i % colors.length] : defaultColor, width: 2 }
                    }));
                } else {
                    const keys = Object.keys(data[0] || {});
                    if (keys.length >= 2) {
                        const xKey = keys.find(k => k.toLowerCase().includes('date') || k.toLowerCase().includes('time') || k.toLowerCase().includes('label')) || keys[0];
                        const yKey = keys.find(k => k !== xKey) || keys[1];
                        
                        plotData = [{
                            x: data.map((d: any) => d[xKey]),
                            y: data.map((d: any) => d[yKey]),
                            type: type,
                            marker: { color: defaultColor },
                            line: { color: defaultColor, width: 2 }
                        }];
                    }
                }
            } else if (data && data.x && data.y) {
                 plotData = [{ ...data, type: type, marker: { color: defaultColor }, line: { color: defaultColor, width: 2 } }];
            }
        } else if (type === 'pie' || type === 'donut') {
             if (Array.isArray(data) && data[0]?.labels && data[0]?.values) {
                 plotData = data.map((trace: any) => ({ ...trace, type: 'pie', hole: type === 'donut' ? 0.6 : 0 }));
             } else if (data && data.labels && data.values) {
                 plotData = [{ ...data, type: 'pie', hole: type === 'donut' ? 0.6 : 0 }];
             }
        }

        const config = { responsive: true, displayModeBar: false };
        window.Plotly.newPlot(chartRef.current, plotData, layout, config);

    }, [type, data, title, colors]);

    return (
        <div style={{ height: height || '320px' }} className="w-full">
            <div ref={chartRef} className="w-full h-full" />
        </div>
    );
};

const StockWidget: React.FC<{ 
    symbol: string; 
    price: string; 
    change: string; 
    changePercent: string; 
    chartData: any; 
    stats: any;
    currency?: string;
}> = ({ symbol, price, change = '', changePercent = '', chartData, stats = {}, currency = '$' }) => {
    // Robust checks for string methods
    const safeChange = String(change || '');
    const safeChangePercent = String(changePercent || '');
    const isNegative = safeChange.includes('-') || safeChangePercent.includes('-');
    
    const trendColor = isNegative ? 'text-[#ef4444]' : 'text-[#22c55e]'; // tailwind red-500 : green-500
    const chartColor = isNegative ? '#ef4444' : '#22c55e';
    const [activeRange, setActiveRange] = useState('1D');

    // Ensure price has currency symbol if missing
    const safePrice = String(price || '0.00');
    const displayPrice = safePrice.startsWith(currency) ? safePrice : `${currency}${safePrice}`;

    return (
        <div className="bg-[#121212] border border-[#27272a] rounded-xl overflow-hidden shadow-lg my-4 max-w-3xl font-sans text-[#e4e4e7]">
            <div className="p-5 flex flex-wrap justify-between items-start gap-4">
                <div>
                    <div className="text-sm text-[#a1a1aa] font-medium mb-1">{symbol}</div>
                    <div className="text-5xl font-bold tracking-tight mb-2 text-white">{displayPrice}</div>
                    <div className={`text-sm font-medium ${trendColor} flex items-center gap-1.5`}>
                        <span className="font-bold">{safeChange}</span> 
                        <span>({safeChangePercent})</span>
                        <span className="text-[#71717a] ml-1 font-normal">Today</span>
                    </div>
                </div>
                <div className="flex bg-[#27272a] rounded-lg overflow-hidden p-1 self-center">
                    {['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'].map(r => (
                        <button 
                            key={r}
                            onClick={() => setActiveRange(r)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeRange === r ? 'bg-[#3f3f46] text-white' : 'text-[#a1a1aa] hover:text-white hover:bg-white/5'}`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-[340px] w-full px-2 relative">
                 <ChartRenderer 
                    type="line" 
                    data={chartData} 
                    height="340px" 
                    colors={[chartColor]}
                />
            </div>

            {stats && Object.keys(stats).length > 0 && (
                <div className="bg-[#18181b] border-t border-[#27272a] p-5 grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-12">
                    {Object.entries(stats).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center text-sm">
                            <span className="text-[#a1a1aa] font-normal">{key}</span>
                            <span className="text-white font-medium">{String(value)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


const KPICard: React.FC<{ title: string; value: string; change?: string; trend?: 'up' | 'down' | 'neutral' }> = ({ title, value, change, trend }) => {
    const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500';
    
    return (
        <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333] rounded-xl p-5 shadow-sm min-w-[200px] flex-1">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">{title}</p>
            <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
                {change && (
                    <span className={`text-xs font-medium ${trendColor} bg-opacity-10 px-1.5 py-0.5 rounded-full bg-current`}>
                        {change}
                    </span>
                )}
            </div>
        </div>
    );
};

const DataRenderer: React.FC<{ columns: string[]; data: any[] }> = ({ columns, data }) => {
    return (
        <div className="w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-[#333] shadow-sm my-4 bg-white dark:bg-[#1e1e1e]">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-[#252525] text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-[#333]">
                    <tr>
                        {columns.map((col, idx) => (
                            <th key={idx} className="px-4 py-3 whitespace-nowrap">{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#333]">
                    {data.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors">
                            {columns.map((col, cIdx) => (
                                <td key={cIdx} className="px-4 py-3 text-gray-900 dark:text-gray-200">
                                    {/* Handle both array of values and array of objects */}
                                    {typeof row === 'object' && row !== null && !Array.isArray(row) ? row[Object.keys(row)[cIdx]] || row[col.toLowerCase()] : row[cIdx]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const TodoList: React.FC<{ title: string; items: { label: string; due?: string; done?: boolean }[] }> = ({ title, items }) => {
    const [tasks, setTasks] = useState(items);

    const toggleTask = (index: number) => {
        const newTasks = [...tasks];
        newTasks[index] = { ...newTasks[index], done: !newTasks[index].done };
        setTasks(newTasks);
    };

    return (
        <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333] rounded-xl p-0 shadow-sm my-4 overflow-hidden max-w-md">
            {title && <div className="px-4 py-3 bg-gray-50 dark:bg-[#252525] border-b border-gray-200 dark:border-[#333] font-semibold text-gray-700 dark:text-gray-200">{title}</div>}
            <div className="divide-y divide-gray-100 dark:divide-[#333]">
                {tasks.map((task, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors cursor-pointer" onClick={() => toggleTask(idx)}>
                        <div className={`size-5 rounded-full border flex items-center justify-center transition-colors ${task.done ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                            {task.done && <CheckIcon className="size-3.5 text-white" />}
                        </div>
                        <div className="flex-1">
                            <p className={`text-sm ${task.done ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-200'}`}>{task.label}</p>
                            {task.due && <p className="text-xs text-gray-400">{task.due}</p>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Flashcards: React.FC<{ cards: { front: string; back: string }[] }> = ({ cards }) => {
    const [flipped, setFlipped] = useState<number | null>(null);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
            {cards.map((card, idx) => (
                <div 
                    key={idx} 
                    className="group perspective h-48 cursor-pointer"
                    onClick={() => setFlipped(flipped === idx ? null : idx)}
                >
                    <div className={`relative w-full h-full duration-500 preserve-3d transition-transform ${flipped === idx ? 'rotate-y-180' : ''}`}>
                        {/* Front */}
                        <div className="absolute inset-0 backface-hidden bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333] rounded-xl p-6 flex items-center justify-center text-center shadow-sm">
                            <p className="font-medium text-gray-900 dark:text-gray-100">{card.front}</p>
                             <div className="absolute bottom-3 right-3 text-xs text-gray-400">Click to flip</div>
                        </div>
                        {/* Back */}
                        <div className="absolute inset-0 backface-hidden rotate-y-180 bg-blue-50 dark:bg-[#1d9bf0]/10 border border-blue-200 dark:border-blue-800 rounded-xl p-6 flex items-center justify-center text-center shadow-sm">
                            <p className="text-gray-800 dark:text-blue-100">{card.back}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const GenerativeUI: React.FC<GenerativeUIProps> = ({ toolName, args }) => {
    
    // --- Stock Widget Handler ---
    if (toolName === 'get_stock_quote') {
        return <StockWidget 
            symbol={args.symbol} 
            price={args.price} 
            change={args.change} 
            changePercent={args.changePercent} 
            chartData={args.chartData} 
            stats={args.stats}
            currency={args.currency}
        />;
    }

    if (toolName === 'render_chart' || toolName === 'render_line_chart' || toolName === 'render_bar_chart' || toolName === 'render_pie_chart') {
        const chartType = args.type || (toolName.includes('line') ? 'line' : toolName.includes('bar') ? 'bar' : toolName.includes('pie') ? 'pie' : 'bar');
        return <ChartRenderer type={chartType} data={args.data} title={args.title} />;
    }

    if (toolName === 'render_kpi_card' || toolName === 'render_stats') {
        // Can handle single object or array of objects
        const items = Array.isArray(args) ? args : [args];
        return (
            <div className="flex flex-wrap gap-4 my-4">
                {items.map((item: any, idx: number) => (
                    <KPICard 
                        key={idx} 
                        title={item.title} 
                        value={item.value} 
                        change={item.change || item.delta} 
                        trend={item.trend || (item.change?.includes('+') ? 'up' : item.change?.includes('-') ? 'down' : 'neutral')} 
                    />
                ))}
            </div>
        );
    }

    if (toolName === 'render_table') {
        return <DataRenderer columns={args.columns || args.headers} data={args.data || args.rows} />;
    }

    if (toolName === 'create_todo_item' || toolName === 'render_todo_list') {
        const items = args.items ? args.items : (args.task ? [{ label: args.task, due: args.due_date }] : []);
        const title = args.title || "To Do";
        return <TodoList title={title} items={items} />;
    }

    if (toolName === 'render_flashcards') {
        return <Flashcards cards={args.cards || []} />;
    }

    if (toolName === 'render_calendar_event') {
        return (
            <div className="bg-white dark:bg-[#1e1e1e] border border-l-4 border-l-blue-500 border-gray-200 dark:border-[#333] rounded-r-xl p-4 shadow-sm my-4 max-w-sm">
                <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-1">Calendar Event</p>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{args.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{args.date} • {args.time}</p>
                {args.description && <p className="text-sm text-gray-500 mt-2">{args.description}</p>}
                <div className="mt-3 flex gap-2">
                    <button className="text-xs bg-gray-100 dark:bg-[#333] hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors">Add to Google</button>
                    <button className="text-xs bg-gray-100 dark:bg-[#333] hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors">Add to Outlook</button>
                </div>
            </div>
        );
    }
    
    // Fallback for generic message or unknown tool
    return (
        <div className="p-4 bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-[#333] rounded-lg my-2">
            <div className="flex items-center gap-2 mb-2">
                <BarChartIcon className="size-4 text-blue-500" />
                <span className="text-xs font-mono text-gray-500 uppercase">{toolName}</span>
            </div>
            <pre className="text-xs overflow-x-auto text-gray-600 dark:text-gray-300">
                {JSON.stringify(args, null, 2)}
            </pre>
        </div>
    );
};

export default GenerativeUI;
