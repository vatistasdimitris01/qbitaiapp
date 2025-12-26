
import React, { useRef, useEffect, useState } from 'react';
import { BarChartIcon } from './Icons';

declare global { interface Window { Plotly: any; } }

export const ChartRenderer: React.FC<{ type: string; data: any; title?: string; height?: string; colors?: string[] }> = ({ type, data, title, height, colors }) => {
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
    try {
      if (type === 'line' || type === 'bar') {
        if (Array.isArray(data)) { 
          plotData = data.map((trace: any, i: number) => ({ ...trace, type: type, marker: { color: colors ? colors[i % colors.length] : defaultColor }, line: { color: colors ? colors[i % colors.length] : defaultColor, width: 2 } })); 
        } 
        else if (data.x && data.y) { 
          plotData = [{ x: data.x, y: data.y, type: type, marker: { color: defaultColor }, line: { color: defaultColor, width: 2 } }]; 
        }
      } else if (type === 'pie' || type === 'donut') { 
        if (data.labels && data.values) { 
          plotData = [{ ...data, type: 'pie', hole: type === 'donut' ? 0.6 : 0 }]; 
        } 
      }
      if (plotData.length > 0) { 
        window.Plotly.react(chartRef.current, plotData, layout, { responsive: true, displayModeBar: false }); 
      }
    } catch (e) { console.error("Chart rendering failed", e); }
  }, [type, data, title, colors]);
  return (<div style={{ height: height || '320px' }} className="w-full"><div ref={chartRef} className="w-full h-full" /></div>);
};

export const StockWidget: React.FC<{ symbol: string; price: string; change: string; changePercent: string; chartData: any; history?: any; stats: any; currency?: string; }> = ({ symbol = 'N/A', price = '0.00', change = '', changePercent = '', chartData, history = {}, stats = {}, currency = '$' }) => {
  const safeChange = String(change || '0.00'); 
  const safeChangePercent = String(changePercent || '0.00%'); 
  const isNegative = safeChange.includes('-') || safeChangePercent.includes('-');
  const trendColor = isNegative ? 'text-[#ef4444]' : 'text-[#22c55e]'; 
  const chartColor = isNegative ? '#ef4444' : '#22c55e';
  const [activeRange, setActiveRange] = useState('1D');
  
  const currentData = React.useMemo(() => { 
    if (activeRange === '1D') return chartData; 
    if (history && history[activeRange]) return history[activeRange]; 
    return chartData; 
  }, [activeRange, chartData, history]);
  
  return (
    <div className="bg-[#121212] border border-[#27272a] rounded-xl overflow-hidden shadow-lg my-4 max-w-3xl font-sans text-[#e4e4e7]">
      <div className="p-5 flex flex-wrap justify-between items-start gap-4">
        <div>
          <div className="text-sm text-[#a1a1aa] font-medium mb-1">{symbol}</div>
          <div className="text-5xl font-bold tracking-tight mb-2 text-white">{currency}{price}</div>
          <div className={`text-sm font-medium ${trendColor} flex items-center gap-1.5`}>
            <span className="font-bold">{safeChange}</span>
            <span>({safeChangePercent})</span>
          </div>
        </div>
        <div className="flex bg-[#27272a] rounded-lg overflow-hidden p-1 self-center">
          {['1D', '5D', '1M', '6M', '1Y', '5Y'].map(r => (
            <button key={r} onClick={() => setActiveRange(r)} disabled={r !== '1D' && (!history || !history[r])} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeRange === r ? 'bg-[#3f3f46] text-white' : 'text-[#a1a1aa] hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[340px] w-full px-2 relative"><ChartRenderer type="line" data={currentData} height="340px" colors={[chartColor]} /></div>
      {stats && Object.keys(stats).length > 0 && (
        <div className="bg-[#18181b] border-t border-[#27272a] p-5 grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-12">
          {Object.entries(stats).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center text-sm">
              <span className="text-[#a1a1aa] font-normal">{key}</span>
              <span className="text-white font-medium">{String(value || '-')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const GenerativeUI: React.FC<{ toolName: string; args: any; }> = ({ toolName, args }) => {
  if (!args) return null;
  if (toolName === 'render_stock_widget') return <StockWidget symbol={args.symbol} price={args.price} change={args.change} changePercent={args.changePercent} chartData={args.chartData} history={args.history} stats={args.stats} currency={args.currency} />;
  return (
    <div className="p-4 bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-[#333] rounded-lg my-2">
      <div className="flex items-center gap-2 mb-2">
        <BarChartIcon className="size-4 text-blue-500" />
        <span className="text-xs font-mono text-gray-500 uppercase">{toolName}</span>
      </div>
      <pre className="text-xs overflow-x-auto text-gray-600 dark:text-gray-300">{JSON.stringify(args, null, 2)}</pre>
    </div>
  );
};
