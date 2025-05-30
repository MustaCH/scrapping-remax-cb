const { chromium } = require('playwright'); 

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
                '--disable-gpu',
                '--single-process' 
            ] }); 

        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        });

        let maxPages = endPage; 
        if (!endPage) { 
            console.log('Intentando determinar el número total de páginas...');
            const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;
            await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

           
            const totalPagesInfoSelector = '.p-container-paginator p'; 
            

            try {
                await page.waitForSelector(totalPagesInfoSelector, { state: 'attached', timeout: 15000 });
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

        for (let currentPage = pageNumber; currentPage <= maxPages; currentPage++) {
            console.log(`Scraping page: ${currentPage}`);
            const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 100000 }); 

            const propertyListSelector = '#card-map'; 
            try {
                await page.waitForSelector(propertyListSelector, { state: 'visible', timeout: 30000 });
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

            await page.waitForTimeout(1000);
        }

    } catch (error) {
        console.error('Error durante el scraping:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
    return allProperties;
}

module.exports = scrapeRemax;