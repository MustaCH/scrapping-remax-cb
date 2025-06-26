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

// Función auxiliar para extraer datos de la respuesta de la API
async function extractDataFromApiResponse(page, url) {
    // Le decimos a Playwright que espere por una respuesta de la API específica
    const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/listings/buy') && response.status() === 200,
        { timeout: 30000 } // Timeout de 30 segundos
    );

    // Navegamos a la URL para disparar la llamada a la API
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Esperamos a que la promesa de la respuesta se resuelva
    const response = await responsePromise;
    
    // Convertimos el cuerpo de la respuesta a JSON
    return response.json();
}

async function getMaxPages() {
    let browser;
    console.log('getMaxPages: Iniciando navegador efímero...');
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
        
        const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;
        
        console.log('getMaxPages: Interceptando API para obtener el total de páginas...');
        const apiData = await extractDataFromApiResponse(page, firstPageUrl);

        if (apiData && apiData.totalPages) {
            console.log(`Total de páginas encontrado en API: ${apiData.totalPages}`);
            return apiData.totalPages;
        }

        console.warn('No se pudo encontrar totalPages en la API, usando fallback.');
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
    console.log(`scrapeRemax: Iniciando navegador efímero para lote de páginas ${startPage} a ${endPage}...`);
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
        
        let allProperties = [];
        for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
            
            try {
                console.log(`Procesando página: ${currentPage}`);
                const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;

                console.log(`  -> Navegando e interceptando la respuesta de la API...`);
                const apiData = await extractDataFromApiResponse(page, url);
                
                const propertiesData = apiData.data;

                if (!propertiesData || propertiesData.length === 0) {
                    console.log(`  -> No se encontraron propiedades en la API para la página ${currentPage}. Finalizando el lote.`);
                    break; 
                }
                
                const pageProperties = propertiesData.map(prop => {
                    const price = prop.price ?? 0;
                    const currency = prop.currency?.value ?? '';
                    const formattedPrice = (price > 0 && currency) ? `${price} ${currency}` : 'Consultar';
                    const tags = prop.features?.map(f => f.name).join(', ') ?? '';

                    return {
                        title: prop.title ?? 'Sin título',
                        price: formattedPrice,
                        address: prop.displayAddress ?? 'No disponible',
                        locality: prop.geoLabel ?? 'No disponible',
                        latitude: prop.location?.coordinates?.[1] ?? null,
                        longitude: prop.location?.coordinates?.[0] ?? null,
                        brokers: prop.listBroker?.map(b => `${b.name} ${b.license}`).join(', ') ?? 'No disponible',
                        contactPerson: prop.associate?.name ?? 'No disponible',
                        office: prop.associate?.officeName ?? 'No disponible',
                        dimensionsLand: `${prop.dimensionLand ?? 0} m²`,
                        m2Total: `${prop.dimensionTotalBuilt ?? 0} m²`,
                        m2Cover: `${prop.dimensionCovered ?? 0} m²`,
                        ambientes: prop.totalRooms > 0 ? `${prop.totalRooms} ambientes` : 'No disponible',
                        baños: prop.bathrooms > 0 ? `${prop.bathrooms} baños` : 'No disponible',
                        url: prop.slug ? `https://www.remax.com.ar/listings/${prop.slug}` : '#',
                        internalId: prop.internalId ?? null
                    };
                });

                console.log(`  -> Se encontraron ${pageProperties.length} propiedades en la API.`);
                allProperties = allProperties.concat(pageProperties);

            } catch (pageError) {
                console.warn(`⚠️ Error al procesar la página ${currentPage}: ${pageError.message}. Continuando con la siguiente...`);
                continue;
            }
        }
        return allProperties;
    } catch (error) {
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