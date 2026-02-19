const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./dbAdapter');
const videoExtractor = require('./videoExtractor'); // ✅ IMPORT EXTRACTOR

// --- SETTINGS ---
const CHECK_INTERVAL = 10 * 60 * 1000; // 10 Minutes
const TARGET_URL = "https://animesalt.top/"; 

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://animesalt.top/'
};

async function checkNewEpisodes() {
    console.log(`\n🔄 [Tracker] Scanning Homepage for New Episodes...`);
    
    try {
        const { data: html } = await axios.get(TARGET_URL, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(html);
        
        const library = db.read('anime_library') || [];
        let newCount = 0;
        let processed = new Set();

        // 1. Find "Episode" Links
        const links = $('a[href*="/episode/"]');
        console.log(`🔍 Found ${links.length} episode links on Homepage.`);

        for (let i = 0; i < links.length; i++) {
            const el = links[i];
            const pageUrl = $(el).attr('href');
            
            if (!pageUrl || processed.has(pageUrl)) continue;
            processed.add(pageUrl);

            // 2. Extract Info from URL
            // URL: https://animesalt.top/episode/naruto-shippuden-1x500/
            const parts = pageUrl.split('/').filter(p => p.length > 0);
            const slug = parts[parts.length - 1]; 

            const match = slug.match(/(.*?)-(\d+)x(\d+)/) || slug.match(/(.*?)-episode-(\d+)/);
            if (!match) continue;

            let seriesSlug = match[1].replace(/-/g, ' ').trim();
            let epNum = match[3] ? parseInt(match[3]) : parseInt(match[2]);
            let seasonNum = match[3] ? parseInt(match[2]) : 1;

            // 3. Match with DB
            let anime = library.find(a => a.title.toLowerCase().includes(seriesSlug.toLowerCase()));

            if (anime) {
                // Ensure Season
                let seasonObj = anime.seasons.find(s => s.season == seasonNum);
                if (!seasonObj) {
                    seasonObj = { season: seasonNum, episodes: [] };
                    anime.seasons.push(seasonObj);
                }

                // Check if EP exists
                const exists = seasonObj.episodes.find(e => e.episode == epNum);
                
                if (!exists) {
                    console.log(`✨ [New Episode Found] ${anime.title} - Ep ${epNum}`);
                    console.log(`   🚀 Going inside to extract video...`);

                    // 🔴 HERE IS THE MAGIC 🔴
                    // Tracker khud Extractor ko call kar raha hai
                    const directVideoLink = await videoExtractor.extractLink(pageUrl);
                    
                    if (directVideoLink) {
                        seasonObj.episodes.push({
                            episode: epNum,
                            title: `Episode ${epNum}`,
                            url: directVideoLink, // ✅ Saving DIRECT VIDEO LINK
                            releaseDate: new Date().toISOString().split('T')[0]
                        });
                        newCount++;
                        console.log(`   💾 Saved Direct Link to DB!`);
                    } else {
                        console.log(`   ⚠️ Could not extract video. Skipping.`);
                    }
                }
            }
        }

        if (newCount > 0) {
            db.write('anime_library', library);
            console.log(`✅ Total ${newCount} new episodes added.`);
        } else {
            console.log(`💤 No new episodes for your library.`);
        }

    } catch (error) {
        console.error(`❌ [Tracker Error]: ${error.message}`);
    }
}

function start() {
    checkNewEpisodes();
    setInterval(checkNewEpisodes, CHECK_INTERVAL);
}

module.exports = { start };