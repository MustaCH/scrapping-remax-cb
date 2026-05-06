// Smoke test: scrapea página 0 de cada operación y mide tasa de match de zonas.
const { scrapeRemax } = require("./scraper");

(async () => {
  const results = {};
  for (const op of [1, 2, 3]) {
    const properties = await scrapeRemax(0, 0, op);
    const matched = properties.filter((p) => p.zone).length;
    const exact = properties.filter((p) => p.zone?.matchedBy === "exact").length;
    const trimmed = properties.filter((p) => p.zone?.matchedBy?.startsWith("trimmed")).length;
    const noMatch = properties.filter((p) => !p.zone);
    results[op] = { total: properties.length, matched, exact, trimmed, noMatch: noMatch.length };
    console.log(
      `\n=== Operación ${op} === total=${properties.length} match=${matched} (exact=${exact}, trimmed=${trimmed}) sin_match=${noMatch.length}`
    );
    if (noMatch.length > 0) {
      console.log("  Sin match:");
      noMatch.forEach((p) => console.log(`    - "${p.locality}" (${p.title})`));
    }
    console.log("  Sample:");
    const sample = properties[0];
    if (sample) {
      console.log(`    locality: ${sample.locality}`);
      console.log(`    zone:     ${JSON.stringify(sample.zone, null, 6).split("\n").join("\n    ")}`);
    }
  }

  console.log("\n=== Resumen ===");
  console.table(results);
})();
