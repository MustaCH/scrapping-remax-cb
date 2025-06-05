const { chromium } = require('playwright');
const scrapeRemax = require('../scraper');

module.exports = async (req, res) => {
    const { mode, startPage, endPage } = req.query;

    // 🎯 MODO SOLO CONTAR PÁGINAS
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
    const parsedEndPage = parseInt(endPage) || 11;
    const limitedEndPage = Math.min(parsedEndPage, parsedStartPage + 49); // máx. 50 páginas por request

    try {
        const properties = await scrapeRemax(parsedStartPage, limitedEndPage);
        return res.status(200).json(properties);
    } catch (error) {
        console.error('Error en la función serverless:', error);
        return res.status(500).json({
            error: 'Error al scrapear propiedades',
            details: error.message
        });
    }
};
