const express = require('express');
const scraper = require('./scraper');

const app = express();
const port = process.env.PORT || 3000;
let browserInstance; // Mantenemos la instancia cacheada en memoria

// Middleware para parsear JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

/**
 * Función resiliente que obtiene una instancia de navegador válida.
 * Si la instancia cacheada existe y está conectada, la reutiliza.
 * Si no, crea una nueva.
 */
async function getBrowserInstance() {
    if (browserInstance && browserInstance.isConnected()) {
        console.log('✅ Reutilizando instancia de navegador existente.');
        return browserInstance;
    }
    
    console.log('⚠️ No hay instancia de navegador válida o está desconectada. Creando una nueva...');
    browserInstance = await scraper.initializeBrowser();
    return browserInstance;
}

app.get('/api/scrape', async (req, res) => {
    let browser;
    try {
        // Paso 1: Obtener una instancia de navegador garantizada
        browser = await getBrowserInstance();

        if (!browser) {
            throw new Error('No se pudo inicializar el navegador.');
        }

        // Paso 2: Ejecutar la lógica de la petición
        const mode = req.query.mode;

        if (mode === 'checkMaxPages') {
            console.log('Modo: Obteniendo número máximo de páginas...');
            const maxPages = await scraper.getMaxPages(browser);
            return res.status(200).json({ success: true, maxPages: maxPages });
        }

        const startPage = parseInt(req.query.startPage) || 0;
        const endPageQuery = req.query.endPage;

        if (typeof endPageQuery === 'undefined') {
            return res.status(400).json({ success: false, error: 'El parámetro endPage es requerido.' });
        }
        const endPage = parseInt(endPageQuery);

        console.log(`Iniciando scraping desde página ${startPage} hasta página ${endPage}`);
        const properties = await scraper.scrapeRemax(browser, startPage, endPage);
        return res.status(200).json({ success: true, data: properties });

    } catch (err) {
        console.error('Error crítico en la ruta /api/scrape:', err);
        // Si el error es por cierre del navegador, intentamos limpiar la instancia "mala"
        if (err.message.includes('closed')) {
            browserInstance = null;
        }
        return res.status(500).json({ success: false, error: err.message });
    }
});


// El servidor arranca inmediatamente. El navegador se creará en la primera petición.
app.listen(port, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${port}.`);
    console.log('El navegador se iniciará bajo demanda en la primera petición.');
});