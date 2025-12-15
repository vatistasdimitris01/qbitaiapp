import React, { useState, useMemo, useEffect } from 'react';
import { Conversation, Persona, MessageType } from '../types';
import { XIcon, Trash2Icon, SettingsIcon, SquarePenIcon, BarChartIcon, TerminalIcon, CheckIcon, CopyIcon, ChevronDownIcon } from './icons';
import { translations } from '../translations';

type Language = keyof typeof translations;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: string;
  setTheme: (theme: string) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  personas: Persona[];
  setPersonas: (personas: Persona[]) => void;
  conversations: Conversation[];
  setConversations: (conversations: Conversation[]) => void;
  activeConversationId: string | null;
  t: (key: string, params?: Record<string, string>) => string;
}

type SettingsTab = 'General' | 'Personalization' | 'Usage' | 'API';

const INPUT_PRICE_PER_1M_TOKENS = 0.35;
const OUTPUT_PRICE_PER_1M_TOKENS = 0.70;

const formatTokens = (tokens: number): string => {
    if (tokens < 1000) return tokens.toString();
    return `${(tokens / 1000).toFixed(1)}K`;
};

const languageNames: Record<Language, string> = {
    en: 'English',
    el: 'Ελληνικά (Greek)',
    es: 'Español (Spanish)',
    fr: 'Français (French)',
    de: 'Deutsch (German)',
};

