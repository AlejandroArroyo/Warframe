// scripts/fetch-items.js
const axios = require("axios");
const fs = require("fs");
const API_BASE = "https://api.warframe.market/v1";

(async () => {
  try {
    const { data } = await axios.get(`${API_BASE}/items`);
    fs.writeFileSync(
      "public/items.json",
      JSON.stringify(data.payload.items, null, 2),
      "utf8"
    );
    console.log("✅ items.json generado");
  } catch (err) {
    console.error("❌ error bajando items:", err);
    process.exit(1);
  }
})();
