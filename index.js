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
        const mode = req.query.mode;

        if (mode === 'checkMaxPages') {
            console.log('Modo: Obteniendo número máximo de páginas...');
            const maxPages = await scraper.getMaxPages();
            return res.status(200).json({ success: true, maxPages: maxPages });
        }

        const startPage = parseInt(req.query.startPage) || 0;
        const endPageQuery = req.query.endPage;

        if (typeof endPageQuery === 'undefined') {
            return res.status(400).json({ success: false, error: 'El parámetro endPage es requerido.' });
        }
        const endPage = parseInt(endPageQuery);

        console.log(`Iniciando scraping desde página ${startPage} hasta página ${endPage}`);
        const properties = await scraper.scrapeRemax(startPage, endPage);
        return res.status(200).json({ success: true, data: properties });

    } catch (err) {
        console.error('Error crítico en la ruta /api/scrape:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${port}.`);
});