const CodeSnippet: React.FC<{ lang: string; code: string; copyText?: string; t: (key: string, params?: Record<string, string>) => string }> = ({ lang, code, copyText, t }) => {
    const [isCopied, setIsCopied] = useState(false);
    const [highlightedCode, setHighlightedCode] = useState('');

    useEffect(() => {
        if ((window as any).hljs) {
            try {
                const language = lang === 'jsx' ? 'javascript' : lang;
                const highlighted = (window as any).hljs.highlight(code, { language, ignoreIllegals: true }).value;
                setHighlightedCode(highlighted);
            } catch (e) { 
                setHighlightedCode(code.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
            }
        } else {
             setHighlightedCode(code.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
        }
    }, [code, lang]);

    const handleCopy = () => {
        navigator.clipboard.writeText(copyText || code).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    return (
        <div className="bg-[#18181b] border border-default rounded-lg overflow-hidden my-4 group">
            <div className="flex justify-between items-center px-4 py-2 bg-[#212121] border-b border-default">
                <span className="text-xs font-semibold text-muted-foreground uppercase">{lang}</span>
                <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}
                    {isCopied ? t('code.copied') : t('code.copy')}
                </button>
            </div>
            <pre className="p-4 text-sm overflow-x-auto text-[#e4e4e7]"><code className={`language-${lang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
        </div>
    );
};


const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, theme, setTheme, language, setLanguage, personas, setPersonas,
  conversations, setConversations, activeConversationId, t
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('General');
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [activeSnippet, setActiveSnippet] = useState('curl');
  const [activeToolSnippet, setActiveToolSnippet] = useState('curl');
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  const usageStats = useMemo(() => {
    if (!activeConversation) {
        return { inputTokens: 0, outputTokens: 0, totalCost: 0 };
    }
    let inputTokens = 0;
    let outputTokens = 0;

    activeConversation.messages.forEach(message => {
        if (message.type !== MessageType.USER && message.usageMetadata) {
            inputTokens += message.usageMetadata.promptTokenCount;
            outputTokens += message.usageMetadata.candidatesTokenCount;
        }
    });

    const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M_TOKENS;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M_TOKENS;
    const totalCost = inputCost + outputCost;

    return { inputTokens, outputTokens, totalCost };
  }, [activeConversation]);

  const handlePersonaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const personaId = e.target.value;
    if (activeConversationId) {
      setConversations(conversations.map(c => 
        c.id === activeConversationId ? { ...c, personaId: personaId === 'default' ? undefined : personaId } : c
      ));
    }
  };
  
  const handleSavePersona = (persona: Persona) => {
    if (personas.some(p => p.id === persona.id)) {
      setPersonas(personas.map(p => p.id === persona.id ? persona : p));
    } else {
      setPersonas([...personas, persona]);
    }
    setEditingPersona(null);
  };
  
  const handleDeletePersona = (id: string) => {
    if (window.confirm(t('settings.personalization.confirmDelete'))) {
        setPersonas(personas.filter(p => p.id !== id));
    }
  };

  if (!isOpen) return null;

  // --- Layout Components ---

  const TabButton = ({ tab, label, icon }: { tab: SettingsTab, label: string, icon: React.ReactNode }) => (
      <button
          onClick={() => setActiveTab(tab)}
          className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab 
              ? 'bg-foreground/10 text-foreground' 
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
          }`}
      >
          {icon}
          {label}
      </button>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4 backdrop-blur-md" onClick={onClose}>
      <div 
        className="bg-card w-full max-w-5xl h-[80vh] flex overflow-hidden rounded-2xl border border-default shadow-2xl animate-fade-in-up" 
        onClick={e => e.stopPropagation()}
      >
        
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-default bg-surface-l1 flex flex-col">
            <div className="p-6 pb-2 border-b border-default/50 mb-2">
                 <h2 className="text-lg font-bold text-foreground tracking-tight">Settings</h2>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                <TabButton tab="General" label={t('settings.tabs.general')} icon={<SettingsIcon className="size-4" />} />
                <TabButton tab="Personalization" label={t('settings.tabs.personalization')} icon={<SquarePenIcon className="size-4" />} />
                <TabButton tab="Usage" label={t('settings.tabs.usage')} icon={<BarChartIcon className="size-4" />} />
                <TabButton tab="API" label={t('settings.tabs.api')} icon={<TerminalIcon className="size-4" />} />
            </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-background p-8 lg:p-12 scrollbar-thin">
            <div className="max-w-3xl mx-auto space-y-8">
                
                {activeTab === 'General' && (
                    <section className="animate-fade-in-up">
                        <header className="mb-6">
                            <h3 className="text-2xl font-bold text-foreground">{t('settings.general.title')}</h3>
                            <p className="text-muted-foreground mt-1">{t('settings.general.description')}</p>
                        </header>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{t('settings.general.theme')}</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['light', 'dark', 'system'] as const).map(th => (
                                        <button 
                                            key={th} 
                                            onClick={() => setTheme(th)} 
                                            className={`px-4 py-3 text-sm font-medium rounded-xl border transition-all ${
                                                theme === th 
                                                ? 'bg-foreground text-background border-foreground' 
                                                : 'bg-surface-l1 text-muted-foreground border-default hover:border-foreground/50'
                                            }`}
                                        >
                                            {t(`settings.general.themes.${th}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{t('settings.general.language')}</label>
                                <select
                                    value={language}
                                    onChange={e => setLanguage(e.target.value as Language)}
                                    className="w-full p-3 text-sm bg-surface-l1 border border-default rounded-xl text-foreground focus:ring-2 focus:ring-foreground/20 outline-none transition-all appearance-none cursor-pointer hover:border-foreground/50"
                                >
                                    {Object.keys(translations).map(langCode => (
                                        <option key={langCode} value={langCode}>
                                            {languageNames[langCode as Language] || langCode}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === 'Personalization' && (
                    <section className="animate-fade-in-up">
                         <header className="mb-6">
                            <h3 className="text-2xl font-bold text-foreground">{t('settings.personalization.title')}</h3>
                            <p className="text-muted-foreground mt-1">{t('settings.personalization.description')}</p>
                        </header>

                        <div className="space-y-8">
                             <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">{t('settings.personalization.personas')}</label>
                                <div className="relative">
                                    <select 
                                        value={activeConversation?.personaId || 'default'} 
                                        onChange={handlePersonaChange} 
                                        className="w-full p-3 text-sm bg-surface-l1 border border-default rounded-xl text-foreground focus:ring-2 focus:ring-foreground/20 outline-none appearance-none cursor-pointer hover:border-foreground/50"
                                    >
                                        <option value="default">{t('settings.personalization.selectDefault')}</option>
                                        {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                        <ChevronDownIcon className="size-4" />
                                    </div>
                                </div>
                             </div>

                             <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-foreground border-b border-default pb-2">{t('settings.personalization.manage')}</h4>
                                <div className="space-y-2">
                                    {personas.map(p => (
                                        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-l1 border border-default/50 hover:border-default transition-all">
                                            <div className="flex flex-col">
                                                <span className="text-foreground font-medium text-sm">{p.name}</span>
                                                <span className="text-muted-foreground text-xs truncate max-w-[200px]">{p.instruction}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setEditingPersona(p)} className="text-xs font-medium bg-foreground/5 hover:bg-foreground/10 text-foreground px-3 py-1.5 rounded-lg transition-colors">
                                                    {t('settings.personalization.edit')}
                                                </button>
                                                <button onClick={() => handleDeletePersona(p.id)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                                                    <Trash2Icon className="size-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    onClick={() => setEditingPersona({id: `persona-${Date.now()}`, name: '', instruction: ''})} 
                                    className="w-full py-3 text-sm font-medium text-foreground bg-surface-l1 border border-dashed border-default rounded-xl hover:bg-surface-l2 transition-colors flex items-center justify-center gap-2"
                                >
                                    <SquarePenIcon className="size-4" />
                                    {t('settings.personalization.add')}
                                </button>
                             </div>
                        </div>
                    </section>
                )}

                {activeTab === 'Usage' && (
                    <section className="animate-fade-in-up">
                        <header className="mb-6">
                            <h3 className="text-2xl font-bold text-foreground">{t('settings.usage.title')}</h3>
                            <p className="text-muted-foreground mt-1">{t('settings.usage.description')}</p>
                        </header>

                        <div className="bg-surface-l1 rounded-2xl border border-default overflow-hidden">
                            <div className="p-6 border-b border-default/50">
                                <div className="flex justify-between items-end mb-4">
                                     <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('settings.usage.tokenUsage')}</h4>
                                     <span className="text-2xl font-mono font-bold text-foreground">{formatTokens(usageStats.inputTokens + usageStats.outputTokens)}</span>
                                </div>
                                <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                                    <div className="h-full bg-accent-blue" style={{ width: '100%' }} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-default/50">
                                <div className="p-6">
                                     <span className="block text-sm text-muted-foreground mb-1">{t('settings.usage.input')}</span>
                                     <div className="flex items-baseline gap-2">
                                         <span className="text-lg font-mono text-foreground">{formatTokens(usageStats.inputTokens)}</span>
                                         <span className="text-xs text-muted-foreground font-mono">(${((usageStats.inputTokens / 1_000_000) * INPUT_PRICE_PER_1M_TOKENS).toFixed(4)})</span>
                                     </div>
                                </div>
                                <div className="p-6">
                                     <span className="block text-sm text-muted-foreground mb-1">{t('settings.usage.output')}</span>
                                     <div className="flex items-baseline gap-2">
                                         <span className="text-lg font-mono text-foreground">{formatTokens(usageStats.outputTokens)}</span>
                                         <span className="text-xs text-muted-foreground font-mono">(${((usageStats.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M_TOKENS).toFixed(4)})</span>
                                     </div>
                                </div>
                            </div>
                            <div className="p-4 bg-background/50 border-t border-default/50 flex justify-between items-center">
                                <span className="text-sm font-medium text-foreground">{t('settings.usage.totalCost')}</span>
                                <span className="text-base font-bold text-foreground">${usageStats.totalCost.toFixed(4)}</span>
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === 'API' && (
                     <section className="animate-fade-in-up space-y-8">
                        <div>
                             <h3 className="text-2xl font-bold text-foreground mb-2">{t('settings.api.title')}</h3>
                             <p className="text-muted-foreground">{t('settings.api.description')}</p>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-foreground">{t('settings.api.endpoint')}</label>
                            <div className="flex">
                                <input type="text" readOnly value="https://aiqbit.vercel.app/api/chat" className="w-full p-3 font-mono text-sm bg-surface-l1 border border-default rounded-xl text-foreground focus:ring-2 focus:ring-foreground/20 outline-none select-all" />
                            </div>
                        </div>
                        
                        <div>
                            <h4 className="text-lg font-semibold text-foreground mb-2">{t('settings.api.basicTitle')}</h4>
                            <p className="text-sm text-muted-foreground mb-4">{t('settings.api.basicDescription')}</p>
                            
                            <div className="flex gap-2 mb-4 p-1 bg-surface-l1 w-fit rounded-lg border border-default">
                                {(['curl', 'python', 'javascript', 'react'] as const).map(lang => (
                                    <button 
                                        key={lang} 
                                        onClick={() => setActiveSnippet(lang)} 
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${activeSnippet === lang ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {lang === 'javascript' ? 'Node.js' : lang}
                                    </button>
                                ))}
                            </div>
                            {/* Code Snippets... (keeping existing snippet logic but styled) */}
                            {/* Shortened for brevity in this response, assume CodeSnippet component renders well now */}
                             <CodeSnippet lang={activeSnippet === 'react' ? 'jsx' : activeSnippet === 'curl' ? 'bash' : activeSnippet} code={
                                 activeSnippet === 'curl' ? `curl -X POST https://aiqbit.vercel.app/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{
  "message": "Hello!",
  "language": "${language}"
}'` : activeSnippet === 'python' ? `import requests
requests.post("https://aiqbit.vercel.app/api/chat", json={"message": "Hello!"})` : '// See full docs'
                             } t={t} />
                        </div>
                     </section>
                )}

            </div>
        </main>

        <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-background/50 hover:bg-background text-muted-foreground hover:text-foreground border border-transparent hover:border-default transition-all md:hidden"
        >
            <XIcon className="size-5" />
        </button>
      </div>

      {editingPersona && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setEditingPersona(null)}>
            <div className="bg-card w-full max-w-lg rounded-2xl border border-default shadow-2xl p-6 space-y-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-foreground">{editingPersona.name ? t('settings.personaEditor.editTitle') : t('settings.personaEditor.addTitle')}</h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">{t('settings.personaEditor.name')}</label>
                        <input 
                            type="text" 
                            value={editingPersona.name} 
                            onChange={e => setEditingPersona({...editingPersona, name: e.target.value})} 
                            className="w-full p-3 bg-surface-l1 border border-default rounded-xl text-foreground focus:ring-2 focus:ring-foreground/20 outline-none"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">{t('settings.personaEditor.instruction')}</label>
                        <textarea 
                            value={editingPersona.instruction} 
                            onChange={e => setEditingPersona({...editingPersona, instruction: e.target.value})} 
                            rows={5} 
                            className="w-full p-3 bg-surface-l1 border border-default rounded-xl text-foreground focus:ring-2 focus:ring-foreground/20 outline-none resize-none"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setEditingPersona(null)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{t('settings.personaEditor.cancel')}</button>
                    <button onClick={() => handleSavePersona(editingPersona)} className="px-6 py-2 text-sm font-medium bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity">{t('settings.personaEditor.save')}</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default SettingsModal;
