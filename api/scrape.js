const scrapeRemax = require('../scraper'); 

module.exports = async (req, res) => {
    // Configurar headers CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const startPage = parseInt(req.query.startPage) || 0; 
    const endPage = parseInt(req.query.endPage) || 11; 

    const limitedEndPage = Math.min(endPage, 50); 

    try {
        const properties = await scrapeRemax(startPage, limitedEndPage);

        res.status(200).json(properties);
    } catch (error) {
        console.error('Error en la función serverless:', error);
        res.status(500).json({ 
            error: 'Error al scrapear propiedades', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
    }
};