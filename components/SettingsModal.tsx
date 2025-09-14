import React, { useState, useMemo } from 'react';
import { Conversation, Persona } from '../types';
import { XIcon, Trash2Icon, SettingsIcon, SquarePenIcon, BarChartIcon } from './icons';
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
  t: (key: string) => string;
}

type SettingsTab = 'General' | 'Personalization' | 'Usage';

// Pricing for gemini-2.5-flash
const INPUT_PRICE_PER_1M_TOKENS = 0.35;
const OUTPUT_PRICE_PER_1M_TOKENS = 0.70;

const formatTokens = (tokens: number): string => {
    if (tokens < 1000) return tokens.toString();
    return `${(tokens / 1000).toFixed(1)}K`;
};


const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, theme, setTheme, language, setLanguage, personas, setPersonas,
  conversations, setConversations, activeConversationId, t
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('General');
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  const usageStats = useMemo(() => {
    if (!activeConversation) {
        return { inputTokens: 0, outputTokens: 0, totalCost: 0 };
    }
    let inputTokens = 0;
    let outputTokens = 0;

    activeConversation.messages.forEach(message => {
        if (message.author === 'ai' && message.usageMetadata) {
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
    if (window.confirm(t('personaConfirmDelete'))) {
        setPersonas(personas.filter(p => p.id !== id));
    }
  };

  if (!isOpen) return null;

  const TabButton: React.FC<{tab: SettingsTab, label: string, icon: React.ReactNode}> = ({tab, label, icon}) => (
     <button 
        onClick={() => setActiveTab(tab)}
        className={`group flex-1 md:w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:py-2 md:rounded-lg text-center md:text-left transition-colors truncate
        ${activeTab === tab ? 'bg-sidebar-accent text-sidebar-foreground' : 'hover:bg-sidebar-accent text-sidebar-foreground'}`}
      >
        <div className="hidden md:block text-sidebar-accent-foreground group-hover:text-sidebar-foreground transition-colors">{icon}</div>
        <span className="font-medium text-sm truncate">{label}</span>
      </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-token-main-surface-primary rounded-2xl shadow-xl w-full max-w-3xl h-[600px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between py-2.5 pl-4 pr-2 border-b border-token-border-light flex-shrink-0">
          <h2 id="radix-«rj7»" className="text-token-text-primary text-lg font-normal">{t('modalTitle')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-token-main-surface-secondary">
            <XIcon className="size-5 text-token-text-secondary" />
          </button>
        </header>
        
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
           <div className="flex flex-row md:flex-col md:w-48 shrink-0 border-b md:border-r md:border-b-0 border-token-border-light bg-token-bg-elevated-secondary md:p-2">
              <TabButton tab="General" label={t('tabGeneral')} icon={<SettingsIcon className="size-5" />} />
              <TabButton tab="Personalization" label={t('tabPersonalization')} icon={<SquarePenIcon className="size-5" />} />
              <TabButton tab="Usage" label={t('tabUsage')} icon={<BarChartIcon className="size-5" />} />
          </div>

          <div className="flex-1 p-6 overflow-y-auto space-y-8">
            {activeTab === 'General' && (
              <section>
                <h3 className="text-lg font-normal text-token-text-primary mb-4 pb-3 border-b border-token-border-light">{t('tabGeneral')}</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-token-text-primary">{t('theme')}</label>
                    <div className="flex items-center gap-2">
                      {(['light', 'dark', 'system'] as const).map(th => (
                        <button key={th} onClick={() => setTheme(th)} className={`px-4 py-2 text-sm rounded-md capitalize transition-colors ${theme === th ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-token-main-surface-secondary text-token-text-primary hover:bg-gray-300 dark:hover:bg-neutral-800'}`}>
                          {t(`theme${th.charAt(0).toUpperCase() + th.slice(1)}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="language-select" className="text-sm font-medium text-token-text-primary">{t('language')}</label>
                    <select id="language-select" value={language} onChange={e => setLanguage(e.target.value as Language)} className="w-full p-2 border rounded-md bg-token-main-surface-secondary border-token-border-light text-token-text-primary">
                      <option value="en">English</option>
                      <option value="el">Ελληνικά (Greek)</option>
                    </select>
                  </div>
                </div>
              </section>
            )}
            
            {activeTab === 'Personalization' && (
              <section>
                 <h3 className="text-lg font-normal text-token-text-primary mb-4 pb-3 border-b border-token-border-light">{t('tabPersonalization')}</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="persona-select" className="text-sm font-medium text-token-text-primary">{t('personas')}</label>
                    <p className="text-xs text-token-text-secondary">Apply a persona to the current conversation.</p>
                    <select id="persona-select" value={activeConversation?.personaId || 'default'} onChange={handlePersonaChange} className="w-full p-2 border rounded-md bg-token-main-surface-secondary border-token-border-light text-token-text-primary">
                      <option value="default">{t('personaSelect')} (Default)</option>
                      {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="border-t border-token-border-light pt-4 space-y-4">
                    <h3 className="font-semibold text-token-text-primary">{t('personaManage')}</h3>
                    {personas.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-token-main-surface-secondary">
                            <span className="text-token-text-primary">{p.name}</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setEditingPersona(p)} className="text-sm text-gray-600 dark:text-gray-400 hover:underline">{t('edit')}</button>
                                <button onClick={() => handleDeletePersona(p.id)}><Trash2Icon className="size-4 text-red-500 hover:text-red-700" /></button>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => setEditingPersona({id: `persona-${Date.now()}`, name: '', instruction: ''})} className="w-full py-2 text-sm text-gray-600 rounded-md border border-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-800/50">{t('personaAdd')}</button>
                  </div>
                </div>
              </section>
            )}
            
            {activeTab === 'Usage' && (
              <section>
                <h3 className="text-lg font-normal text-token-text-primary mb-4 pb-3 border-b border-token-border-light">{t('tabUsage')}</h3>
                <div className="space-y-4">
                    <p className="text-sm text-token-text-secondary">Usage statistics for the current conversation.</p>
                    <div className="w-full rounded-lg border border-token-border-light bg-token-main-surface-secondary text-token-text-primary shadow-sm text-sm overflow-hidden">
                        <div className="w-full space-y-2 p-3">
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <p>Unlimited</p>
                                <p className="font-mono text-token-text-secondary">{formatTokens(usageStats.inputTokens + usageStats.outputTokens)} / ∞</p>
                            </div>
                            <div className="space-y-2">
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-token-main-surface-primary">
                                    <div className="bg-blue-500 h-full w-full flex-1 transition-all" style={{ width: '100%' }}></div>
                                </div>
                            </div>
                        </div>
                        <div className="w-full p-3 border-t border-token-border-light">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-token-text-secondary">Input</span>
                                <span>{formatTokens(usageStats.inputTokens)}<span className="ml-2 text-token-text-secondary">• ${((usageStats.inputTokens / 1_000_000) * INPUT_PRICE_PER_1M_TOKENS).toFixed(4)}</span></span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-token-text-secondary">Output</span>
                                <span>{formatTokens(usageStats.outputTokens)}<span className="ml-2 text-token-text-secondary">• ${((usageStats.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M_TOKENS).toFixed(4)}</span></span>
                            </div>
                        </div>
                        <div className="flex w-full items-center justify-between gap-3 bg-token-main-surface-primary p-3 text-xs">
                            <span className="text-token-text-secondary">Total cost</span>
                            <span>${usageStats.totalCost.toFixed(4)}</span>
                        </div>
                    </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      {editingPersona && <PersonaEditor persona={editingPersona} onSave={handleSavePersona} onClose={() => setEditingPersona(null)} t={t} />}
    </div>
  );
};

const PersonaEditor: React.FC<{persona: Persona, onSave: (p: Persona) => void, onClose: () => void, t: (key: string) => string}> = ({persona, onSave, onClose, t}) => {
    const [name, setName] = useState(persona.name);
    const [instruction, setInstruction] = useState(persona.instruction);

    const handleSave = () => {
        if(name.trim()) {
            onSave({ ...persona, name, instruction });
        }
    };
    
    return (
         <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-token-main-surface-primary rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                 <div className="p-4 space-y-4">
                    <h3 className="text-lg font-semibold text-token-text-primary">{persona.name ? t('edit') + ' ' + t('personas') : t('personaAdd')}</h3>
                    <input type="text" placeholder={t('personaName')} value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded-md bg-token-main-surface-secondary border-token-border-light text-token-text-primary" />
                    <textarea placeholder={t('personaInstruction')} value={instruction} onChange={e => setInstruction(e.target.value)} rows={5} className="w-full p-2 border rounded-md bg-token-main-surface-secondary border-token-border-light text-token-text-primary" />
                 </div>
                 <div className="flex justify-end gap-2 p-4 border-t border-token-border-light">
                     <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-token-main-surface-secondary text-token-text-primary hover:bg-gray-300 dark:hover:bg-neutral-800">{t('personaCancel')}</button>
                     <button onClick={handleSave} className="px-4 py-2 text-sm rounded-md bg-gray-800 text-white dark:bg-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-200">{t('personaSave')}</button>
                 </div>
            </div>
        </div>
    );
};

export default SettingsModal;