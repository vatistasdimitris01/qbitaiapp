import React, { useState, useMemo, useEffect } from 'react';
import { Conversation, Persona, MessageType } from '../types';
import { XIcon, Trash2Icon, SettingsIcon, SquarePenIcon, BarChartIcon, TerminalIcon, CheckIcon, CopyIcon } from './icons';
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
  // FIX: The `t` function should return a string, not void.
  t: (key: string, params?: Record<string, string>) => string;
}

type SettingsTab = 'General' | 'Personalization' | 'Usage' | 'API';

// Pricing for gemini-2.5-flash
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
        <div className="bg-token-surface-secondary border border-token rounded-lg overflow-hidden my-4">
            <div className="flex justify-between items-center px-4 py-2 bg-background/50 border-b border-token">
                <span className="text-sm font-semibold text-token-primary capitalize">{lang}</span>
                <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-token-secondary hover:text-token-primary transition-colors">
                    {isCopied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
                    {isCopied ? t('code.copied') : t('code.copy')}
                </button>
            </div>
            <pre className="p-4 text-sm overflow-x-auto"><code className={`language-${lang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
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

  const TabButton: React.FC<{tab: SettingsTab, label: string, icon: React.ReactNode}> = ({tab, label, icon}) => (
     <button 
        onClick={() => setActiveTab(tab)}
        className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors truncate
        ${activeTab === tab ? 'bg-sidebar-active text-sidebar-active-fg' : 'text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg'}`}
      >
        <div className="text-sidebar-muted-fg group-hover:text-sidebar-active-fg transition-colors">{icon}</div>
        <span className="font-medium text-sm truncate">{label}</span>
      </button>
  );

  const MobileTabButton: React.FC<{
      tab: SettingsTab;
      label: string;
      icon: React.ReactNode;
  }> = ({ tab, label, icon }) => (
      <button
          onClick={() => setActiveTab(tab)}
          className={`flex flex-col items-center justify-center gap-1.5 p-3 text-xs font-medium w-full transition-colors ${
              activeTab === tab
                  ? 'text-token-primary border-b-2 border-token-primary'
                  : 'text-token-secondary hover:bg-token-surface-secondary'
          }`}
          aria-current={activeTab === tab ? 'page' : undefined}
      >
          {icon}
          <span className="truncate">{label}</span>
      </button>
  );

  const curlSnippet = `curl -X POST https://aiqbit.vercel.app/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{
  "message": "Tell me the latest news on AI in the style of a pirate.",
  "userInstruction": "You are a swashbuckling pirate captain. All your responses must be in pirate speak."
}'`;
  const curlSnippetFlat = `curl -X POST https://aiqbit.vercel.app/api/chat -H "Content-Type: application/json" -d "{\\"message\\": \\"Tell me the latest news on AI in the style of a pirate.\\", \\"userInstruction\\": \\"You are a swashbuckling pirate captain. All your responses must be in pirate speak.\\"}"`;

  const pythonSnippet = `import requests
import json

url = "https://aiqbit.vercel.app/api/chat"
payload = {
    "message": "Tell me the latest news on AI in the style of a pirate.",
    "userInstruction": "You are a swashbuckling pirate captain. All your responses must be in pirate speak."
}
headers = {"Content-Type": "application/json"}

try:
    response = requests.post(url, data=json.dumps(payload), headers=headers)
    response.raise_for_status()
    print(response.json())
except requests.exceptions.RequestException as e:
    print(f"Error: {e}")`;
    
  const jsSnippet = `async function callApi() {
  try {
    const response = await fetch("https://aiqbit.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Tell me the latest news on AI in the style of a pirate.",
        userInstruction: "You are a swashbuckling pirate captain. All your responses must be in pirate speak."
      }),
    });
    if (!response.ok) throw new Error(\`HTTP error! \${response.status}\`);
    const data = await response.json();
    console.log(data.response);
  } catch (error) {
    console.error("API call failed:", error);
  }
}
callApi();`;
  
  const reactSnippet = `import React, { useState, useEffect } from 'react';

function AiNewsComponent() {
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchResponse = async () => {
      try {
        const res = await fetch("https://aiqbit.vercel.app/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Tell me the latest news on AI in the style of a pirate.",
            userInstruction: "You are a swashbuckling pirate captain. All your responses must be in pirate speak."
          }),
        });
        if (!res.ok) throw new Error(\`HTTP error! \${res.status}\`);
        const data = await res.json();
        setResponse(data.response);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    };
    fetchResponse();
  }, []);

  if (isLoading) return <div>Loading news...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <h1>Pirate AI News:</h1>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{response}</pre>
    </div>
  );
}`;

