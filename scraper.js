const { chromium } = require('playwright');

/**
 * Inicia y devuelve una única instancia del navegador Chromium.
 */
async function initializeBrowser() {
    console.log('Iniciando instancia del navegador Chromium...');
    try {
        const browser = await chromium.launch({
            // La opción 'headless' se elimina para usar el modo por defecto de Playwright,
            // que es el nuevo modo headless, más robusto.
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--single-process'
            ]
        });
        console.log('✅ Navegador Chromium iniciado correctamente.');
        return browser;
    } catch (error) {
        console.error('❌ Error al iniciar el navegador:', error);
        return null;
    }
}

/**
 * Obtiene el número máximo de páginas de propiedades.
 * Reutiliza la instancia principal del navegador.
 * @param {import('playwright').Browser} browser - La instancia del navegador.
 */
async function getMaxPages(browser) {
    if (!browser) {
        throw new Error('El navegador no está inicializado.');
    }

    const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    });

    console.log('Obteniendo el número total de páginas...');

    try {
        const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;
        await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }); 

        const totalPagesInfoSelector = '.p-container-paginator p';
        await page.waitForSelector(totalPagesInfoSelector, { state: 'attached', timeout: 20000 });

        const fullPaginationText = await page.$eval(totalPagesInfoSelector, el => el.textContent);
        const match = fullPaginationText.match(/de (\d+)/);

        if (match && match[1]) {
            const parsedTotalPages = parseInt(match[1]);
            if (!isNaN(parsedTotalPages) && parsedTotalPages > 0) {
                console.log(`Número total de páginas detectado: ${parsedTotalPages}`);
                return parsedTotalPages;
            }
        }

        console.warn('No se pudo parsear el número total de páginas. Usando fallback: 175.');
        return 175;

    } catch (err) {
        console.warn(`Error obteniendo paginación: ${err.message}. Usando fallback: 175.`);
        return 175;
    } finally {
        try {
            await page.close();
            console.log('Página para obtener maxPages cerrada.');
        } catch (closeError) {
            console.error('Error al cerrar la página de getMaxPages (ignorado):', closeError.message);
        }
    }
}


/**
 * Scrapea un rango de páginas de propiedades.
 * @param {import('playwright').Browser} browser - La instancia del navegador.
 * @param {number} startPage - La página de inicio del scraping.
 * @param {number} endPage - La página final del scraping.
 */
async function scrapeRemax(browser, startPage = 0, endPage) {
    if (!browser) {
        throw new Error('El navegador no está inicializado.');
    }

    let allProperties = [];
    const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    });

    try {
        for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
            console.log(`Scraping página: ${currentPage}`);
            const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

            const propertyListSelector = '#card-map';
            try {
                await page.waitForSelector(propertyListSelector, { state: 'visible', timeout: 30000 });
            } catch (error) {
                console.warn(`No se encontró lista de propiedades en página ${currentPage}. Es posible que no haya más propiedades.`);
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
                            price: priceElement ? priceElement.textContent.trim() : 'No disponible',
                            features: featureElement ? featureElement.textContent.trim() : 'No disponible',
                            url: urlElement.href,
                        });
                    }
                });
                return properties;
            });

            if (pageProperties.length === 0) {
                console.log(`No se encontraron propiedades en la página ${currentPage}. Finalizando este lote.`);
                break;
            }

            allProperties = allProperties.concat(pageProperties);
            await page.waitForTimeout(500);
        }
    } catch (error) {
        console.error(`Error durante el scraping del lote ${startPage}-${endPage}:`, error);
        return allProperties;
    } finally {
        try {
            await page.close();
            console.log(`Página para el lote ${startPage}-${endPage} cerrada.`);
        } catch (closeError) {
            console.error(`Error al cerrar la página del lote ${startPage}-${endPage} (ignorado):`, closeError.message);
        }
    }

    return allProperties;
}

module.exports = { initializeBrowser, getMaxPages, scrapeRemax };