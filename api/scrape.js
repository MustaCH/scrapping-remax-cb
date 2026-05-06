const { scrapeRemax } = require('../scraper');

module.exports = async (req, res) => {
    const startPage = parseInt(req.query.startPage) || 0;
    const endPage = parseInt(req.query.endPage) || 11;
    const operationId = parseInt(req.query.operationId) || 1;

    const limitedEndPage = Math.min(endPage, 50);

    try {
        const properties = await scrapeRemax(startPage, limitedEndPage, operationId);
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
