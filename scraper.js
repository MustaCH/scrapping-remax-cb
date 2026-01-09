const { chromium } = require("playwright");

const launchOptions = {
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
    "--single-process",
  ],
};

const CDN_BASE = 'https://d1acdg20u0pmxj.cloudfront.net';
const DEFAULT_IMAGE_SIZE = 'AUTOx860';
const DEFAULT_IMAGE_EXT = 'webp';

function rawToCdnUrl(rawValue, size = DEFAULT_IMAGE_SIZE, ext = DEFAULT_IMAGE_EXT) {
    const normalized = String(rawValue || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length < 3) return null;
    const [root, listingId, photoId] = parts;
    if (root !== 'listings') return null;
    return `${CDN_BASE}/${root}/${listingId}/${size}/${photoId}.${ext}`;
}

function buildListingPhotoUrls(photos, limit = 3) {
    if (!Array.isArray(photos) || photos.length === 0) return [];
    const urls = [];
    for (const photo of photos) {
        const url = rawToCdnUrl(photo?.rawValue);
        if (url && !urls.includes(url)) {
            urls.push(url);
        }
        if (urls.length >= limit) break;
    }
    return urls;
}

// ✅ Función mejorada para extraer propiedades desde ng-state
const extractNgStateData = async (page) => {
  const ngStateSelector = "script#ng-state";
  await page.waitForSelector(ngStateSelector, {
    state: "attached",
    timeout: 30000,
  });
  const ngStateContent = await page.$eval(
    ngStateSelector,
    (el) => el.textContent
  );

  let jsonData;
  try {
    jsonData = JSON.parse(ngStateContent);
  } catch (e) {
    throw new Error("❌ No se pudo parsear ng-state como JSON");
  }

  const allDataEntries = [];

  for (const [key, value] of Object.entries(jsonData)) {
    const list = value?.b?.data?.data;
    if (
      Array.isArray(list) &&
      list.length > 0 &&
      list[0]?.title &&
      list[0]?.slug
    ) {
      allDataEntries.push({
        key,
        data: list,
      });
    }
  }

  if (allDataEntries.length === 0) {
    throw new Error("❌ No se encontraron bloques válidos dentro de ng-state");
  }

  const mainBlock = allDataEntries.reduce((a, b) =>
    b.data.length > a.data.length ? b : a
  );

  console.log(
    `✅ ng-state: usando clave "${mainBlock.key}" con ${mainBlock.data.length} propiedades`
  );

  return mainBlock.data;
};

// 🚀 Obtener número total de páginas desde la clave que contiene ese dato
async function getMaxPages() {
  let browser;
  console.log("getMaxPages: Iniciando navegador efímero...");
  try {
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      // ▼▼▼ MODIFICACIÓN INICIO ▼▼▼
      // Se establece un viewport de móvil para asegurar que el paginador sea visible.
      // El elemento tiene la clase "hide-gt-sm", que lo oculta en pantallas de escritorio.
      // Al simular un dispositivo pequeño, evitamos que ese estilo CSS se aplique.
      viewport: { width: 390, height: 844 },
      // ▲▲▲ MODIFICACIÓN FIN ▲▲▲
    });

    const firstPageUrl = `https://www.remax.com.ar/listings/buy?page=0&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;

    await page.goto(firstPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    const paginatorSelector = ".p-container-paginator p";
    await page.waitForSelector(paginatorSelector, { timeout: 10000 });
    const paginatorText = await page.$eval(
      paginatorSelector,
      (el) => el.innerText
    );
    console.log(`🔍 Texto del paginador: "${paginatorText}"`);

    const match = paginatorText.match(/de\s+(\d+)/i);
    if (match && match[1]) {
      const totalPages = parseInt(match[1], 10);
      console.log(`✅ Total de páginas detectado: ${totalPages}`);
      return totalPages;
    } else {
      console.warn(
        "⚠️ No se pudo extraer el número total de páginas. Usando fallback."
      );
      return 175;
    }
  } catch (err) {
    console.warn(`⚠️ Error en getMaxPages: ${err.message}. Usando fallback.`);
    return 175;
  } finally {
    if (browser) {
      await browser.close();
      console.log("getMaxPages: Navegador efímero cerrado.");
    }
  }
}

// 🔍 Scrapeo robusto de propiedades página por página usando ng-state
async function scrapeRemax(startPage = 0, endPage) {
  let browser;
  console.log(
    `scrapeRemax: Iniciando navegador efímero para páginas ${startPage} a ${endPage}...`
  );
  try {
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });

    let allProperties = [];

    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      try {
        console.log(`🌐 Procesando página ${currentPage}...`);
        const url = `https://www.remax.com.ar/listings/buy?page=${currentPage}&pageSize=24&sort=-createdAt&in:operationId=1&in:eStageId=0,1,2,3,4&locations=in:CB@C%C3%B3rdoba::::::`;

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

        const propertiesData = await extractNgStateData(page);

        if (!propertiesData || propertiesData.length === 0) {
          console.log(`  -> ⚠️ Página vacía. Finalizando.`);
          break;
        }

        const pageProperties = propertiesData
          .filter((prop) => prop.listingStatus.value === "active")
          .map((prop) => {
            const price = prop.price ?? 0;
            const currency = prop.currency?.value ?? "";
            const formattedPrice =
              price > 0 && currency ? `${price} ${currency}` : "Consultar";

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
                        propertyType: prop.type?.value ?? 'No disponible',
                        url: `https://www.remax.com.ar/listings/${prop.slug}`,
                        photos: buildListingPhotoUrls(prop.photos, 3),
                        operation: prop.operation?.id === 1 
                                        ? 'Venta' 
                                        : prop.operation?.id === 2 
                                            ? 'Alquiler' 
                                            : prop.operation?.id === 3 
                                            ? 'Alquiler temporario' 
                                            : ''
                    };
                });

        console.log(`  -> ✅ ${pageProperties.length} propiedades extraídas.`);
        allProperties = allProperties.concat(pageProperties);
      } catch (error) {
        console.warn(
          `⚠️ Error al procesar la página ${currentPage}: ${error.message}. Continuando...`
        );
        continue;
      }
    }

    return allProperties;
  } catch (error) {
    console.error(`❌ Error fatal en scrapeRemax:`, error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log(
        `scrapeRemax: Navegador cerrado para lote ${startPage}-${endPage}.`
      );
    }
  }
}

module.exports = { getMaxPages, scrapeRemax };
