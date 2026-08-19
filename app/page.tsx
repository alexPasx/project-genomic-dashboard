"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Database, Download, Dna, ExternalLink, LoaderCircle, Search, Sparkles } from "lucide-react";
import { ClinicalCard } from "../components/ClinicalCard";
import { DonutCard } from "../components/DonutCard";
import { GeneCoverageCard } from "../components/GeneCoverageCard";
import { MetricsGrid } from "../components/MetricsGrid";
import { PopulationBarCard } from "../components/PopulationBarCard";
import { fetchGnomadGene, searchGnomadGenes, type GeneSuggestion } from "../data/gnomadClient";
import { categoryColors, categoryLabels, formatInteger, genes, type CategoryKey, type GeneData } from "../data/mockData";

const allCategories = Object.keys(categoryLabels) as CategoryKey[];
const quickGenes = ["LRRK2", "GBA", "PARK7", "BRCA1", "TP53"];

export default function Home() {
  const [gene, setGene] = useState<GeneData>(genes.LRRK2);
  const [query, setQuery] = useState("LRRK2");
  const [active, setActive] = useState<CategoryKey[]>(allCategories);
  const [suggestions, setSuggestions] = useState<GeneSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialRequestStarted = useRef(false);
  const filteredTotal = useMemo(() => active.reduce((sum, key) => sum + gene.consequences[key], 0), [active, gene]);

  const loadGene = async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;
    setLoading(true); setError(null); setSuggestions([]);
    try {
      const loadedGene = await fetchGnomadGene(normalized);
      setGene(loadedGene); setQuery(loadedGene.symbol);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load gnomAD data.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (initialRequestStarted.current) return;
    initialRequestStarted.current = true;
    void loadGene("LRRK2");
  }, []);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2 || search.toUpperCase() === gene.symbol) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchGnomadGenes(search);
        if (!controller.signal.aborted) setSuggestions(results);
      } catch { if (!controller.signal.aborted) setSuggestions([]); }
    }, 280);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, gene.symbol]);

  const submitSearch = (event: FormEvent) => { event.preventDefault(); void loadGene(query); };
  const toggleCategory = (key: CategoryKey) => setActive((current) => current.includes(key) ? (current.length === 1 ? current : current.filter((item) => item !== key)) : [...current, key]);
  const exportCurrentView = () => {
    const payload = JSON.stringify({ gene: gene.symbol, activeCategories: active, metrics: { totalVariants: filteredTotal, meanAF: gene.meanAF, pLI: gene.pli, LOEUF: gene.loeuf, lengthBp: gene.length, exonCount: gene.exons }, data: gene }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${gene.symbol.toLowerCase()}-gnomad-dashboard.json`; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Dna size={23} /></div><div><span className="eyebrow">PROJECT · GENOMIC DASHBOARD</span><strong>Genomic Atlas</strong></div></div>
      <div className="topbar-actions"><span className="data-badge"><span className={`live-dot ${gene.source ? "" : "loading-dot"}`} /> {gene.source ? "LIVE GNOMAD · GRCh38" : "CONNECTING TO GNOMAD"}</span><button className="icon-button" aria-label="Export current view" title="Export current view" onClick={exportCurrentView}><Download size={18} /></button></div>
    </header>

    <div className="dashboard-wrap">
      <section className="intro-row">
        <div><div className="section-kicker"><Sparkles size={14} /> GNOMAD GENE EXPLORER</div><h1>{gene.symbol} <span>variant landscape</span></h1><p>{gene.fullName} · {gene.location} · Ensembl {gene.ensembl}</p></div>
        <form className="gene-control" onSubmit={submitSearch}>
          <label htmlFor="gene-search">SEARCH ANY GNOMAD GENE</label>
          <div className="search-combobox"><div className="select-wrap"><Search size={16} /><input id="gene-search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder="e.g. BRCA1, TP53, SNCA" aria-autocomplete="list" />
            <button type="submit" className="search-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={16} /> : "Load"}</button>
          </div>
          {suggestions.length > 0 && <div className="suggestions" role="listbox">{suggestions.map((item) => <button type="button" key={item.ensembl_id} onClick={() => void loadGene(item.symbol)}><strong>{item.symbol}</strong><span>{item.ensembl_id}</span></button>)}</div>}</div>
          <div className="quick-genes">{quickGenes.map((symbol) => <button type="button" key={symbol} onClick={() => void loadGene(symbol)}>{symbol}</button>)}</div>
        </form>
      </section>

      {error && <div className="error-banner" role="alert"><strong>gnomAD request failed.</strong><span>{error}</span><button onClick={() => void loadGene(query)}>Retry</button></div>}

      <section className="filter-bar" aria-label="Variant consequence filters">
        <div className="filter-label"><Activity size={16} /> Consequence filters</div>
        <div className="filter-options">{allCategories.map((key) => <label key={key} className={`filter-pill ${active.includes(key) ? "selected" : ""}`}><input type="checkbox" checked={active.includes(key)} onChange={() => toggleCategory(key)} /><span className="swatch" style={{ background: categoryColors[key] }} />{categoryLabels[key]}</label>)}</div>
        <div className="filtered-count"><Database size={15} /> {formatInteger(filteredTotal)} shown</div>
      </section>

      <MetricsGrid gene={gene} total={filteredTotal} filtering={active.length !== allCategories.length} />
      <section className="chart-grid"><DonutCard gene={gene} active={active} /><PopulationBarCard gene={gene} active={active} /><GeneCoverageCard gene={gene} active={active} /><ClinicalCard gene={gene} active={active} /></section>

      <footer><span>PROJECT · GENOMIC DASHBOARD</span><span>Source: {gene.source || "local fallback"} · <a href={`https://gnomad.broadinstitute.org/gene/${gene.ensembl}?dataset=gnomad_r4`} target="_blank" rel="noreferrer">Open gene in gnomAD <ExternalLink size={10} /></a></span></footer>
    </div>
  </main>;
}
