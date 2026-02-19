const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// ✅ IMPORTS
const db = require('../modules/dbAdapter');
const metaScraper = require('../modules/metaScraper');
const autoTracker = require('../modules/autoTracker');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// ✅ MULTER SETUP
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => cb(null, 'logo_' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

router.use(requireAuth, requireAdmin);

// ==========================================
// 1. DASHBOARD & TRACKER
// ==========================================
router.get('/dashboard', (req, res) => {
    const library = db.read('anime_library') || [];
    const logs = db.read('system_logs') || [];
    const queue = db.read('tracker_queue') || [];
    
    let totalEpisodes = 0;
    library.forEach(a => { if(a.seasons) a.seasons.forEach(s => totalEpisodes += s.episodes.length); });

    res.render('admin/dashboard', { 
        stats: { totalAnime: library.length, totalEpisodes, activeTracking: queue.filter(q => !q.completed).length }, 
        logs: logs, notifications: [] 
    });
});

router.get('/run-tracker', async (req, res) => {
    try {
        await autoTracker.checkAll();
        let logs = db.read('system_logs') || [];
        logs.unshift({ time: new Date().toLocaleString(), msg: 'Manual Tracker Run', type: 'info' });
        db.write('system_logs', logs.slice(0, 50));
        res.redirect('/admin/dashboard?msg=Tracker Ran Successfully');
    } catch (e) { res.redirect('/admin/dashboard?error=Tracker Failed'); }
});

// ==========================================
// 2. MANAGE ANIME
// ==========================================
router.get('/manage-anime', (req, res) => {
    const library = db.read('anime_library') || [];
    library.reverse(); 
    res.render('admin/manage_anime', { library });
});

router.post('/delete-anime', (req, res) => {
    const { animeId } = req.body;
    let library = db.read('anime_library') || [];
    db.write('anime_library', library.filter(a => String(a.id) !== String(animeId)));
    
    let trending = db.read('trending') || [];
    let spotlight = db.read('spotlight') || [];
    db.write('trending', trending.filter(id => String(id) !== String(animeId)));
    db.write('spotlight', spotlight.filter(id => String(id) !== String(animeId)));
    
    let queue = db.read('tracker_queue') || [];
    db.write('tracker_queue', queue.filter(q => String(q.libraryId) !== String(animeId)));

    res.redirect('/admin/manage-anime?msg=Deleted');
});

// ==========================================
// 3. TRENDING (SORT FIX)
// ==========================================
router.get('/trending', (req, res) => {
    let library = db.read('anime_library') || [];
    const trendingIds = (db.read('trending') || []).map(String);
    const spotlightIds = (db.read('spotlight') || []).map(String);
    
    library.sort((a, b) => {
        const idA = String(a.id); const idB = String(b.id);
        let sA = spotlightIds.indexOf(idA); let sB = spotlightIds.indexOf(idB);
        if (sA === -1) sA = 99999; if (sB === -1) sB = 99999;
        if (sA !== sB) return sA - sB;
        
        let tA = trendingIds.indexOf(idA); let tB = trendingIds.indexOf(idB);
        if (tA === -1) tA = 99999; if (tB === -1) tB = 99999;
        if (tA !== tB) return tA - tB;
        
        return a.title.localeCompare(b.title);
    });

    res.render('admin/manage_trending', { library, trendingIds, spotlightIds });
});

router.post('/trending', (req, res) => {
    try {
        const data = JSON.parse(req.body.payload);
        let newSpotlight = [], newTrending = [];

        data.forEach(item => {
            const safeId = String(item.id);
            if (item.s > 0) newSpotlight.push({ id: safeId, rank: Number(item.s) });
            if (item.t > 0) newTrending.push({ id: safeId, rank: Number(item.t) });
        });

        newSpotlight.sort((a, b) => a.rank - b.rank);
        newTrending.sort((a, b) => a.rank - b.rank);

        db.write('spotlight', newSpotlight.map(x => x.id));
        db.write('trending', newTrending.map(x => x.id));
        res.redirect('/admin/trending?msg=Saved');
    } catch (e) { res.redirect('/admin/trending?msg=Error'); }
});

// ==========================================
// 4. ➕ ADD ANIME (CORRECT MOVIE LOGIC)
// ==========================================
router.get('/add-anime', (req, res) => res.render('admin/add_anime'));

router.post('/add-anime', async (req, res) => {
    try {
        let { url, type, season, episode, targetEpisode } = req.body;
        
        // Ensure Arrays (Form Handling)
        let seasons = Array.isArray(season) ? season : [season];
        let startEps = Array.isArray(episode) ? episode : [episode];
        let endEps = Array.isArray(targetEpisode) ? targetEpisode : [targetEpisode];

        // 1. Scrape Metadata
        const meta = await metaScraper.fetchDetails(url);
        
        // Manual Override: If User Selected "Movie", Force it
        if (type === 'Movie') {
            meta.isMovie = true;
            meta.type = 'Movie';
        }

        let library = db.read('anime_library') || [];
        let queue = db.read('tracker_queue') || [];
        
        let animeId;
        let existingAnime = library.find(a => a.slug === meta.slug);
        
        // 2. Add/Update Library Entry
        if (existingAnime) {
            animeId = existingAnime.id;
            existingAnime.type = meta.type;
            // Update Metadata only if found
            if(meta.thumbnail) existingAnime.thumbnail = meta.thumbnail;
            if(meta.description) existingAnime.description = meta.description;
        } else {
            animeId = uuidv4();
            const newAnime = { 
                id: animeId, 
                ...meta, 
                type: meta.type || 'TV', 
                seasons: [] 
            };
            library.push(newAnime);
            existingAnime = newAnime;
        }

        // 3. Process Seasons
        for (let i = 0; i < seasons.length; i++) {
            const seasonNum = parseInt(seasons[i]);
            
            let seasonObj = existingAnime.seasons.find(s => s.season === seasonNum);
            if (!seasonObj) { 
                seasonObj = { season: seasonNum, episodes: [] }; 
                existingAnime.seasons.push(seasonObj); 
            }

            // 🟢 MOVIE LOGIC: DIRECT LINK SAVE
            // Agar Movie hai, to INPUT URL hi Episode 1 hai.
            if (meta.isMovie) {
                // Delete existing ep 1 (if any) to update link
                seasonObj.episodes = seasonObj.episodes.filter(e => e.episode !== 1);
                
                seasonObj.episodes.push({
                    episode: 1, 
                    url: url,   // <--- Saving Direct WatchAnimeWorld Link
                    releaseDate: new Date().toISOString().split('T')[0]
                });
            } 
            
            // 🟢 TRACKER QUEUE
            let alreadyTracking = queue.find(q => q.slug === meta.slug && q.season === seasonNum);
            if (!alreadyTracking) {
                db.push('tracker_queue', {
                    id: Date.now() + i,
                    libraryId: animeId,
                    title: meta.title,
                    slug: meta.slug,
                    season: seasonNum,
                    lastEpisode: parseInt(startEps[i]) - 1,
                    targetEpisode: meta.isMovie ? 1 : parseInt(endEps[i] || startEps[i]),
                    totalEpisodes: meta.totalEpisodes,
                    url: url,
                    completed: meta.isMovie // Mark movies as complete immediately
                });
            }
        }

        db.write('anime_library', library);
        
        // Series ke liye tracker chalao, Movie ke liye nahi
        if (!meta.isMovie) {
            autoTracker.checkAll();
        }
        
        res.redirect('/admin/dashboard?msg=Added Successfully');

    } catch (error) {
        console.error("Add Anime Error:", error);
        res.redirect('/admin/add-anime?error=Failed');
    }
});

// ... (Settings & Scrape routes) ...
router.get('/settings', (req, res) => res.render('admin/settings'));
router.post('/settings', upload.single('logo'), (req, res) => {
    let settings = db.read('site_settings') || {};
    let newSettings = { ...settings, ...req.body, maintenanceMode: req.body.maintenanceMode === 'on' };
    if (req.file) newSettings.logoUrl = '/uploads/' + req.file.filename;
    fs.writeFileSync(path.join(__dirname, '../data/site_settings.json'), JSON.stringify(newSettings, null, 4));
    res.redirect('/admin/settings?msg=Settings Saved');
});

router.post('/scrape', async (req, res) => {
    const { url } = req.body;
    try {
        const { extractLink } = require('../modules/videoExtractor');
        const link = await extractLink(url);
        res.json({ data: [{ title: "Result", url: link || "No Link Found" }] });
    } catch (e) { res.json({ data: [{ title: "Error", url: e.message }] }); }
});

module.exports = router;