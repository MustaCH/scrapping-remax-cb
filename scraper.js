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

// Función mejorada para esperar que la página cargue completamente
const waitForPageLoad = async (page, expectedCount = null) => {
    console.log('  -> Esperando a que la página se cargue completamente...');
    
    // Primero esperamos a que aparezca al menos un elemento
    try {
        await page.waitForSelector('qr-card-property, .no-results, .empty-state', { 
            timeout: 30000 
        });
    } catch (e) {
        console.log('  -> ⚠️ Timeout esperando elementos de propiedades. Puede ser una página vacía.');
        return false;
    }

    // Esperamos a que no haya cambios en el conteo durante 3 segundos
    let stableCount = 0;
    let lastCount = 0;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
        await page.waitForTimeout(1000); // Esperar 1 segundo
        const currentCount = await page.locator('qr-card-property').count();
        
        if (currentCount === lastCount) {
            stableCount++;
            if (stableCount >= 3) { // 3 segundos de estabilidad
                console.log(`  -> ✅ Página estable con ${currentCount} propiedades.`);
                return currentCount > 0;
            }
        } else {
            stableCount = 0;
            lastCount = currentCount;
            console.log(`  -> Conteo actual: ${currentCount} propiedades...`);
        }
        
        attempts++;
    }
    
    console.log(`  -> ⚠️ Timeout esperando estabilidad. Conteo final: ${lastCount}`);
    return lastCount > 0;
};

async function getMaxPages() {
    let browser;
    console.log('getMaxPages: Iniciando navegador efímero...');
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
        
        const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;
        await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

        // Esperamos que la página cargue
        await waitForPageLoad(page);

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
                const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
                
                // Usamos la función mejorada de espera
                const hasContent = await waitForPageLoad(page);
                
                if (!hasContent) {
                    console.log(`  -> Página ${currentPage} parece estar vacía. Finalizando el lote.`);
                    break;
                }
                
                console.log(`  -> Extrayendo datos del script ng-state...`);
                
                // Agregamos un pequeño delay adicional antes de extraer ng-state
                await page.waitForTimeout(2000);
                
                let apiData;
                try {
                    apiData = await extractNgStateData(page);
                } catch (ngStateError) {
                    console.warn(`  -> ⚠️ Error extrayendo ng-state en página ${currentPage}: ${ngStateError.message}`);
                    // Intentamos una vez más después de esperar
                    await page.waitForTimeout(3000);
                    try {
                        apiData = await extractNgStateData(page);
                    } catch (retryError) {
                        console.warn(`  -> ⚠️ Error en segundo intento ng-state página ${currentPage}. Saltando...`);
                        continue;
                    }
                }
                
                const propertiesData = apiData.data;

                if (!propertiesData || propertiesData.length === 0) {
                    console.log(`  -> No se encontraron propiedades en la página ${currentPage}. Finalizando el lote.`);
                    break; 
                }
                
                // Validamos que el conteo DOM coincida aproximadamente con los datos JSON
                const domCount = await page.locator('qr-card-property').count();
                console.log(`  -> Validación: DOM=${domCount} propiedades, JSON=${propertiesData.length} propiedades`);
                
                if (Math.abs(domCount - propertiesData.length) > 5) {
                    console.warn(`  -> ⚠️ Discrepancia significativa entre DOM y JSON. Puede indicar carga incompleta.`);
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
                    }
                });

                console.log(`  -> Se encontraron ${pageProperties.length} propiedades.`);
                allProperties = allProperties.concat(pageProperties);

                // Pequeña pausa entre páginas para ser más amigable con el servidor
                if (currentPage < endPage) {
                    await page.waitForTimeout(1000);
                }

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