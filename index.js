const { scrapeRemax, getMaxPages } = require('./scraper');

app.get('/api/scrape', async (req, res) => {
    const mode = req.query.mode;
    
    // Si solo queremos obtener el número máximo de páginas
    if (mode === 'checkMaxPages') {
        console.log('Modo: Solo obtener número máximo de páginas');
        try {
            const maxPages = await getMaxPages();
            return res.status(200).json({ 
                success: true, 
                maxPages: maxPages 
            });
        } catch (err) {
            console.error('Error obteniendo maxPages:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message 
            });
        }
    }
    
    // Modo normal de scraping
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