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

app.get('/api/scrape', async (req, res) => {
    const { startPage, endPage, mode } = req.query;

    // 🎯 MODO SOLO CALCULAR CANTIDAD DE PÁGINAS
    if (mode === 'checkMaxPages') {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        try {
            const urlPrimeraPagina = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;

            await page.goto(urlPrimeraPagina, { waitUntil: 'domcontentloaded', timeout: 30000 });

            const selector = '.p-container-paginator p';
            await page.waitForSelector(selector, { timeout: 10000 });

            const fullText = await page.$eval(selector, el => el.textContent);
            const match = fullText.match(/de (\d+)/);
            const totalPages = match ? parseInt(match[1]) : 200;

            await browser.close();
            return res.status(200).json({ maxPages: totalPages });

        } catch (error) {
            await browser.close();
            console.error('Error al obtener número de páginas:', error);
            return res.status(500).json({
                error: 'No se pudo determinar el total de páginas',
                details: error.message
            });
        }
    }

    // 🧹 MODO NORMAL: SCRAPING POR RANGO
    const parsedStartPage = parseInt(startPage) || 0;
    const parsedEndPage = parseInt(endPage) || 10;
    const MAX_PAGES_PER_REQUEST = 50;
    const limitedEndPage = Math.min(parsedEndPage, parsedStartPage + MAX_PAGES_PER_REQUEST - 1);

    console.log(`Iniciando scraping desde página ${parsedStartPage} hasta página ${limitedEndPage}`);

    try {
        const properties = await scrapeRemax(parsedStartPage, limitedEndPage);
        return res.status(200).json({ success: true, data: properties });
    } catch (err) {
        console.error('Scraping error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});