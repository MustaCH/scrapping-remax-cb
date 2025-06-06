const express = require('express');
const scraper = require('./scraper');

const app = express();
const port = process.env.PORT || 3000;
let browserInstance; // Variable para almacenar la instancia del navegador

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

app.get('/api/scrape', async (req, res) => {
    // Verificar si el navegador está listo
    if (!browserInstance) {
        console.error('El servicio del navegador no está listo.');
        return res.status(503).json({
            success: false,
            error: 'Servicio no disponible. El navegador se está iniciando, por favor intente de nuevo en un momento.'
        });
    }

    const mode = req.query.mode;

    // --- MODO: Obtener el número máximo de páginas ---
    if (mode === 'checkMaxPages') {
        console.log('Modo: Obteniendo número máximo de páginas...');
        try {
            const maxPages = await scraper.getMaxPages(browserInstance);
            return res.status(200).json({
                success: true,
                maxPages: maxPages
            });
        } catch (err) {
            console.error('Error obteniendo maxPages:', err);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }

    // --- MODO: Scraping normal por lotes ---
    const startPage = parseInt(req.query.startPage) || 0;
    const endPageQuery = req.query.endPage;

    if (typeof endPageQuery === 'undefined') {
        return res.status(400).json({ success: false, error: 'El parámetro endPage es requerido.' });
    }
    const endPage = parseInt(endPageQuery);

    console.log(`Iniciando scraping desde página ${startPage} hasta página ${endPage}`);

    try {
        const properties = await scraper.scrapeRemax(browserInstance, startPage, endPage);
        return res.status(200).json({ success: true, data: properties });
    } catch (err) {
        console.error('Error en el scraping:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});


// Función para iniciar el servidor y el navegador
async function startServer() {
    browserInstance = await scraper.initializeBrowser();

    if (browserInstance) {
        app.listen(port, () => {
            console.log(`🚀 Servidor escuchando en el puerto ${port}`);
        });
    } else {
        console.error('❌ No se pudo iniciar el servidor porque el navegador no se pudo inicializar.');
        process.exit(1); // Detiene la aplicación si el navegador falla
    }
}

startServer();