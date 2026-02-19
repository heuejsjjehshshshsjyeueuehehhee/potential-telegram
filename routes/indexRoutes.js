const express = require('express');
const router = express.Router();
const db = require('../modules/dbAdapter');
const siteConfig = require('../middleware/siteConfig');

router.use(siteConfig);

// 🏠 HOME PAGE
router.get('/', (req, res) => {
    const library = db.read('anime_library') || [];
    
    // String Conversion Fix
    const trendingIds = (db.read('trending') || []).map(String);
    const spotlightIds = (db.read('spotlight') || []).map(String);

    let trendingAnime = [];
    if (trendingIds.length > 0) {
        trendingAnime = trendingIds.map(id => library.find(a => String(a.id) === id)).filter(a => a);
    }

    let spotlightList = [];
    if (spotlightIds.length > 0) {
        spotlightList = spotlightIds.map(id => library.find(a => String(a.id) === id)).filter(a => a);
    }

    if (spotlightList.length < 5) {
        let needed = 5 - spotlightList.length;
        let fillers = trendingAnime.filter(t => !spotlightList.some(s => String(s.id) === String(t.id)));
        spotlightList = [...spotlightList, ...fillers.slice(0, needed)];
    }

    if (spotlightList.length < 5) {
        let needed = 5 - spotlightList.length;
        let latestFillers = [...library].reverse().filter(l => !spotlightList.some(s => String(s.id) === String(l.id)));
        spotlightList = [...spotlightList, ...latestFillers.slice(0, needed)];
    }

    const latestAnime = [...library].reverse().slice(0, 12);

    res.render('index', {
        title: 'Home',
        spotlightList, 
        trending: trendingAnime,
        animeList: latestAnime,
        sectionTitle: 'Latest Additions', 
        user: req.user || null
    });
});

// 🎬 MOVIES PAGE (New Route)
router.get('/movies', (req, res) => {
    const library = db.read('anime_library') || [];
    // Filter logic: Type should be 'Movie' (case insensitive)
    const movies = library.filter(a => a.type && a.type.toLowerCase() === 'movie');
    
    res.render('catalog', {
        title: 'Movies',
        animeList: movies,
        user: req.user || null
    });
});

// 📺 SERIES PAGE (New Route)
router.get('/series', (req, res) => {
    const library = db.read('anime_library') || [];
    // Filter logic: Type should be 'TV', 'ONA', or 'OVA'
    const series = library.filter(a => a.type && (a.type.toLowerCase() === 'tv' || a.type.toLowerCase() === 'ona' || a.type.toLowerCase() === 'ova'));
    
    res.render('catalog', {
        title: 'TV Series',
        animeList: series,
        user: req.user || null
    });
});

// ℹ️ DETAILS PAGE
router.get('/anime/:slug', (req, res) => {
    const slug = req.params.slug;
    const library = db.read('anime_library') || [];
    const anime = library.find(a => a.slug === slug);
    if (!anime) return res.status(404).render('404', { title: 'Not Found', user: req.user || null });
    res.render('details', { title: anime.title, anime, user: req.user || null });
});

// 🎬 WATCH PAGE
router.get('/watch/:slug', (req, res) => {
    const slug = req.params.slug;
    const library = db.read('anime_library') || [];
    const anime = library.find(a => a.slug === slug);

    if (!anime) return res.status(404).send("Anime not found");

    let seasonNum = req.query.season ? parseInt(req.query.season) : 1;
    let seasonData = anime.seasons.find(s => parseInt(s.season) === seasonNum);
    if (!seasonData && anime.seasons.length > 0) { seasonData = anime.seasons[0]; seasonNum = parseInt(seasonData.season); }
    if (!seasonData) return res.status(404).send("Season not found");

    seasonData.episodes.forEach((ep, idx) => { if (!ep.episode) ep.episode = idx + 1; });

    let episodeNum = req.query.episode ? parseInt(req.query.episode) : 1;
    let currentEpisode = seasonData.episodes.find(e => parseInt(e.episode) === episodeNum);
    if (!currentEpisode && seasonData.episodes.length > 0) { currentEpisode = seasonData.episodes[0]; episodeNum = parseInt(currentEpisode.episode); }
    if (!currentEpisode) return res.status(404).send("No episodes available.");

    let nextEpisodeLink = null;
    const currentIndex = seasonData.episodes.findIndex(e => parseInt(e.episode) === episodeNum);
    if (currentIndex !== -1 && currentIndex < seasonData.episodes.length - 1) {
        let nextEp = seasonData.episodes[currentIndex + 1];
        nextEpisodeLink = `/watch/${slug}?season=${seasonNum}&episode=${nextEp.episode}`;
    } else {
        let nextSeason = anime.seasons.find(s => parseInt(s.season) === seasonNum + 1);
        if (nextSeason && nextSeason.episodes.length > 0) {
            let firstEp = nextSeason.episodes[0].episode || 1;
            nextEpisodeLink = `/watch/${slug}?season=${nextSeason.season}&episode=${firstEp}`;
        }
    }

    res.render('watch', {
        title: `Watch ${anime.title}`,
        anime, currentSeason: seasonNum, currentEpisode, nextEpisodeLink, user: req.user || null
    });
});

// SEARCH & API
router.get('/search', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const library = db.read('anime_library') || [];
    let results = query ? library.filter(a => a.title.toLowerCase().includes(query)) : [];
    res.render('search', { title: `Search: ${query}`, results, searchQuery: query, user: req.user || null });
});

router.get('/api/search', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const library = db.read('anime_library') || [];
    let results = query.length > 1 ? library.filter(a => a.title.toLowerCase().includes(query)).slice(0, 5) : [];
    res.json(results);
});

module.exports = router;