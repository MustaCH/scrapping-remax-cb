const { chromium } = require('playwright');

async function scrapeRemax(startPage = 0, endPage = 10) {
    let allProperties = [];

    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
        const browser = await chromium.launch({
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
            ]
        });

        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        });

        const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::&landingPath=&filterCount=0&viewMode=mapViewMode`;

        console.log(`Scraping page: ${currentPage}`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (err) {
            console.warn(`Fallo al cargar página ${currentPage}: ${err.message}`);
            await browser.close();
            continue;
        }

        const propertyListSelector = '#card-map';
        try {
            await page.waitForSelector(propertyListSelector, { state: 'visible', timeout: 20000 });
        } catch (err) {
            console.warn(`No se encontró el selector en la página ${currentPage}: ${err.message}`);
            await browser.close();
            continue;
        }

        try {
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
                            price: priceElement?.textContent.trim() || 'No disponible',
                            features: featureElement?.textContent.trim() || 'No disponible',
                            url: urlElement.href,
                        });
                    }
                });
                return properties;
            });

            if (pageProperties.length === 0) {
                console.log(`Página ${currentPage} vacía. Fin de scraping anticipado.`);
                await browser.close();
                break;
            }

            allProperties = allProperties.concat(pageProperties);
        } catch (err) {
            console.error(`Error al extraer propiedades en página ${currentPage}: ${err.message}`);
        }

        await browser.close();
        await new Promise(resolve => setTimeout(resolve, 1000)); // anti-ban, delay suave
    }

    return allProperties;
}

module.exports = scrapeRemax;
