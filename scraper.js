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

// Función mejorada para extraer el JSON del script ng-state
const extractNgStateData = async (page, expectedCount = null) => {
    const ngStateSelector = 'script#ng-state';
    await page.waitForSelector(ngStateSelector, { state: 'attached', timeout: 30000 });
    
    let attempts = 0;
    const maxAttempts = 15; // Aumentamos los intentos
    
    while (attempts < maxAttempts) {
        try {
            const ngStateContent = await page.$eval(ngStateSelector, el => el.textContent);
            const jsonData = JSON.parse(ngStateContent);
            
            // Buscamos la clave que contiene la data principal
            const mainDataKey = Object.keys(jsonData).find(key => jsonData[key]?.b?.data?.data);
            if (!mainDataKey) {
                throw new Error('No se encontró la clave de datos principal en ng-state');
            }
            
            const data = jsonData[mainDataKey].b.data;
            const propertiesCount = data.data ? data.data.length : 0;
            
            // Si tenemos un conteo esperado, validamos que coincida (con margen de error)
            if (expectedCount && expectedCount > 5 && propertiesCount < 3) {
                console.log(`  -> Intento ${attempts + 1}: ng-state tiene ${propertiesCount} propiedades, esperábamos ~${expectedCount}. Esperando más...`);
                
                // Esperamos progresivamente más tiempo
                const waitTime = Math.min(2000 + (attempts * 1000), 8000);
                await page.waitForTimeout(waitTime);
                attempts++;
                continue;
            }
            
            // Si no hay propiedades esperadas, pero el ng-state está vacío, reintentamos
            if (propertiesCount === 0 && attempts < 8) {
                console.log(`  -> Intento ${attempts + 1}: ng-state vacío, esperando ${2000 + attempts * 500}ms...`);
                await page.waitForTimeout(2000 + attempts * 500);
                attempts++;
                continue;
            }
            
            console.log(`  -> ng-state extraído exitosamente con ${propertiesCount} propiedades en intento ${attempts + 1}`);
            return data;
            
        } catch (error) {
            console.log(`  -> Error en intento ${attempts + 1} extrayendo ng-state: ${error.message}`);
            await page.waitForTimeout(1500 + attempts * 500);
            attempts++;
        }
    }
    
    // Último intento desesperado: devolver lo que tengamos
    try {
        const ngStateContent = await page.$eval(ngStateSelector, el => el.textContent);
        const jsonData = JSON.parse(ngStateContent);
        const mainDataKey = Object.keys(jsonData).find(key => jsonData[key]?.b?.data?.data);
        if (mainDataKey) {
            const data = jsonData[mainDataKey].b.data;
            console.warn(`  -> ⚠️ Último intento exitoso: ${data.data ? data.data.length : 0} propiedades`);
            return data;
        }
    } catch (e) {
        console.error(`  -> ❌ Falló completamente la extracción de ng-state`);
    }
    
    throw new Error(`No se pudo extraer ng-state después de ${maxAttempts} intentos`);
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
        const hasContent = await waitForPageLoad(page);
        if (!hasContent) {
            console.warn('No se pudo cargar la primera página. Usando fallback.');
            return 175;
        }

        // Contamos las propiedades DOM para validación
        const domCount = await page.locator('qr-card-property').count();
        console.log(`Propiedades DOM detectadas: ${domCount}`);

        // Extraemos los datos del JSON con validación
        const data = await extractNgStateData(page, domCount);

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
                
                // Contamos propiedades DOM para validación
                const domCount = await page.locator('qr-card-property').count();
                
                let apiData;
                try {
                    // Pasamos el conteo DOM para validación
                    apiData = await extractNgStateData(page, domCount);
                } catch (ngStateError) {
                    console.warn(`  -> ⚠️ Error extrayendo ng-state en página ${currentPage}: ${ngStateError.message}`);
                    
                    // Estrategia alternativa: esperar más tiempo y reintentar
                    console.log(`  -> Esperando más tiempo y reintentando...`);
                    await page.waitForTimeout(5000);
                    
                    // Verificar si el conteo DOM cambió
                    const newDomCount = await page.locator('qr-card-property').count();
                    console.log(`  -> Nuevo conteo DOM: ${newDomCount}`);
                    
                    try {
                        apiData = await extractNgStateData(page, newDomCount);
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
                
                // Validamos los datos extraídos
                console.log(`  -> Validación: DOM=${domCount} propiedades, JSON=${propertiesData.length} propiedades`);
                
                // Si hay gran discrepancia, intentamos estrategias de recuperación
                if (domCount > 5 && propertiesData.length < 3) {
                    console.error(`  -> ❌ Discrepancia crítica: DOM tiene ${domCount} pero JSON solo ${propertiesData.length}`);
                    console.log(`  -> Intentando estrategias de recuperación...`);
                    
                    // Estrategia 1: Recargar la página
                    console.log(`  -> Estrategia 1: Recargando página...`);
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
                    await waitForPageLoad(page);
                    
                    const newDomCount = await page.locator('qr-card-property').count();
                    console.log(`  -> Después de recargar: DOM=${newDomCount} propiedades`);
                    
                    try {
                        apiData = await extractNgStateData(page, newDomCount);
                        propertiesData = apiData.data;
                        console.log(`  -> ✅ Recuperación exitosa: ${propertiesData.length} propiedades`);
                    } catch (reloadError) {
                        console.log(`  -> Estrategia 1 falló: ${reloadError.message}`);
                        
                        // Estrategia 2: Navegar de nuevo a la URL
                        console.log(`  -> Estrategia 2: Navegando nuevamente a la URL...`);
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
                        await waitForPageLoad(page);
                        
                        try {
                            const finalDomCount = await page.locator('qr-card-property').count();
                            apiData = await extractNgStateData(page, finalDomCount);
                            propertiesData = apiData.data;
                            console.log(`  -> ✅ Recuperación exitosa con estrategia 2: ${propertiesData.length} propiedades`);
                        } catch (finalError) {
                            console.error(`  -> ❌ Todas las estrategias fallaron para página ${currentPage}. Usando datos parciales.`);
                            // Continuamos con los datos que tenemos, aunque sean pocos
                        }
                    }
                }
                
                if (Math.abs(domCount - propertiesData.length) > 5) {
                    console.warn(`  -> ⚠️ Discrepancia entre DOM y JSON, pero continuando con los datos disponibles.`);
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