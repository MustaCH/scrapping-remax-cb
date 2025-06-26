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

// Función SIMPLIFICADA para extraer ng-state
const extractNgStateData = async (page) => {
    const ngStateSelector = 'script#ng-state';
    
    // Esperar a que el selector exista
    await page.waitForSelector(ngStateSelector, { timeout: 30000 });
    
    // Dar tiempo para que se actualice el contenido
    await page.waitForTimeout(3000);
    
    const ngStateContent = await page.$eval(ngStateSelector, el => el.textContent);
    const jsonData = JSON.parse(ngStateContent);
    
    // Buscamos la clave que contiene los datos
    const mainDataKey = Object.keys(jsonData).find(key => jsonData[key]?.b?.data?.data);
    if (!mainDataKey) {
        throw new Error('No se encontró la clave de datos principal en ng-state');
    }
    
    return jsonData[mainDataKey].b.data;
};

// Función simplificada para esperar que cargue la página
const waitForPageLoad = async (page) => {
    console.log('  -> Esperando carga de la página...');
    
    // Estrategia 1: Esperar a que aparezcan propiedades
    try {
        await page.waitForSelector('qr-card-property', { timeout: 20000 });
        console.log('  -> ✅ Propiedades detectadas en DOM');
    } catch (e) {
        console.log('  -> ⚠️ No se detectaron propiedades en DOM, puede ser página vacía');
        return false;
    }
    
    // Estrategia 2: Esperar un poco más para estabilidad
    await page.waitForTimeout(5000);
    
    const count = await page.locator('qr-card-property').count();
    console.log(`  -> Total propiedades DOM: ${count}`);
    
    return count > 0;
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
        await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

        await waitForPageLoad(page);
        const data = await extractNgStateData(page);

        if (data && data.totalPages) {
            console.log(`Total de páginas encontrado: ${data.totalPages}`);
            return data.totalPages;
        }

        console.warn('No se encontró totalPages, usando fallback.');
        return 175;

    } catch (err) {
        console.warn(`Error en getMaxPages: ${err.message}. Usando fallback.`);
        return 175;
    } finally {
        if (browser) {
            await browser.close();
            console.log('getMaxPages: Navegador cerrado.');
        }
    }
}

async function scrapeRemax(startPage = 0, endPage) {
    let browser;
    console.log(`scrapeRemax: Procesando páginas ${startPage} a ${endPage}...`);
    
    try {
        browser = await chromium.launch(launchOptions);
        const page = await browser.newPage({ 
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' 
        });
        
        let allProperties = [];
        
        for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
            try {
                console.log(`Procesando página: ${currentPage}`);
                const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;
                
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
                
                const hasContent = await waitForPageLoad(page);
                if (!hasContent) {
                    console.log(`  -> Página ${currentPage} vacía. Finalizando lote.`);
                    break;
                }
                
                // Contar propiedades DOM
                const domCount = await page.locator('qr-card-property').count();
                
                console.log(`  -> Extrayendo ng-state...`);
                let apiData;
                
                try {
                    apiData = await extractNgStateData(page);
                } catch (ngError) {
                    console.warn(`  -> Error extrayendo ng-state: ${ngError.message}`);
                    console.log(`  -> Reintentando una vez más...`);
                    
                    // UN SOLO reintento con más tiempo
                    await page.waitForTimeout(8000);
                    try {
                        apiData = await extractNgStateData(page);
                    } catch (retryError) {
                        console.error(`  -> Falló completamente página ${currentPage}. Continuando...`);
                        continue;
                    }
                }
                
                const propertiesData = apiData.data;
                
                if (!propertiesData || propertiesData.length === 0) {
                    console.log(`  -> Sin datos en página ${currentPage}. Finalizando lote.`);
                    break;
                }
                
                console.log(`  -> DOM: ${domCount} propiedades, JSON: ${propertiesData.length} propiedades`);
                
                // Si hay una gran discrepancia, pero tenemos datos JSON, los usamos
                if (domCount > 10 && propertiesData.length < 5) {
                    console.warn(`  -> ⚠️ Gran discrepancia detectada. Puede haber un problema de timing.`);
                    // Pero continuamos con los datos que tenemos
                }
                
                // Mapear datos a estructura final
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
                    }
                });

                console.log(`  -> ✅ Extraídas ${pageProperties.length} propiedades`);
                allProperties = allProperties.concat(pageProperties);
                
                // Pausa entre páginas
                await page.waitForTimeout(2000);

            } catch (pageError) {
                console.error(`❌ Error en página ${currentPage}: ${pageError.message}`);
                // Continuamos con la siguiente página
                continue;
            }
        }
        
        console.log(`✅ Lote completado: ${allProperties.length} propiedades totales`);
        return allProperties;
        
    } catch (error) {
        console.error(`Error fatal en scrapeRemax:`, error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`scrapeRemax: Navegador cerrado.`);
        }
    }
}

module.exports = { getMaxPages, scrapeRemax };