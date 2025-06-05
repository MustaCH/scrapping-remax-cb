const express = require('express');
const scrapeRemax = require('./scraper'); // o './scraper.js' si estás en Windows
const app = express();
const port = process.env.PORT || 3000;

// Middleware básico
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS para que n8n pueda conectarse
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Ruta principal de scraping
app.get('/api/scrape', async (req, res) => {
    const startPage = parseInt(req.query.startPage) || 0;
    const endPage = parseInt(req.query.endPage) || 10;

    const MAX_PAGES_PER_REQUEST = 50;
    const limitedEndPage = Math.min(endPage, startPage + MAX_PAGES_PER_REQUEST - 1);

    console.log(`Iniciando scraping desde página ${startPage} hasta página ${limitedEndPage}`);

    try {
        const properties = await scrapeRemax(startPage, limitedEndPage);
        return res.status(200).json({ success: true, data: properties });
    } catch (err) {
        console.error('Scraping error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Levanta el servidor
app.listen(port, () => {
    console.log(`Scraper API listening on port ${port}`);
});
