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
        
        const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;
        
        console.log('getMaxPages: Interceptando API para obtener el total de páginas...');
        
        // Configuramos la espera de la respuesta de la API ANTES de navegar
        const responsePromise = page.waitForResponse(
            response => response.url().includes('listings/buy?page=0') && response.status() === 200,
            { timeout: 30000 }
        );

        // Navegamos para disparar la llamada
        await page.goto(firstPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

        const response = await responsePromise;
        const apiData = await response.json();

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
                
                // 1. Empezar a "escuchar" la respuesta de red que nos interesa
                const responsePromise = page.waitForResponse(
                    // La URL debe contener la parte específica de la paginación que buscamos
                    response => response.url().includes(`listings/buy?page=${currentPage}`) && response.status() === 200,
                    { timeout: 30000 } // Espera máxima de 30 segundos
                );

                // 2. Realizar la acción que dispara esa llamada de red
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

                // 3. Esperar a que la promesa de la respuesta se resuelva
                const response = await responsePromise;
                const apiData = await response.json(); // Convertir la respuesta a JSON
                
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
                        internalId: prop.internalId ?? null,
                        description: prop.description ?? '',
                        age: prop.age ?? null,
                        propertyType: prop.propertyType?.value ?? 'No especificado',
                        stage: prop.eStage?.value ?? 'No especificado',
                        operationId: prop.operationId ?? null,
                        tags: tags
                    };
                });

                console.log(`  -> ✅ Se encontraron ${pageProperties.length} propiedades en la API.`);
                allProperties = allProperties.concat(pageProperties);

            } catch (pageError) {
                console.warn(`⚠️ Error al procesar la página ${currentPage}: ${pageError.message}. Puede que sea la última página o que no haya propiedades. Continuando...`);
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