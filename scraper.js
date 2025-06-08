const { chromium } = require('playwright');

const launchOptions = {
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
};

async function getMaxPages() {
    let browser;
    console.log('getMaxPages: Iniciando navegador efímero...');
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
        
        const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;
        await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

        const totalPagesInfoSelector = '.p-container-paginator p';
        await page.waitForSelector(totalPagesInfoSelector, { state: 'attached', timeout: 20000 });

        const fullPaginationText = await page.$eval(totalPagesInfoSelector, el => el.textContent);
        const match = fullPaginationText.match(/de (\d+)/);

        if (match && match[1]) {
            const parsedTotalPages = parseInt(match[1]);
            if (!isNaN(parsedTotalPages) && parsedTotalPages > 0) return parsedTotalPages;
        }
        return 175;
    } catch (err) {
        console.warn(`Error en getMaxPages: ${err.message}. Usando fallback.`);
        return 175;
    } finally {
        if (browser) {
            await browser.close();
            console.log('getMaxPages: Navegador efímero cerrado.');
        }
    }
}

async function scrapeRemax(startPage = 0, endPage) {
    let browser;
    console.log(`scrapeRemax: Iniciando navegador efímero para lote ${startPage}-${endPage}...`);
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
        
        let allProperties = [];
        for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
            
            // ✅ EL TRY...CATCH AHORA ENVUELVE CADA PÁGINA INDIVIDUALMENTE
            try {
                console.log(`Procesando página: ${currentPage}`);
                const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
                
                console.log(`  -> Esperando a que el contenedor de propiedades aparezca...`);
                const propertyListSelector = '#card-map';
                await page.waitForSelector(propertyListSelector, { state: 'visible', timeout: 30000 });
                console.log(`  -> ✅ Contenedor encontrado. Extrayendo datos...`);

                const pageProperties = await page.evaluate(() => {
                    const properties = [];
                    document.querySelectorAll('qr-card-property').forEach(card => {
                        const titleElement = card.querySelector('.card__description');
                        const priceElement = card.querySelector('.card__price-and-expenses');
                        const addressElement = card.querySelector('.card__address');
                        const brokersElement = card.querySelector('.card__brokers');
                        const contactPersonElement = card.querySelector('.contact-person__info--name');
                        const officeElement = card.querySelector('.contact-person__info--office');
                        const dimensionsLandElement = card.querySelector('[data-info="dimensionLand"] p');
                        const m2TotalElement = card.querySelector('.card__feature--item.feature--m2total');
                        const m2CoverElement = card.querySelector('.card__feature--item.feature--m2cover');
                        const ambientesElement = card.querySelector('.card__feature--item.feature--ambientes');
                        const bathroomsElement = card.querySelector('.card__feature--item.feature--bathroom');
                        const urlElement = card.querySelector('.card-remax__href');
                        if (titleElement && urlElement) {
                            properties.push({
                                title: titleElement.textContent.trim(),
                                price: priceElement ? priceElement.textContent.trim() : 'No disponible',
                                address: addressElement ? addressElement.textContent.trim() : 'No disponible',
                                brokers: brokersElement ? brokersElement.textContent.trim() : 'No disponible',
                                contactPerson: contactPersonElement ? contactPersonElement.textContent.trim() : 'No disponible',
                                office: officeElement ? officeElement.textContent.trim() : 'No disponible',
                                dimensionsLand: dimensionsLandElement ? dimensionsLandElement.textContent.trim() : 'No disponible',
                                m2Total: m2TotalElement ? m2TotalElement.textContent.trim() : 'No disponible',
                                m2Cover: m2CoverElement ? m2CoverElement.textContent.trim() : 'No disponible',
                                ambientes: ambientesElement ? ambientesElement.textContent.trim() : 'No disponible',
                                baños: bathroomsElement ? bathroomsElement.textContent.trim() : 'No disponible',
                                url: urlElement.href,
                            });
                        }
                    });
                    return properties;
                });

                if (pageProperties.length === 0) {
                    console.log(`  -> No se encontraron propiedades en la página ${currentPage}. Finalizando el lote.`);
                    break; 
                }
                
                console.log(`  -> Se encontraron ${pageProperties.length} propiedades.`);
                allProperties = allProperties.concat(pageProperties);

            } catch (pageError) {
                // Si una página falla, lo registramos y continuamos con la siguiente
                console.warn(`⚠️ Error al procesar la página ${currentPage}: ${pageError.message}. Continuando con la siguiente...`);
                continue;
            }
        }
        return allProperties;
    } catch (error) {
        // Este catch ahora solo se activará si falla el inicio del navegador
        console.error(`Error fatal en scrapeRemax para lote ${startPage}-${endPage}:`, error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`scrapeRemax: Navegador efímero para lote ${startPage}-${endPage} cerrado.`);
        }
    }
}

module.exports = { getMaxPages, scrapeRemax };