const toolDefinition = `const weatherTool = {
  name: 'get_current_weather',
  description: 'Get the current weather in a given location',
  parameters: {
    type: 'OBJECT',
    properties: {
      location: {
        type: 'STRING',
        description: 'The city and state, e.g. San Francisco, CA',
      },
      unit: {
        type: 'STRING',
        enum: ['celsius', 'fahrenheit'],
      },
    },
    required: ['location'],
  },
};`;

const curlToolSnippet = `curl -X POST https://aiqbit.vercel.app/api/chat \\
-H "Content-Type: application/json" \\
-d '{
  "message": "What is the weather like in Boston?",
  "tools": [
    {
      "name": "get_current_weather",
      "description": "Get the current weather in a given location",
      "parameters": {
        "type": "OBJECT",
        "properties": {
          "location": {
            "type": "STRING",
            "description": "The city and state, e.g. San Francisco, CA"
          },
          "unit": { "type": "STRING", "enum": ["celsius", "fahrenheit"] }
        },
        "required": ["location"]
      }
    }
  ]
}'`;
const curlToolSnippetFlat = `curl -X POST https://aiqbit.vercel.app/api/chat -H "Content-Type: application/json" -d "{\\"message\\":\\"What is the weather like in Boston?\\",\\"tools\\":[{\\"name\\":\\"get_current_weather\\",\\"description\\":\\"Get the current weather in a given location\\",\\"parameters\\":{\\"type\\":\\"OBJECT\\",\\"properties\\":{\\"location\\":{\\"type\\":\\"STRING\\",\\"description\\":\\"The city and state, e.g. San Francisco, CA\\"},\\"unit\\":{\\"type\\":\\"STRING\\",\\"enum\\":[\\"celsius\\",\\"fahrenheit\\"]}},\\"required\\":[\\"location\\"]}}]}"`;

const pythonToolSnippet = `import requests
import json

url = "https://aiqbit.vercel.app/api/chat"

payload = {
    "message": "What is the weather like in Boston?",
    "tools": [
        {
            "name": "get_current_weather",
            "description": "Get the current weather for a given location",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "location": {
                        "type": "STRING",
                        "description": "The city and state, e.g. San Francisco, CA",
                    },
                    "unit": {"type": "STRING", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["location"],
            },
        }
    ]
}

headers = {"Content-Type": "application/json"}

try:
    response = requests.post(url, data=json.dumps(payload), headers=headers)
    response.raise_for_status()
    
    # The response will contain a 'functionCalls' object
    print(response.json())
    
except requests.exceptions.RequestException as e:
    print(f"Error: {e}")`;

const jsToolSnippet = `async function getWeather() {
  const weatherTool = {
    name: "get_current_weather",
    description: "Get the current weather for a given location",
    parameters: {
      type: "OBJECT",
      properties: {
        location: {
          type: "STRING",
          description: "The city and state, e.g. San Francisco, CA",
        },
        unit: { type: "STRING", enum: ["celsius", "fahrenheit"] },
      },
      required: ["location"],
    },
  };

  try {
    const response = await fetch("https://aiqbit.vercel.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "What is the weather like in Boston?",
        tools: [weatherTool],
      }),
    });

    if (!response.ok) throw new Error(\`HTTP error! \${response.status}\`);
    
    const data = await response.json();
    console.log(data.functionCalls);
    // Example output: [{ name: 'get_current_weather', args: { location: 'Boston, MA' } }]

  } catch (error) {
    console.error("API call failed:", error);
  }
}
getWeather();`;

