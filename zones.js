// Catálogo de zonas de Córdoba de Remax + lookup por geoLabel.
// El catálogo se regenera con: node scripts/build-zones.js

const path = require("path");
const fs = require("fs");

const ZONES_FILE = path.join(__dirname, "data", "cordoba-zones.json");

const LEVEL_LABELS = {
  1: "provincia",
  2: "departamento",
  3: "ciudad",
  4: "barrio",
  5: "barrio_cerrado",
};

function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar tildes / diacríticos
    .replace(/\s+/g, " ")
    .trim();
}

let zonesByLabel = null;
let zonesById = null;

function loadIndex() {
  if (zonesByLabel) return;
  const raw = JSON.parse(fs.readFileSync(ZONES_FILE, "utf8"));
  zonesByLabel = new Map();
  zonesById = new Map();
  for (const z of raw) {
    if (z.label) zonesByLabel.set(normalize(z.label), z);
    if (z.id) zonesById.set(z.id, z);
  }
}

function toZoneOutput(z) {
  if (!z) return null;
  return {
    label: z.label,
    level: z.level,
    levelName: LEVEL_LABELS[z.level] ?? null,
    state: z.state ?? null,
    county: z.countie ?? null,
    city: z.citie ?? null,
    neighborhood: z.neighborhood ?? null,
    privateCommunity: z.privatecommunitie ?? null,
    stateId: z.stateId ?? null,
    countyId: z.countyId || null,
    cityId: z.cityId || null,
    neighborhoodId: z.neighborhoodId || null,
    privateCommunityId: z.privatecommunityId || null,
    slug: z.slug ?? null,
    matchedBy: z._matchedBy || "exact",
  };
}

// Match: exacto sobre el label normalizado. Fallback: ir trimando segmentos
// del geoLabel desde la izquierda (la propiedad puede traer un nivel más
// específico que el catálogo).
function matchZone(geoLabel) {
  if (!geoLabel) return null;
  loadIndex();

  const normalized = normalize(geoLabel);
  let z = zonesByLabel.get(normalized);
  if (z) return toZoneOutput({ ...z, _matchedBy: "exact" });

  // Fallback: dropear segmentos del inicio (ej. "Subbarrio, Barrio, Ciudad, ..."
  // → "Barrio, Ciudad, ...")
  const parts = geoLabel.split(",").map((p) => p.trim()).filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const trimmed = parts.slice(i).join(", ");
    z = zonesByLabel.get(normalize(trimmed));
    if (z) return toZoneOutput({ ...z, _matchedBy: `trimmed:${i}` });
  }

  return null;
}

module.exports = { matchZone, normalize, LEVEL_LABELS };
