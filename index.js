const scrapeRemax = require('./scraper'); // directamente

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
