const { chromium } = require("playwright");
const { matchZone } = require("./zones");

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

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const CDN_BASE = "https://d1acdg20u0pmxj.cloudfront.net";
const DEFAULT_IMAGE_SIZE = "AUTOx860";
const DEFAULT_IMAGE_EXT = "webp";

const OPERATION_LABELS = {
  1: "Venta",
  2: "Alquiler",
  3: "Alquiler temporario",
};

// Path en la URL de listings según operationId. Remax cambió el routing:
// pedir /listings/buy con operationId=2 ya no devuelve alquileres.
// Remax solo acepta "buy" y "rent" como path. El filtro real es el
// query param operationId. Para temporario usamos /rent (sólo cambia el
// landing visual; el listado lo determina operationId=3).
const OPERATION_PATHS = {
  1: "buy",
  2: "rent",
  3: "rent",
};

const VALID_OPERATION_IDS = Object.keys(OPERATION_LABELS).map(Number);

function buildListingsUrl(operationId, pageNum) {
  const path = OPERATION_PATHS[operationId] ?? "buy";
  return `https://www.remax.com.ar/listings/${path}?page=${pageNum}&pageSize=24&sort=-createdAt&in:operationId=${operationId}&locations=in:CB@C%C3%B3rdoba::::::`;
}

function rawToCdnUrl(rawValue, size = DEFAULT_IMAGE_SIZE, ext = DEFAULT_IMAGE_EXT) {
  const normalized = String(rawValue || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  const [root, listingId, photoId] = parts;
  if (root !== "listings") return null;
  return `${CDN_BASE}/${root}/${listingId}/${size}/${photoId}.${ext}`;
}

function buildListingPhotoUrls(photos, limit = 3) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  const urls = [];
  for (const photo of photos) {
    const url = rawToCdnUrl(photo?.rawValue);
    if (url && !urls.includes(url)) urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

function pickPrimary(items, field = "value") {
  if (!Array.isArray(items) || items.length === 0) return null;
  const primary = items.find((it) => it?.isPrimary);
  return (primary ?? items[0])?.[field] ?? null;
}

function mapProperty(prop) {
  const isEntrepreneurship = !!prop.entrepreneurship;
  const lng = prop.location?.coordinates?.[0] ?? null;
  const lat = prop.location?.coordinates?.[1] ?? null;

  const base = {
    id: prop.id ?? null,
    entityId: prop.entityId ?? null,
    internalId: prop.internalId ?? null,
    title: prop.title ?? null,
    url: prop.slug ? `https://www.remax.com.ar/listings/${prop.slug}` : null,
    slug: prop.slug ?? null,

    operation: OPERATION_LABELS[prop.operation?.id] ?? prop.operation?.value ?? null,
    operationId: prop.operation?.id ?? null,
    propertyType: prop.type?.value ?? null,
    propertyTypeId: prop.type?.id ?? null,
    listingStatus: prop.listingStatus?.value ?? null,
    isEntrepreneurship: isEntrepreneurship,

    price: prop.price ?? null,
    currency: prop.currency?.value ?? null,
    priceExposure: prop.priceExposure ?? null,
    expensesPrice: prop.expensesPrice ?? null,
    expensesCurrency: prop.expensesCurrency?.value ?? null,

    address: prop.displayAddress ?? null,
    locality: prop.geoLabel ?? null,
    zone: matchZone(prop.geoLabel),
    latitude: lat,
    longitude: lng,

    dimensionLand: prop.dimensionLand ?? null,
    dimensionTotalBuilt: prop.dimensionTotalBuilt ?? null,
    dimensionCovered: prop.dimensionCovered ?? null,

    ambientes: prop.totalRooms ?? null,
    habitaciones: prop.bedrooms ?? null,
    baños: prop.bathrooms ?? null,

    contactPerson: prop.associate?.name ?? null,
    contactPhone: pickPrimary(prop.associate?.phones, "value"),
    contactEmail: pickPrimary(prop.associate?.emails, "value"),
    office: prop.associate?.officeName ?? null,
    officeId: prop.associate?.officeId ?? null,
    associateId: prop.associate?.id ?? null,
    brokers:
      prop.listBroker
        ?.map((b) => [b.name, b.license].filter(Boolean).join(" ").trim())
        .filter(Boolean)
        .join(", ") || null,

    photos: buildListingPhotoUrls(prop.photos, 3),
  };

  if (isEntrepreneurship) {
    base.entrepreneurship = {
      stage: prop.estage ?? null,
      totalUnits: prop.etotalUnits ?? null,
      currency: prop.ecurrency?.value ?? null,
      minPrice: prop.eminPrice ?? null,
      maxPrice: prop.emaxPrice ?? null,
      minBedrooms: prop.eminBedrooms ?? null,
      maxBedrooms: prop.emaxBedrooms ?? null,
      minTotalRooms: prop.eminTotalRooms ?? null,
      maxTotalRooms: prop.emaxTotalRooms ?? null,
      completedMonth: prop.ecompletedMonth ?? null,
      completedYear: prop.ecompletedYear ?? null,
    };
  }

  return base;
}

const extractNgStateData = async (page) => {
  const ngStateSelector = "script#ng-state";
  await page.waitForSelector(ngStateSelector, { state: "attached", timeout: 30000 });
  const ngStateContent = await page.$eval(ngStateSelector, (el) => el.textContent);

  let jsonData;
  try {
    jsonData = JSON.parse(ngStateContent);
  } catch (e) {
    throw new Error("No se pudo parsear ng-state como JSON");
  }

  const allDataEntries = [];
  for (const [key, value] of Object.entries(jsonData)) {
    const list = value?.b?.data?.data;
    if (Array.isArray(list) && list.length > 0 && list[0]?.title && list[0]?.slug) {
      allDataEntries.push({ key, data: list });
    }
  }

  if (allDataEntries.length === 0) {
    throw new Error("No se encontraron bloques válidos dentro de ng-state");
  }

  const mainBlock = allDataEntries.reduce((a, b) =>
    b.data.length > a.data.length ? b : a
  );

  console.log(
    `ng-state: usando clave "${mainBlock.key}" con ${mainBlock.data.length} propiedades`
  );

  return mainBlock.data;
};

function normalizeOperationId(operationId) {
  const parsed = parseInt(operationId, 10);
  if (!VALID_OPERATION_IDS.includes(parsed)) {
    throw new Error(
      `operationId inválido: ${operationId}. Valores permitidos: ${VALID_OPERATION_IDS.join(", ")} (1=Venta, 2=Alquiler, 3=Alquiler temporario)`
    );
  }
  return parsed;
}

async function getMaxPages(operationId = 1) {
  const opId = normalizeOperationId(operationId);
  let browser;
  console.log(`getMaxPages(operationId=${opId}): iniciando navegador...`);
  try {
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({
      userAgent: USER_AGENT,
      // Viewport mobile: el paginador tiene clase "hide-gt-sm" y se oculta en desktop.
      viewport: { width: 390, height: 844 },
    });

    const firstPageUrl = buildListingsUrl(opId, 0);
    await page.goto(firstPageUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

    const paginatorSelector = ".p-container-paginator p";
    await page.waitForSelector(paginatorSelector, { timeout: 10000 });
    const paginatorText = await page.$eval(paginatorSelector, (el) => el.innerText);
    console.log(`Texto del paginador: "${paginatorText}"`);

    const match = paginatorText.match(/de\s+(\d+)/i);
    if (match && match[1]) {
      const totalPages = parseInt(match[1], 10);
      console.log(`Total de páginas detectado: ${totalPages}`);
      return totalPages;
    }
    console.warn("No se pudo extraer el número total de páginas. Usando fallback 175.");
    return 175;
  } catch (err) {
    console.warn(`Error en getMaxPages: ${err.message}. Usando fallback 175.`);
    return 175;
  } finally {
    if (browser) {
      await browser.close();
      console.log("getMaxPages: navegador cerrado.");
    }
  }
}

async function scrapeRemax(startPage = 0, endPage, operationId = 1) {
  const opId = normalizeOperationId(operationId);
  let browser;
  console.log(
    `scrapeRemax(operationId=${opId}): páginas ${startPage} a ${endPage}...`
  );
  try {
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ userAgent: USER_AGENT });

    let allProperties = [];

    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      try {
        console.log(`Procesando página ${currentPage}...`);
        const url = buildListingsUrl(opId, currentPage);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

        const propertiesData = await extractNgStateData(page);

        if (!propertiesData || propertiesData.length === 0) {
          console.log("  -> Página vacía. Finalizando.");
          break;
        }

        const pageProperties = propertiesData
          .filter((prop) => prop.listingStatus?.value === "active")
          .map(mapProperty);

        console.log(`  -> ${pageProperties.length} propiedades extraídas.`);
        allProperties = allProperties.concat(pageProperties);
      } catch (error) {
        console.warn(
          `Error al procesar página ${currentPage}: ${error.message}. Continuando...`
        );
        continue;
      }
    }

    return allProperties;
  } catch (error) {
    console.error("Error fatal en scrapeRemax:", error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log(`scrapeRemax: navegador cerrado (lote ${startPage}-${endPage}).`);
    }
  }
}

module.exports = {
  getMaxPages,
  scrapeRemax,
  OPERATION_LABELS,
  VALID_OPERATION_IDS,
};
