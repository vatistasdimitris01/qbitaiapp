const redirectHosts = [
    'vertexaisearch.cloud.google.com',
    'www.google.com',
    'google.com',
];

const redirectParamCandidates = ['url', 'u', 'q', 'imgurl', 'link', 'target', 'dest'];

const tryParseUrl = (value: string): URL | null => {
    if (!value) return null;
    try {
        return new URL(value);
    } catch {
        try {
            return new URL(`https://${value}`);
        } catch {
            return null;
        }
    }
};

const decodeOnce = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

export const getEffectiveUrl = (rawUrl: string): URL | null => {
    if (!rawUrl) return null;
    const parsed = tryParseUrl(rawUrl);
    if (!parsed) return null;

    if (redirectHosts.some(host => parsed.hostname.includes(host))) {
        for (const param of redirectParamCandidates) {
            const candidate = parsed.searchParams.get(param);
            if (!candidate) continue;
            const decodedCandidate = decodeOnce(candidate);
            const nested = tryParseUrl(decodedCandidate);
            if (nested) {
                return nested;
            }
        }
    }

    return parsed;
};

export const getDisplayDomain = (rawUrl: string): string => {
    const effective = getEffectiveUrl(rawUrl);
    if (!effective) return 'source';
    return effective.hostname.replace(/^www\./, '') || 'source';
};

export const getFaviconUrl = (rawUrl: string): string => {
    const effective = getEffectiveUrl(rawUrl);
    if (!effective) return '/favicon.ico';
    return `${effective.origin}/favicon.ico`;
};
