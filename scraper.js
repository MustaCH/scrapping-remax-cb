const { chromium } = require('playwright-chromium');

async function scrapeRemax(pageNumber = 0, endPage) {
    let allProperties = [];
    let browser;

    try {
        browser = await chromium.launch({ 
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }); 

        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        });

        let maxPages = endPage; 
        if (!endPage) { 
            console.log('Intentando determinar el número total de páginas...');
            const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;
            await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            const totalPagesInfoSelector = '.p-container-paginator p'; 

            try {
                await page.waitForSelector(totalPagesInfoSelector, { state: 'attached', timeout: 10000 });
                const fullPaginationText = await page.$eval(totalPagesInfoSelector, el => el.textContent);
                
                const match = fullPaginationText.match(/de (\d+)/);
                
                if (match && match[1]) {
                    const parsedTotalPages = parseInt(match[1]);
                    if (!isNaN(parsedTotalPages) && parsedTotalPages > 0) {
                        maxPages = parsedTotalPages;
                        console.log(`Número total de páginas detectado: ${maxPages}`);
                    } else {
                        console.warn('No se pudo parsear el número total de páginas del texto. Usando un límite por defecto.');
                        maxPages = 175;
                    }
                } else {
                    console.warn('El formato del texto de paginación no coincide. Usando un límite por defecto.');
                    maxPages = 175; 
                }

            } catch (err) {
                console.warn(`No se encontró el selector de información de paginación o hubo un error: ${err.message}. Usando un límite por defecto.`);
                maxPages = 175;
            }
        }

        // Limitar páginas para evitar timeout en Vercel
        const maxPagesToScrape = Math.min(maxPages, pageNumber + 5); // Solo 5 páginas por request

        for (let currentPage = pageNumber; currentPage <= maxPagesToScrape; currentPage++) {
            console.log(`Scraping page: ${currentPage}`);
            const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); 

            const propertyListSelector = '#card-map'; 
            try {
                await page.waitForSelector(propertyListSelector, { state: 'visible', timeout: 15000 });
            } catch (error) {
                console.warn(`No se encontró el selector de lista de propiedades en la página ${currentPage}. Es posible que no haya más propiedades o que el selector sea incorrecto.`, error.message);
                break; 
            }

            const pageProperties = await page.evaluate(() => {
                const properties = [];
                document.querySelectorAll('qr-card-property').forEach(card => {
                    const titleElement = card.querySelector('.card__description-and-brokers'); 
                    const priceElement = card.querySelector('.card__price-and-expenses');
                    const featureElement = card.querySelector('.card__feature');
                    const urlElement = card.querySelector('.card-remax__href'); 
                    if (titleElement && urlElement) {
                       
                        properties.push({
                            title: titleElement.textContent.trim(),
                            price: priceElement.textContent.trim() || 'No disponible',
                            features: featureElement.textContent.trim() || 'No disponible',
                            url: urlElement.href,
                        });
                    }
                });
                return properties;
            });

            if (pageProperties.length === 0) {
                console.log(`No se encontraron propiedades en la página ${currentPage}. Fin del scraping.`);
                break; 
            }

            allProperties = allProperties.concat(pageProperties);

            await page.waitForTimeout(500); // Reducir tiempo de espera
        }

    } catch (error) {
        console.error('Error durante el scraping:', error);
        throw error; // Re-lanzar el error para que Vercel lo capture
    } finally {
        if (browser) {
            await browser.close();
        }
    }
    return allProperties;
}

// Función handler para Vercel
module.exports = async function handler(req, res) {
    try {
        // Configurar headers CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        // Obtener parámetros de la query string o body
        const { pageNumber = 0, endPage, startPage } = req.method === 'GET' ? req.query : req.body;
        
        // Usar startPage si está disponible, sino pageNumber
        const initialPage = startPage ? parseInt(startPage) : parseInt(pageNumber);
        
        console.log(`Iniciando scraping desde página ${initialPage}${endPage ? ` hasta página ${endPage}` : ''}`);
        
        const properties = await scrapeRemax(
            initialPage || 0, 
            endPage ? parseInt(endPage) : undefined
        );

        res.status(200).json({
            success: true,
            data: properties,
            count: properties.length,
            startPage: initialPage || 0,
            endPage: endPage ? parseInt(endPage) : undefined
        });

    } catch (error) {
        console.error('Error en el handler:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};