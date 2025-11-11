import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part } from "@google/genai";
import formidable from 'formidable';
import fs from 'fs';

interface ApiAttachment {
    mimeType: string;
    data: string; // base64 encoded
}

interface HistoryItem {
    type: 'USER' | 'AI_RESPONSE' | 'SYSTEM' | 'ERROR' | 'AGENT_ACTION' | 'AGENT_PLAN';
    content: string;
    files?: ApiAttachment[];
}

interface LocationInfo {
    city: string;
    country: string;
    latitude?: number;
    longitude?: number;
}

interface GoogleSearchResultItem {
    title: string;
    link: string;
    snippet: string;
}

interface FormattedSearchResult {
    searchContext: string;
    searchResults: { web: { uri: string; title: string; } }[];
}

const languageMap: { [key: string]: string } = {
    en: 'English',
    el: 'Greek',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
};

export const config = {
  api: {
    bodyParser: false,
  },
};

const performWebSearch = async (query: string, location: LocationInfo | null): Promise<FormattedSearchResult> => {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;

    if (!apiKey || !cseId) {
        console.warn("Google Search is not configured. Missing GOOGLE_API_KEY or GOOGLE_CSE_ID.");
        return { searchContext: "", searchResults: [] };
    }

    let searchQuery = query;
    if (location?.city && location?.country) {
        searchQuery = `${query} in ${location.city}, ${location.country}`;
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(searchQuery)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Google Search API error:", errorData.error.message);
            return { searchContext: "", searchResults: [] };
        }
        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            return { searchContext: "", searchResults: [] };
        }
        const searchItems = data.items.slice(0, 5) as GoogleSearchResultItem[];
        
        const searchContext = searchItems.map((item, index) => 
            `[${index + 1}] Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
        ).join('\n\n');

        const searchResults = searchItems.map(item => ({
            web: {
                uri: item.link,
                title: item.title,