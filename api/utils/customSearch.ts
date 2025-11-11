export interface CustomSearchCredentials {
    apiKey: string | null;
    engineId: string | null;
}

const API_KEY_ENV_VARS = [
    'GOOGLE_SEARCH_API_KEY',
    'GOOGLE_CUSTOM_SEARCH_API_KEY',
    'CUSTOM_SEARCH_API_KEY',
    'CSE_API_KEY',
    'NEXT_PUBLIC_GOOGLE_SEARCH_API_KEY',
    'NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_API_KEY',
];

const ENGINE_ID_ENV_VARS = [
    'GOOGLE_SEARCH_ENGINE_ID',
    'GOOGLE_CUSTOM_SEARCH_ENGINE_ID',
    'CUSTOM_SEARCH_ENGINE_ID',
    'GOOGLE_SEARCH_CX',
    'CUSTOM_SEARCH_CX',
    'CSE_CX',
    'NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID',
    'NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID',
    'NEXT_PUBLIC_GOOGLE_SEARCH_CX',
];

export const getCustomSearchCredentials = (): CustomSearchCredentials => {
    const apiKey = API_KEY_ENV_VARS.map(name => process.env[name]).find(Boolean) ?? null;
    const engineId = ENGINE_ID_ENV_VARS.map(name => process.env[name]).find(Boolean) ?? null;
    return { apiKey, engineId };
};
