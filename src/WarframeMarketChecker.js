import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { LineChart, Line, ResponsiveContainer } from "recharts";

  function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Base API URL
const API_BASE = "https://api.warframe.market/v1";

export default function WarframeMarketChecker() {
  // Dark mode toggle
  const [dark, setDark] = useState(localStorage.theme === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.theme = dark ? "dark" : "light";
  }, [dark]);

  // Main states
  const [item, setItem] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [highlight, setHighlight] = useState(-1);
  const [relatedParts, setRelatedParts] = useState([]);
  const [history, setHistory] = useState(
    JSON.parse(localStorage.getItem("wf_history") || "[]")
  );

  // Items cache
  const itemsCache = useRef([]);
  useEffect(() => {
    const publicUrl = process.env.PUBLIC_URL || '';
    fetch(`${publicUrl}/items.json`)
      .then(res => res.json())
      .then(items => (itemsCache.current = items))
      .catch(() => (itemsCache.current = []));
  }, []);

  // Persist history
  useEffect(() => {
    localStorage.setItem("wf_history", JSON.stringify(history));
  }, [history]);

  // Load from URL param
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("t");
    if (slug) {
      onSelect({
        url_name: slug.toLowerCase(),
        item_name: toTitleCase(slug.replace(/_/g, " "))
      });
    }
  }, []);


  // Debounce suggestions
  const debounceRef = useRef();
  const fetchSuggestions = query => {
    if (query.length < 2) return setSuggestions([]);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = itemsCache.current
      .filter(i =>
        terms.every(t =>
          i.item_name.replace(/_/g, " ").toLowerCase().includes(t)
        )
      )
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
    setSuggestions(filtered);
    setHighlight(-1);
  };

  const onChangeInput = e => {
    const v = e.target.value;
    setItem(v);
    setSelectedItem(null);
    setResults([]);
    setRelatedParts([]);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300);
  };

  const onKeyDown = useCallback(
    e => {
      if (!suggestions.length) return;
      if (e.key === "ArrowDown")
        setHighlight(h => Math.min(h + 1, suggestions.length - 1));
      if (e.key === "ArrowUp")
        setHighlight(h => Math.max(h - 1, 0));
      if (e.key === "Enter")
        highlight >= 0
          ? onSelect(suggestions[highlight])
          : buscarObjeto(null, item);
      if (e.key === "Escape") setSuggestions([]);
    },
    [suggestions, highlight, item]
  );

  const onSelect = sug => {
    // Limpia partes relacionadas previas
    setRelatedParts([]);
    // Calcula partes relacionadas
    const prefix = sug.item_name.split(" ")[0].toLowerCase();
    const parts = itemsCache.current.filter(
      i =>
        i.item_name.replace(/_/g, " ").toLowerCase().startsWith(prefix) &&
        i.url_name !== sug.url_name
    );
    setRelatedParts(parts);
    // Normaliza el nombre a Title Case
    const title = toTitleCase(sug.item_name);
    // Selección
    setSelectedItem(sug);
    setItem(title);
    setSuggestions([]);
    // Guarda en historial solo la versión Title Case, evitando duplicados
    setHistory(h => [sug.item_name, ...h.filter(x => x !== sug.item_name)].slice(0, 5));
    window.history.replaceState(null, "", `?t=${encodeURIComponent(sug.url_name)}`);
    buscarObjeto(sug.url_name, sug.item_name);
  };

  // Search object function (uses AllOrigins CORS proxy)
  const buscarObjeto = async (slugParam, displayName) => {
    setLoading(true);
    setResults([]);
    setStats([]);
    const slug = slugParam || item.toLowerCase().replace(/ /g, "_").replace(/'/g, "");
    const display = displayName || item;

    try {
      const proxy = "https://corsproxy.io/?";
      const ordersUrl = `${proxy}${API_BASE}/items/${slug}/orders`;
      const detailUrl = `${proxy}${API_BASE}/items/${slug}`;
      const [ordersRes, detailRes] = await Promise.all([
        axios.get(ordersUrl),
        axios.get(detailUrl)
      ]);

      const ordersData = ordersRes.data;
      const detailData = detailRes.data;

      // Historical stats
      if (detailData.payload.history) {
        setStats(
          detailData.payload.history.map(p => ({ time: p.datetime, avg: p.avg_price }))
        );
      }

      // Sellers
      const sellers = ordersData.payload.orders
        .filter(o => o.user.status === "ingame" && o.order_type === "sell")
        .sort((a, b) => a.platinum - b.platinum)
        .slice(0, 3);

      if (!sellers.length) {
        setResults([{ error: `No hay vendedores online para "${display}".` }]);
      } else {
        // Busca la parte específica en items_in_set
        const partsArr = detailData.payload.item.items_in_set;
        const match = partsArr.find(p => p.url_name === slug);
        const iconName = match ? match.icon : partsArr[0].icon;
        const imagen = `https://warframe.market/static/assets/${iconName}`;

        setResults(
          sellers.map((s, i) => ({
            item: display,
            precio: s.platinum,
            vendedor: s.user.ingame_name,
            imagen
          }))
        );
      }
    } catch (err) {
      console.error("buscarObjeto error", err);
      setResults([{ error: `Error al buscar "${display}".` }]);
    } finally {
      setLoading(false);
      setCopiedIndex(null);
    }
  };

  const copiarTexto = (vendor, price, idx) => {
    navigator.clipboard.writeText(`/w ${vendor} Hi! I want to buy: "${item}" for ${price} platinum. (warframe.market)`);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg mt-10 font-sans">
      {/* Dark mode toggle */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setDark(d => !d)}
          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100"
        >
          {dark ? "☀️ Claro" : "🌙 Oscuro"}
        </button>
      </div>
      <h1 className="text-3xl font-extrabold mb-6 text-gray-900 dark:text-gray-100">
        🔍 Buscador de objetos Warframe
      </h1>

      {/* Partes relacionadas */}
      {relatedParts.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
            Partes relacionadas:
          </p>
          {relatedParts.map((p) => (
            <button
              key={p.url_name}
              onClick={() => onSelect(p)}
              className="underline hover:text-blue-600 dark:hover:text-blue-400 mr-3"
            >
              {p.item_name.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Búsquedas recientes:
          </p>
          <ul className="space-y-1 text-gray-900 dark:text-gray-100">
            {history.map((h, i) => (
              <li
                key={i}
                onClick={() =>
                  onSelect({
                    url_name: h.toLowerCase().replace(/ /g, '_'),
                    item_name: h
                  })
                }
                className="cursor-pointer hover:underline"
              >
                {h}
              </li>
            ))}
          </ul>
		<button
            onClick={() => setHistory([])}
            className="text-sm text-red-600 hover:underline"
          >
            Borrar historial
          </button>
        </div>
      )}

      {/* Input + suggestions */}
      <div className="relative mb-3">
        <input
          type="text"
          placeholder="Escribe el nombre de un objeto..."
          value={item}
          onChange={onChangeInput}
          onKeyDown={onKeyDown}
          className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
        />
        {!selectedItem && suggestions.length > 0 && (
          <ul className="absolute z-10 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md mt-1 shadow-lg max-h-40 overflow-y-auto text-gray-900 dark:text-gray-100">
            {suggestions.map((sug, idx) => (
              <li
                key={sug.url_name}
                onClick={() => onSelect(sug)}
                className={`${
                  highlight === idx
                    ? 'bg-blue-200 dark:bg-blue-500'
                    : 'hover:bg-blue-100 dark:hover:bg-blue-600'
                } cursor-pointer px-4 py-2 transition`}
              >
                {sug.item_name.replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Search button */}
       {item.trim() && (
        loading ? (
          <div className="flex justify-center py-3">
            <svg
              className="animate-spin h-6 w-6 text-gray-700 dark:text-gray-200"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : (
          <button
            onClick={() => buscarObjeto(null, item)}
            className="w-full py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
          >
            Buscar precio más bajo
          </button>
        )
      )}

      {/* Results */}
      {results.map((res, idx) =>
        res.error ? (
          <p key={idx} className="text-red-600 font-semibold mt-4">
            {res.error}
          </p>
        ) : (
          <div
            key={idx}
            className="mt-6 bg-gray-50 dark:bg-gray-700 rounded-lg p-5 shadow-md flex flex-col gap-4"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <img
                src={res.imagen}
                alt={res.item}
                className="w-32 h-32 object-contain rounded-lg border border-gray-200 dark:border-gray-600 shadow mx-auto md:mx-0"
              />
              <div className="space-y-1 text-center md:text-left text-gray-900 dark:text-gray-100">
                <p className="font-bold text-lg">🧱 Objeto: {res.item}</p>
                <p>💰 Precio:{' '}<span className="font-semibold">{res.precio} platinos</span></p>
                <p>🧍 Venedor:{' '}<span className="font-semibold">{res.vendedor}</span></p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-md border border-gray-200 dark:border-gray-600 relative">
              <p className="font-semibold mb-2 text-gray-900 dark:text-gray-100">💬 Mensaje para copiar:</p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <code
                  className="bg-gray-100 dark:bg-gray-900 p-2 font-mono overflow-x-auto text-sm flex-1 rounded text-gray-900 dark:text-gray-100"
                >
                  {`/w ${res.vendedor} Hi! I want to buy: "${res.item}" for ${res.precio} platinum. (warframe.market)`}
                </code>
                <button
                  onClick={() => copiarTexto(res.vendedor, res.precio, idx)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition relative"
                >
                  Copiar
                </button>
                {copiedIndex === idx && (
                  <span className="absolute -top-8 right-0 bg-green-600 text-white text-xs rounded px-3 py-1 animate-fade-in-out">
                    ¡Copiado!
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      )}

    </div>
  );
}
