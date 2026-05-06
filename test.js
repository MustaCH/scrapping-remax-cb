const { scrapeRemax } = require("./scraper");

async function runTest() {
    const operationId = parseInt(process.argv[2]) || 1;
    console.log(`Iniciando smoke test (operationId=${operationId})...`);
    const properties = await scrapeRemax(0, 0, operationId);
    console.log(`\nPropiedades encontradas: ${properties.length}`);
    if (properties.length > 0) {
        console.log("\nPrimera propiedad:");
        console.log(JSON.stringify(properties[0], null, 2));
    }
}

runTest();
