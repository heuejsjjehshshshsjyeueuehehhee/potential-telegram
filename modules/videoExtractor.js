/**
 * Video Extractor Module (Worker)
 * Kaam: Page URL leta hai -> Video URL deta hai.
 */
const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT_MS = 15000;

// Headers: Real Browser
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://animesalt.top/',
    'Origin': 'https://animesalt.top'
};

async function safeGet(url) {
    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT_MS });
        return response;
    } catch (e) {
        console.error(`   ❌ [Extractor Error]: ${e.message}`);
        return null;
    }
}

async function extractM3U8(pageUrl) {
    const resp = await safeGet(pageUrl);
    if (!resp) return null;
    const html = resp.data;
    let match = html.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (match) return match[1];
    match = html.match(/source\s*=\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (match) return match[1];
    return null;
}

const videoExtractor = {
    extractLink: async (episodeUrl) => {
        console.log(`   🔌 Visiting Page to Extract Video: ${episodeUrl}`);
        
        let resultData = { masterUrl: null, embedUrl: null };
        const resp = await safeGet(episodeUrl);
        
        if (!resp) return null;

        const html = resp.data;
        const $ = cheerio.load(html);

        // 1. Find Iframes
        let foundLinks = [];
        $('iframe').each((i, el) => {
            let src = $(el).attr('src');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                if (!src.includes('facebook') && !src.includes('google')) foundLinks.push(src);
            }
        });

        // 2. Select Best Player
        for (const link of foundLinks) {
            if (link.includes('short.icu') || link.includes('video') || link.includes('player') || link.includes('embed') || link.includes('watch')) {
                resultData.embedUrl = link;
                const m3u8 = await extractM3U8(link);
                if (m3u8) {
                    resultData.masterUrl = m3u8;
                    break;
                }
            }
        }

        // 3. Fallback
        if (!resultData.embedUrl) {
            const rawMatch = html.match(/https?:\/\/[a-z0-9-]+\.(short\.icu|zephyr|oxaam|file)\/[^\s"']+/i);
            if (rawMatch) resultData.embedUrl = rawMatch[0];
        }

        const finalLink = resultData.masterUrl || resultData.embedUrl;
        
        if (finalLink) console.log(`   ✅ Video Found: ${finalLink}`);
        else console.log(`   ❌ No Video Found on this page.`);

        return finalLink;
    }
};

module.exports = videoExtractor;