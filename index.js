// index.js (Este es el archivo principal de tu servidor Express)
const express = require('express');
const scrapeRemax = require('./scraper'); // Importa tu scraper principal

const app = express();
const port = process.env.PORT || 3000; // Railway inyectará el puerto en process.env.PORT

// Middleware para parsear JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware CORS (importante para que n8n pueda llamar a tu API)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Tu API endpoint para scraping
// Se accederá a él como: https://tu-dominio-railway.app/api/scrape
app.get('/api/scrape', async (req, res) => {
    try {
        const { startPage, endPage } = req.query; 

        // Asegurar que startPage sea al menos 1
        const initialPage = Math.max(1, parseInt(startPage) || 1); 
        let finalEndPage = endPage ? parseInt(endPage) : undefined;

        const MAX_PAGES_PER_REQUEST = 50; // Límite de páginas por petición para evitar timeouts
        if (finalEndPage && (finalEndPage - initialPage + 1 > MAX_PAGES_PER_REQUEST)) {
            console.warn(`Petición excede el límite de ${MAX_PAGES_PER_REQUEST} páginas. Ajustando endPage.`);
            finalEndPage = initialPage + MAX_PAGES_PER_REQUEST - 1;
        }

        console.log(`Iniciando scraping desde página <span class="math-inline">\{initialPage\}</span>${finalEndPage ? `hasta página {finalEndPage}` : ''}`);

        const properties = await scrapeRemax(
            initialPage, 
            finalEndPage 
        );

        res.status(200).json({
            success: true,
            data: properties,
            count: properties.length,
            startPage: initialPage,
            endPage: finalEndPage 
        });

    } catch (error) {
        console.error('Error en el endpoint /api/scrape:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Iniciar el servidor Express
app.listen(port, () => {
    console.log(`Scraper API listening on port ${port}`);
});