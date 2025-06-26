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
        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        });

        const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;

        const responsePromise = page.waitForResponse(r =>
            r.url().includes('/listings?') && r.status() === 200
        );

        await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const response = await responsePromise;
        const json = await response.json();

        if (json.totalPages) {
            console.log(`✅ Total de páginas detectadas: ${json.totalPages}`);
            return json.totalPages;
        }

        console.warn('⚠️ No se encontró totalPages en la respuesta. Usando fallback.');
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
    console.log(`scrapeRemax: Iniciando navegador efímero para páginas ${startPage} a ${endPage}...`);
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        });

        let allProperties = [];

        for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
            try {
                const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;
                console.log(`Procesando página ${currentPage}...`);

                const responsePromise = page.waitForResponse(r =>
                    r.url().includes('/listings?') && r.status() === 200
                );

                await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
                const response = await responsePromise;
                const json = await response.json();
                const propertiesData = json.data;

                if (!propertiesData || propertiesData.length === 0) {
                    console.log(`  -> No se encontraron propiedades en la página ${currentPage}. Posible fin de resultados.`);
                    break;
                }

                const pageProperties = propertiesData.map(prop => {
                    const price = prop.price ?? 0;
                    const currency = prop.currency?.value ?? '';
                    const formattedPrice = (price > 0 && currency) ? `${price} ${currency}` : 'Consultar';

                    return {
                        title: prop.title,
                        price: formattedPrice,
                        address: prop.displayAddress,
                        locality: prop.geoLabel,
                        latitude: prop.location?.coordinates?.[1] ?? 'No disponible',
                        longitude: prop.location?.coordinates?.[0] ?? 'No disponible',
                        brokers: prop.listBroker?.map(b => `${b.name} ${b.license}`).join(', ') ?? 'No disponible',
                        contactPerson: prop.associate?.name ?? 'No disponible',
                        office: prop.associate?.officeName ?? 'No disponible',
                        dimensionsLand: `${prop.dimensionLand} m²`,
                        m2Total: `${prop.dimensionTotalBuilt} m²`,
                        m2Cover: `${prop.dimensionCovered} m²`,
                        ambientes: prop.totalRooms > 0 ? `${prop.totalRooms} ambientes` : 'No disponible',
                        baños: prop.bathrooms > 0 ? `${prop.bathrooms} baños` : 'No disponible',
                        url: `https://www.remax.com.ar/listings/${prop.slug}`
                    };
                });

                console.log(`  -> ✅ Se encontraron ${pageProperties.length} propiedades.`);
                allProperties = allProperties.concat(pageProperties);

            } catch (error) {
                console.warn(`⚠️ Error al procesar la página ${currentPage}: ${error.message}. Continuando...`);
                continue;
            }
        }

        return allProperties;

    } catch (error) {
        console.error(`❌ Error fatal en scrapeRemax:`, error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`scrapeRemax: Navegador cerrado para lote ${startPage}-${endPage}.`);
        }
    }
}

module.exports = { getMaxPages, scrapeRemax };
