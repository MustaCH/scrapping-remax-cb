// Regenera el catálogo de zonas de Córdoba consultando la API pública de Remax.
// Uso: node scripts/build-zones.js
// Output: data/cordoba-zones.json
//
// El endpoint /search/findAll/{q} es un autocomplete que tope en 200 items.
// Estrategia: barrer con muchas queries (deptos, palabras comunes, bigramas)
// y deduplicar por id, filtrando stateId=CB.

const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_FILE = path.join(__dirname, "..", "data", "cordoba-zones.json");
const API_BASE = "https://api-ar.redremax.com/remaxweb-ar/api/search/findAll";
const STATE_ID = "CB";

const COUNTIES = [
  "capital", "calamuchita", "colon", "cruz del eje", "general roca",
  "general san martin", "ischilin", "juarez celman", "marcos juarez",
  "minas", "pocho", "presidente roque saenz peña", "punilla", "rio cuarto",
  "rio primero", "rio seco", "rio segundo", "san alberto", "san javier",
  "san justo", "santa maria", "sobremonte", "tercero arriba", "totoral",
  "tulumba", "union",
];

const COMMON_WORDS = [
  "cordoba", "centro", "nueva cordoba", "alta cordoba", "alberdi",
  "general paz", "cerro", "rosas", "barrio", "villa", "san", "santa",
  "los", "las", "el", "la", "del", "country", "club",
  "norte", "sur", "este", "oeste", "altos",
  "carlos paz", "jesus maria", "alta gracia", "rio ceballos",
  "unquillo", "mendiolaza", "villa allende", "saldan", "la calera",
  "malvinas", "argentinas", "ferreyra", "san vicente", "guemes",
  "yofre", "urca", "jardin", "marques", "valle", "pueblo",
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
            Accept: "application/json",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, body: null });
            }
          });
        }
      )
      .on("error", reject);
  });
}

function stripTags(s) {
  return typeof s === "string" ? s.replace(/<\/?b>/g, "") : s;
}

function buildQueries() {
  const queries = new Set();
  COUNTIES.forEach((q) => queries.add(q));
  COMMON_WORDS.forEach((q) => queries.add(q));
  const consonants = "bcdfghjklmnpqrstvwyz";
  const vowels = "aeiou";
  for (const c of consonants) for (const v of vowels) queries.add(c + v);
  return queries;
}

async function build() {
  const queries = buildQueries();
  console.log(`Barriendo ${queries.size} queries...`);

  const byId = new Map();
  let i = 0;
  for (const q of queries) {
    i++;
    try {
      const url = `${API_BASE}/${encodeURIComponent(q)}?level=1`;
      const { body } = await fetchJson(url);
      const items = body?.data?.geoSearch ?? [];
      const cbItems = items.filter((it) => it.stateId === STATE_ID);
      cbItems.forEach((it) => {
        byId.set(it.id, {
          ...it,
          label: stripTags(it.label),
          rootLabel: stripTags(it.rootLabel),
        });
      });
      if (i % 20 === 0) console.log(`  [${i}/${queries.size}] acum: ${byId.size}`);
    } catch (e) {
      console.warn(`  query "${q}" falló: ${e.message}`);
    }
  }

  const all = [...byId.values()].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return (a.label || "").localeCompare(b.label || "");
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 2));

  const byLevel = {};
  for (const z of all) byLevel[z.level] = (byLevel[z.level] ?? 0) + 1;
  console.log(`\nTotal: ${all.length} zonas → ${OUT_FILE}`);
  Object.keys(byLevel).sort().forEach((l) => console.log(`  Level ${l}: ${byLevel[l]}`));
}

build().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
