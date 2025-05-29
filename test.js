const scrapeRemax = require('./scraper');

async function runTest() {
    console.log('Iniciando prueba de scraping...');
    const properties = await scrapeRemax(1); 
    console.log('Propiedades encontradas:', properties.length);
    console.log(properties);
}

runTest();