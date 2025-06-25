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

// Función para extraer el JSON del script ng-state
const extractNgStateData = async (page) => {
    const ngStateSelector = 'script#ng-state';
    await page.waitForSelector(ngStateSelector, { state: 'attached', timeout: 30000 });
    const ngStateContent = await page.$eval(ngStateSelector, el => el.textContent);
    
    const jsonData = JSON.parse(ngStateContent);
    // Buscamos la clave que contiene la data principal. Usualmente es la primera.
    const mainDataKey = Object.keys(jsonData).find(key => jsonData[key]?.b?.data?.data);
    if (!mainDataKey) {
        throw new Error('No se encontró la clave de datos principal en ng-state');
    }
    return jsonData[mainDataKey].b.data;
};


async function getMaxPages() {
    let browser;
    console.log('getMaxPages: Iniciando navegador efímero...');
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
        
        const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;
        await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

        // Extraemos los datos del JSON
        const data = await extractNgStateData(page);

        if (data && data.totalPages) {
            console.log(`Total de páginas encontrado en ng-state: ${data.totalPages}`);
            return data.totalPages;
        }

        // Fallback si no se encuentra
        console.warn('No se pudo encontrar totalPages en ng-state, usando fallback.');
        return 175;

    } catch (err) {
        console.warn(`Error en getMaxPages: ${err.message}. Usando fallback.`);
        return 175; // Valor de fallback
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
                // No es necesario el viewMode=mapViewMode, podemos usar la vista de lista normal.
                const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
                
                console.log(`  -> Esperando a que el script ng-state aparezca...`);
                
                // Usamos la función auxiliar para obtener los datos del JSON
                const apiData = await extractNgStateData(page);
                const propertiesData = apiData.data;

                if (!propertiesData || propertiesData.length === 0) {
                    console.log(`  -> No se encontraron propiedades en la página ${currentPage}. Finalizando el lote.`);
                    break; 
                }
                
                // Mapeamos los datos del JSON a la estructura que queremos
                const pageProperties = propertiesData.map(prop => {
                    const price = prop.price ?? 0;
                    const currency = prop.currency?.value ?? ''; // Si prop.currency no existe, currency será ''
                    const formattedPrice = (price > 0 && currency) ? `${price} ${currency}` : 'Consultar';

                    return {
                    title: prop.title,
                    price: formattedPrice,
                    address: prop.displayAddress,
                    locality: prop.geoLabel, 
                    latitude: prop.location.coordinates[1], 
                    longitude: prop.location.coordinates[0], 
                    brokers: prop.listBroker.map(b => `${b.name} ${b.license}`).join(', '),
                    contactPerson: prop.associate.name,
                    office: prop.associate.officeName,
                    dimensionsLand: `${prop.dimensionLand} m²`,
                    m2Total: `${prop.dimensionTotalBuilt} m²`,
                    m2Cover: `${prop.dimensionCovered} m²`,
                    ambientes: prop.totalRooms > 0 ? `${prop.totalRooms} ambientes` : 'No disponible',
                    baños: prop.bathrooms > 0 ? `${prop.bathrooms} baños` : 'No disponible',
                    url: `https://www.remax.com.ar/listings/${prop.slug}`,
                    internalId: prop.internalId
                    }
                });

                console.log(`  -> Se encontraron ${pageProperties.length} propiedades.`);
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