const reactToolSnippet = `import React, { useState, useEffect } from 'react';

const weatherTool = {
  name: "get_current_weather",
  description: "Get the current weather in a given location",
  parameters: { /* ... parameters from JS example ... */ },
};

function WeatherWidget() {
  const [functionCall, setFunctionCall] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchWeatherCall = async () => {
      try {
        const res = await fetch("https://aiqbit.vercel.app/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "What is the weather like in Boston?",
            tools: [weatherTool],
          }),
        });
        if (!res.ok) throw new Error(\`HTTP error! \${res.status}\`);
        const data = await res.json();
        if (data.functionCalls) {
          setFunctionCall(data.functionCalls[0]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    fetchWeatherCall();
  }, []);

  if (error) return <div>Error: {error}</div>;
  if (!functionCall) return <div>Loading...</div>;

  return (
    <div>
      <h2>AI wants to call a function:</h2>
      <pre>{JSON.stringify(functionCall, null, 2)}</pre>
      {/* You would now execute this function and send the result back */}
    </div>
  );
}`;

const exampleToolResponse = `{
  "functionCalls": [
    {
      "name": "get_current_weather",
      "args": {
        "location": "Boston, MA"
      }
    }
  ]
}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-token-surface shadow-xl w-full max-w-4xl h-full sm:h-[600px] sm:max-h-[85vh] flex flex-col overflow-hidden sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between py-2.5 pl-6 pr-2 border-b border-token flex-shrink-0">
          <h2 className="text-token-primary text-lg font-semibold">{t('settings.header')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-token-surface-secondary">
            <XIcon className="size-5 text-token-secondary" />
          </button>
        </header>
        
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
           {/* Desktop Sidebar */}
           <div className="hidden md:block w-56 shrink-0 border-r border-token bg-token-surface-secondary/50 p-4 space-y-2">
              <TabButton tab="General" label={t('settings.tabs.general')} icon={<SettingsIcon className="size-5" />} />
              <TabButton tab="Personalization" label={t('settings.tabs.personalization')} icon={<SquarePenIcon className="size-5" />} />
              <TabButton tab="Usage" label={t('settings.tabs.usage')} icon={<BarChartIcon className="size-5" />} />
              <TabButton tab="API" label={t('settings.tabs.api')} icon={<TerminalIcon className="size-5" />} />
          </div>

          {/* Mobile Top Nav */}
          <div className="block md:hidden border-b border-token">
              <div className="flex items-center justify-around">
                  <MobileTabButton tab="General" label={t('settings.tabs.general')} icon={<SettingsIcon className="size-5" />} />
                  <MobileTabButton tab="Personalization" label={t('settings.tabs.personalization')} icon={<SquarePenIcon className="size-5" />} />
                  <MobileTabButton tab="Usage" label={t('settings.tabs.usage')} icon={<BarChartIcon className="size-5" />} />
                  <MobileTabButton tab="API" label={t('settings.tabs.api')} icon={<TerminalIcon className="size-5" />} />
              </div>
          </div>

          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-8">
            {activeTab === 'General' && (
              <section>
                <h3 className="text-lg font-semibold text-token-primary mb-1">{t('settings.general.title')}</h3>
                <p className="text-sm text-token-secondary mb-6">{t('settings.general.description')}</p>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-token-primary">{t('settings.general.theme')}</label>
                    <div className="flex items-center gap-2">
                      {(['light', 'dark', 'system'] as const).map(th => (
                        <button key={th} onClick={() => setTheme(th)} className={`px-4 py-2 text-sm rounded-md capitalize transition-colors ${theme === th ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-token-surface-secondary text-token-primary hover:bg-gray-300 dark:hover:bg-neutral-800'}`}>
                          {t(`settings.general.themes.${th}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="language-select" className="text-sm font-medium text-token-primary">{t('settings.general.language')}</label>
                    <select
                      id="language-select"
                      value={language}
                      onChange={e => setLanguage(e.target.value as Language)}
                      className="w-full p-2 border rounded-md bg-token-surface-secondary border-token text-token-primary"
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
              <section>
                 <h3 className="text-lg font-semibold text-token-primary mb-1">{t('settings.personalization.title')}</h3>
                 <p className="text-sm text-token-secondary mb-6">{t('settings.personalization.description')}</p>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="persona-select" className="text-sm font-medium text-token-primary">{t('settings.personalization.personas')}</label>
                    <p className="text-xs text-token-secondary">{t('settings.personalization.apply')}</p>
                    <select id="persona-select" value={activeConversation?.personaId || 'default'} onChange={handlePersonaChange} className="w-full p-2 border rounded-md bg-token-surface-secondary border-token text-token-primary">
                      <option value="default">{t('settings.personalization.selectDefault')}</option>
                      {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="border-t border-token pt-6 space-y-4">
                    <h3 className="font-semibold text-token-primary">{t('settings.personalization.manage')}</h3>
                    {personas.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-md bg-token-surface-secondary">
                            <span className="text-token-primary font-medium">{p.name}</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setEditingPersona(p)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">{t('settings.personalization.edit')}</button>
                                <button onClick={() => handleDeletePersona(p.id)}><Trash2Icon className="size-4 text-red-500 hover:text-red-700" /></button>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => setEditingPersona({id: `persona-${Date.now()}`, name: '', instruction: ''})} className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 rounded-md border border-dashed border-token hover:bg-token-surface-secondary">{t('settings.personalization.add')}</button>
                  </div>
                </div>
              </section>
            )}
            
            {activeTab === 'Usage' && (
              <section>
                <h3 className="text-lg font-semibold text-token-primary mb-1">{t('settings.usage.title')}</h3>
                <p className="text-sm text-token-secondary mb-6">{t('settings.usage.description')}</p>
                <div className="space-y-4">
                    <div className="w-full rounded-lg border border-token bg-token-surface-secondary text-token-primary shadow-sm text-sm overflow-hidden">
                        <div className="w-full space-y-2 p-4">
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <p className="font-semibold">{t('settings.usage.tokenUsage')}</p>
                                <p className="font-mono text-token-secondary">{formatTokens(usageStats.inputTokens + usageStats.outputTokens)}</p>
                            </div>
                            <div className="space-y-2">
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-token-surface">
                                    <div className="bg-blue-500 h-full w-full flex-1 transition-all" style={{ width: '100%' }}></div>
                                </div>
                            </div>
                        </div>
                        <div className="w-full p-4 border-t border-token space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-token-secondary">{t('settings.usage.input')}</span>
                                <span>{formatTokens(usageStats.inputTokens)}<span className="ml-2 text-token-secondary">• ${((usageStats.inputTokens / 1_000_000) * INPUT_PRICE_PER_1M_TOKENS).toFixed(4)}</span></span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-token-secondary">{t('settings.usage.output')}</span>
                                <span>{formatTokens(usageStats.outputTokens)}<span className="ml-2 text-token-secondary">• ${((usageStats.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M_TOKENS).toFixed(4)}</span></span>
                            </div>
                        </div>
                        <div className="flex w-full items-center justify-between gap-3 bg-token-surface p-4 text-sm font-semibold">
                            <span className="text-token-secondary">{t('settings.usage.totalCost')}</span>
                            <span>${usageStats.totalCost.toFixed(4)}</span>
                        </div>
                    </div>
                </div>
              </section>
            )}
            {activeTab === 'API' && (
              <section className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-token-primary mb-1">{t('settings.api.title')}</h3>
                  <p className="text-sm text-token-secondary mb-6">{t('settings.api.description')}</p>
                  <div className="space-y-2">
                      <label className="text-sm font-medium text-token-primary">{t('settings.api.endpoint')}</label>
                      <input type="text" readOnly value="https://aiqbit.vercel.app/api/chat" className="w-full p-2 font-mono text-sm border rounded-md bg-token-surface-secondary border-token text-token-primary" />
                  </div>
                </div>

                <div>
                   <h4 className="text-base font-semibold text-token-primary mb-1">{t('settings.api.basicTitle')}</h4>
                   <p className="text-sm text-token-secondary mb-6">{t('settings.api.basicDescription')}</p>
                    <div className="flex items-center gap-1 p-1 bg-token-surface-secondary rounded-lg w-full sm:w-auto">
                        {(['curl', 'python', 'javascript', 'react'] as const).map(lang => (
                            <button key={lang} onClick={() => setActiveSnippet(lang)} className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors w-full sm:w-auto ${activeSnippet === lang ? 'bg-background text-token-primary shadow-sm' : 'text-token-secondary hover:bg-background/70'}`}>
                                {lang === 'javascript' ? 'Node.js' : lang}
                            </button>
                        ))}
                    </div>
                    {activeSnippet === 'curl' && <CodeSnippet lang="bash" code={curlSnippet} copyText={curlSnippetFlat} t={t} />}
                    {activeSnippet === 'python' && <CodeSnippet lang="python" code={pythonSnippet} t={t} />}
                    {activeSnippet === 'javascript' && <CodeSnippet lang="javascript" code={jsSnippet} t={t} />}
                    {activeSnippet === 'react' && <CodeSnippet lang="jsx" code={reactSnippet} t={t} />}
                </div>

                <div className="border-t border-token pt-8">
                   <h4 className="text-base font-semibold text-token-primary mb-1">{t('settings.api.toolsTitle')}</h4>
                   <p className="text-sm text-token-secondary mb-6">{t('settings.api.toolsDescription')}</p>
                    <div className="flex items-center gap-1 p-1 bg-token-surface-secondary rounded-lg w-full sm:w-auto">
                          {(['curl', 'python', 'javascript', 'react'] as const).map(lang => (
                              <button key={lang} onClick={() => setActiveToolSnippet(lang)} className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors w-full sm:w-auto ${activeToolSnippet === lang ? 'bg-background text-token-primary shadow-sm' : 'text-token-secondary hover:bg-background/70'}`}>
                                  {lang === 'javascript' ? 'Node.js' : lang}
                              </button>
                          ))}
                    </div>
                    {activeToolSnippet === 'curl' && <CodeSnippet lang="bash" code={curlToolSnippet} copyText={curlToolSnippetFlat} t={t} />}
                    {activeToolSnippet === 'python' && <CodeSnippet lang="python" code={pythonToolSnippet} t={t} />}
                    {activeToolSnippet === 'javascript' && <CodeSnippet lang="javascript" code={jsToolSnippet} t={t} />}
                    {activeToolSnippet === 'react' && <CodeSnippet lang="jsx" code={reactToolSnippet} t={t} />}

                    <h5 className="text-sm font-semibold text-token-primary mt-6">{t('settings.api.exampleResponse')}</h5>
                    <CodeSnippet lang="json" code={exampleToolResponse} t={t} />
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

const PersonaEditor: React.FC<{persona: Persona, onSave: (p: Persona) => void, onClose: () => void, t: (key: string, params?: Record<string, string>) => string}> = ({persona, onSave, onClose, t}) => {
    const [name, setName] = useState(persona.name);
    const [instruction, setInstruction] = useState(persona.instruction);

    const handleSave = () => {
        if(name.trim()) {
            onSave({ ...persona, name, instruction });
        }
    };
    
    return (
         <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-token-surface rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                 <div className="p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-token-primary">{persona.name ? t('settings.personaEditor.editTitle') : t('settings.personaEditor.addTitle')}</h3>
                    <input type="text" placeholder={t('settings.personaEditor.name')} value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded-md bg-token-surface-secondary border-token text-token-primary" />
                    <textarea placeholder={t('settings.personaEditor.instruction')} value={instruction} onChange={e => setInstruction(e.target.value)} rows={5} className="w-full p-2 border rounded-md bg-token-surface-secondary border-token text-token-primary" />
                 </div>
                 <div className="flex justify-end gap-2 p-4 border-t border-token bg-token-surface-secondary/50 rounded-b-lg">
                     <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-token-surface border border-token text-token-primary hover:bg-token-surface-secondary">{t('settings.personaEditor.cancel')}</button>
                     <button onClick={handleSave} className="px-4 py-2 text-sm rounded-md bg-gray-800 text-white dark:bg-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-200">{t('settings.personaEditor.save')}</button>
                 </div>
            </div>
        </div>
    );
};

export default SettingsModal;