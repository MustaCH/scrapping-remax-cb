const express = require('express');
const scraper = require('./scraper');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.get('/api/scrape', async (req, res) => {
    try {
        const operationId = parseInt(req.query.operationId) || 1;
        const mode = req.query.mode;

        if (mode === 'checkMaxPages') {
            console.log(`Modo: máximo de páginas (operationId=${operationId})...`);
            const maxPages = await scraper.getMaxPages(operationId);
            return res.status(200).json({ success: true, operationId, maxPages });
        }

        const startPage = parseInt(req.query.startPage) || 0;
        const endPageQuery = req.query.endPage;

        if (typeof endPageQuery === 'undefined') {
            return res.status(400).json({ success: false, error: 'El parámetro endPage es requerido.' });
        }
        const endPage = parseInt(endPageQuery);

        console.log(`Scraping operationId=${operationId} páginas ${startPage} a ${endPage}`);
        const properties = await scraper.scrapeRemax(startPage, endPage, operationId);
        return res.status(200).json({ success: true, operationId, count: properties.length, data: properties });

    } catch (err) {
        console.error('Error crítico en /api/scrape:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${port}.`);
});
