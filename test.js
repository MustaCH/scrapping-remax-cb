const scrapeRemax = require('./scraper');

async function runTest() {
    console.log('Iniciando prueba de scraping...');
    const properties = await scrapeRemax(1); // Scrapear las páginas 1 y 2 para probar
    console.log('Propiedades encontradas:', properties.length);
    console.log(properties);
}

runTest();