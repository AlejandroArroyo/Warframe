import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { LineChart, Line, ResponsiveContainer } from "recharts";

// Base API URL (used only for orders and details)
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
  const [history, setHistory] = useState(
    JSON.parse(localStorage.getItem("wf_history") || "[]")
  );

  // Cache items loaded from a static JSON (public/items.json)
  const itemsCache = useRef(null);
  useEffect(() => {
    // Use PUBLIC_URL to ensure correct path on GitHub Pages
    const publicUrl = process.env.PUBLIC_URL || '';
    const path = `${publicUrl}/items.json`;
    fetch(path)
      .then(res => {
        if (!res.ok) throw new Error("No items.json");
        return res.json();
      })
      .then(items => {
        itemsCache.current = items;
      })
      .catch(() => {
        itemsCache.current = [];
      });
  }, []);

  // Load from URL param
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("t");
    if (slug) {
      onSelect({ url_name: slug, item_name: slug.replace(/_/g, " ") });
    }
  }, []);

  // Persist history
  useEffect(() => {
    localStorage.setItem("wf_history", JSON.stringify(history));
  }, [history]);

  // Debounce
  const debounceRef = useRef(null);
  const fetchSuggestions = (query) => {
    if (query.length < 2) return setSuggestions([]);
    const items = itemsCache.current || [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = items
      .filter(i =>
        terms.every(t =>
          i.item_name.replace(/_/g, " ").toLowerCase().includes(t)
        )
      )
      .sort((a,b) => a.item_name.localeCompare(b.item_name));
    setSuggestions(filtered);
    setHighlight(-1);
  };

  const onChangeInput = e => {
    const v = e.target.value;
    setItem(v);
    setSelectedItem(null);
    setResults([]);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300);
  };

  const onKeyDown = useCallback(e => {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') setHighlight(h => Math.min(h+1, suggestions.length-1));
    if (e.key === 'ArrowUp') setHighlight(h => Math.max(h-1, 0));
    if (e.key === 'Enter') {
      if (highlight >= 0) {
        onSelect(suggestions[highlight]);
      } else if (item.trim()) {
        buscarObjeto(null, item);
      }
    }
    if (e.key === 'Escape') setSuggestions([]);
  }, [suggestions, highlight, item]);

  const onSelect = sug => {
    setSelectedItem(sug);
    setItem(sug.item_name);
    setSuggestions([]);
    setResults([]);
    setHistory(h => [sug.item_name, ...h.filter(x => x!==sug.item_name)].slice(0,10));
    window.history.replaceState(null, '', `?t=${sug.url_name}`);
    buscarObjeto(sug.url_name, sug.item_name);
  };

  const buscarObjeto = async (slugParam, displayName) => {
    setLoading(true); setResults([]); setStats([]);
    const slug = slugParam || item.toLowerCase().replace(/ /g,'_').replace(/'/g,'');
    const display = displayName || item;
    const headers = { accept:'application/json', platform:'pc', language:'es' };
    try {
     const proxy = "https://api.allorigins.win/raw?url=";
// Fetch orders and detail via CORS proxy
const ordersUrl   = `${proxy}${encodeURIComponent(`${API_BASE}/items/${slug}/orders`)}`;
const detailUrl   = `${proxy}${encodeURIComponent(`${API_BASE}/items/${slug}`)}`;
const [{ data: ordersData }, { data: detailData }] = await Promise.all([
  axios.get(ordersUrl, { headers }),
  axios.get(detailUrl,  { headers })
]);

      // Historical stats
      if (detailData.payload.history) {
        setStats(detailData.payload.history.map(p => ({ time:p.datetime, avg:p.avg_price })));
      }
      const sellers = ordersData.payload.orders
        .filter(o => o.user.status==='ingame' && o.order_type==='sell')
        .sort((a,b)=>a.platinum-b.platinum).slice(0,3);
      if (!sellers.length) {
        setResults([{ error:`No hay vendedores online para "${display}".` }]);
      } else {
        const icon = detailData.payload.item.items_in_set[0].icon;
        const imagen = `https://warframe.market/static/assets/${icon}`;
        setResults(sellers.map(s=>({ item:display, precio:s.platinum, vendedor:s.user.ingame_name, imagen })));
      }
    } catch {
      setResults([{ error:`Error al buscar "${display}".` }]);
    } finally {
      setLoading(false); setCopiedIndex(null);
    }
  };

  const copiarTexto = (vendor, price, idx) => {
    const msg = `/w ${vendor} Hi! I want to buy: "${item}" for ${price} platinum. (warframe.market)`;
    navigator.clipboard.writeText(msg);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg mt-10 font-sans">
      {/* Dark toggle */}
      <div className="flex justify-end mb-4">
        <button onClick={()=>setDark(d=>!d)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
          {dark? '☀️ Claro' : '🌙 Oscuro'}
        </button>
      </div>

      <h1 className="text-3xl font-extrabold mb-6 text-gray-900 dark:text-gray-100">🔍 Buscador de objetos Warframe</h1>

      {/* History */}
      {history.length > 0 && (
        <ul className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          {history.map((h,i)=>(
            <li key={i} onClick={() => onSelect({ url_name: h.toLowerCase().replace(/ /g,'_'), item_name: h })} className="cursor-pointer hover:underline text-gray-900 dark:text-gray-100">
              {h}
            </li>
          ))}
        </ul>
      )}

      {/* Input + suggestions */}
      <div className="relative mb-3">
        <input
          type="text"
          placeholder="Escribe el nombre del objeto..."
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
                className={`px-4 py-3 text-sm sm:text-base cursor-pointer transition text-gray-900 dark:text-gray-100 ${highlight===idx ? 'bg-blue-200 dark:bg-blue-500' : 'hover:bg-blue-100 dark:hover:bg-blue-600'}`}
              >
                {sug.item_name.replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Manual search button */}
      {item.trim() && !loading && (
        <button
          onClick={() => buscarObjeto(null, item)}
          className="w-full mt-2 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
        >
          Buscar precio más bajo
        </button>
      )}

      {/* Results */}
      {results.map((res, idx) =>
        res.error ? (
          <p key={idx} className="text-red-600 font-semibold mt-4">{res.error}</p>
        ) : (
          <div key={idx} className="mt-6 bg-gray-50 dark:bg-gray-700 rounded-lg p-5 shadow-md flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <img src={res.imagen} alt={res.item} className="w-32 h-32 object-contain rounded-lg border border-gray-200 dark:border-gray-600 shadow mx-auto md:mx-0"/>
              <div className="space-y-1 text-center md:text-left text-gray-900 dark:text-gray-100">
                <p className="font-bold text-lg">🧱 Objeto: {res.item}</p>
                <p>💰 Precio: <span className="font-semibold">{res.precio} platinos</span></p>
                <p>🧍 Vendedor: <span className="font-semibold">{res.vendedor}</span></p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-md border border-gray-200 dark:border-gray-600 relative">
              <p className="font-semibold mb-2 text-gray-900 dark:text-gray-100">💬 Mensaje para copiar:</p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <code className="bg-gray-100 dark:bg-gray-900 p-2 font-mono overflow-x-auto text-sm flex-1 rounded text-gray-900 dark:text-gray-100">
                  {`/w ${res.vendedor} Hi! I want to buy: "${res.item}" for ${res.precio} platinum. (warframe.market)`}
                </code>
                <button onClick={() => copiarTexto(res.vendedor, res.precio, idx)} className="bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-md hover:bg-blue-700 transition relative">Copiar</button>
                {copiedIndex === idx && (
                  <span className="absolute -top-8 right-0 bg-green-600 text-white text-xs rounded px-3 py-1 animate-fade-in-out">¡Copiado!</span>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {/* Historic chart */}
      {stats.length > 0 ? (
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg mt-6">
          <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">Histórico precio medio</p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={stats}><Line dataKey="avg" stroke="#3b82f6" dot={false}/></LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        selectedItem && !loading && (
          <p className="text-center text-gray-600 dark:text-gray-300 mt-6">
            No hay datos históricos disponibles para <strong>{item}</strong>.
          </p>
        )
      )}
    </div>
  );
}
