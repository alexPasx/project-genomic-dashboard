import type { CategoryKey, GeneData } from "./mockData";

const GNOMAD_API = "https://gnomad.broadinstitute.org/api";
type Population = { id: string; ac: number; an: number };
type Variant = { variant_id: string; pos: number; transcript_consequence?: { major_consequence?: string | null; domains?: string[] | null } | null; joint?: { ac?: number | null; an?: number | null; populations?: Population[] | null } | null };
type ClinVarVariant = { variant_id: string; clinical_significance: string; major_consequence?: string | null };
type GeneRecord = { gene_id: string; symbol: string; name?: string | null; chrom: string; start: number; stop: number; exons: Array<{ start: number; stop: number }>; canonical_transcript_id?: string | null; transcripts?: Array<{ transcript_id: string; exons: Array<{ start: number; stop: number }> }>; gnomad_constraint?: { pli?: number | null; oe_lof_upper?: number | null } | null; variants: Variant[]; clinvar_variants?: ClinVarVariant[] | null; coverage?: { exome?: Array<{ pos: number; mean?: number | null }> | null } | null };

export type GeneSuggestion = { symbol: string; ensembl_id: string };

const GENE_QUERY = `query GeneMetadata($symbol:String!){gene(gene_symbol:$symbol,reference_genome:GRCh38){gene_id symbol name chrom start stop exons{start stop} canonical_transcript_id transcripts{transcript_id exons{start stop}} gnomad_constraint{pli oe_lof_upper}}}`;
const VARIANTS_QUERY = `query GeneVariants($symbol:String!,$dataset:DatasetId!){gene(gene_symbol:$symbol,reference_genome:GRCh38){variants(dataset:$dataset){variant_id pos transcript_consequence{major_consequence domains} joint{ac an populations{id ac an}}}}}`;
const SUPPORTING_QUERY = `query GeneSupportingData($symbol:String!,$dataset:DatasetId!){gene(gene_symbol:$symbol,reference_genome:GRCh38){coverage(dataset:$dataset){exome{pos mean}} clinvar_variants{variant_id clinical_significance major_consequence}}}`;
const SEARCH_QUERY = `query GeneSearch($query:String!){gene_search(query:$query,reference_genome:GRCh38){symbol ensembl_id}}`;

async function callGnomad<T>(query: string, variables: Record<string, string>): Promise<T> {
  const response = await fetch(GNOMAD_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  if (!response.ok) throw new Error(`gnomAD returned HTTP ${response.status}.`);
  const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  if (!payload.data) throw new Error("gnomAD returned no data.");
  return payload.data;
}

function categoryFor(consequence = ""): CategoryKey {
  const value = consequence.toLowerCase();
  if (["stop_gained", "frameshift_variant", "splice_donor_variant", "splice_acceptor_variant", "transcript_ablation", "start_lost"].some((term) => value.includes(term))) return "plof";
  if (value.includes("missense") || value.includes("inframe")) return "missense";
  if (value.includes("synonymous")) return "synonymous";
  return "other";
}

function shortDomain(domains?: string[] | null) {
  const raw = domains?.[0]; if (!raw) return "Other region";
  const label = raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

function normalizeGene(gene: GeneRecord): GeneData {
  const consequences: Record<CategoryKey, number> = { plof: 0, missense: 0, synonymous: 0, other: 0 };
  const populationKeys = ["nfe", "eas", "afr", "amr", "sas"];
  const populations: GeneData["populations"] = populationKeys.map((population) => ({ population: population.toUpperCase(), plof: 0, missense: 0, synonymous: 0, other: 0 }));
  const frequencies: number[] = [];
  const variantDomains = new Map<string, { domain: string; category: CategoryKey }>();

  gene.variants.forEach((variant) => {
    const category = categoryFor(variant.transcript_consequence?.major_consequence || "");
    consequences[category] += 1;
    if (variant.joint?.an) frequencies.push((variant.joint.ac || 0) / variant.joint.an);
    populationKeys.forEach((key, index) => { populations[index][category] += variant.joint?.populations?.find((population) => population.id.toLowerCase() === key)?.ac || 0; });
    variantDomains.set(variant.variant_id, { domain: shortDomain(variant.transcript_consequence?.domains), category });
  });

  const coverageSource = gene.coverage?.exome || [];
  const coverageStride = Math.max(1, Math.ceil(coverageSource.length / 60));
  const binSize = Math.max(1, Math.ceil((gene.stop - gene.start + 1) / 60));
  const densityBins = Array.from({ length: 60 }, () => 0);
  gene.variants.forEach((variant) => { densityBins[Math.min(59, Math.max(0, Math.floor((variant.pos - gene.start) / binSize)))] += 1; });
  const coverage = coverageSource.filter((_, index) => index % coverageStride === 0).slice(0, 60).map((point, index) => ({ position: point.pos - gene.start, exon: `Bin ${index + 1}`, depth: Math.round(point.mean || 0), density: densityBins[index] }));
  if (!coverage.length) for (let index = 0; index < 60; index += 1) coverage.push({ position: index * binSize, exon: `Bin ${index + 1}`, depth: 0, density: densityBins[index] });

  const clinicalMap = new Map<string, { domain: string; pathogenic: number; benign: number; categories: Record<CategoryKey, number> }>();
  (gene.clinvar_variants || []).forEach((item) => {
    const significance = item.clinical_significance.toLowerCase();
    if (!significance.includes("pathogenic") && !significance.includes("benign")) return;
    const variant = variantDomains.get(item.variant_id);
    const domain = variant?.domain || "Other region";
    const category = variant?.category || categoryFor(item.major_consequence || "");
    const row = clinicalMap.get(domain) || { domain, pathogenic: 0, benign: 0, categories: { plof: 0, missense: 0, synonymous: 0, other: 0 } };
    if (significance.includes("pathogenic")) row.pathogenic += 1;
    if (significance.includes("benign")) row.benign += 1;
    row.categories[category] += 1; clinicalMap.set(domain, row);
  });
  const clinical = [...clinicalMap.values()].sort((a, b) => b.pathogenic + b.benign - a.pathogenic - a.benign).slice(0, 7).map((row) => {
    const total = Object.values(row.categories).reduce((sum, value) => sum + value, 0) || 1;
    return { domain: row.domain, pathogenic: row.pathogenic, benign: row.benign, weight: { plof: row.categories.plof / total * 4, missense: row.categories.missense / total * 4, synonymous: row.categories.synonymous / total * 4, other: row.categories.other / total * 4 } };
  });
  if (!clinical.length) clinical.push({ domain: "No ClinVar data", pathogenic: 0, benign: 0, weight: { plof: 1, missense: 1, synonymous: 1, other: 1 } });

  const canonicalExons = gene.transcripts?.find((transcript) => transcript.transcript_id === gene.canonical_transcript_id)?.exons.length;
  return { symbol: gene.symbol, fullName: gene.name || gene.symbol, location: `chr${gene.chrom}:${gene.start}-${gene.stop}`, ensembl: gene.gene_id, totalVariants: gene.variants.length, meanAF: frequencies.length ? frequencies.reduce((sum, value) => sum + value, 0) / frequencies.length : 0, pli: gene.gnomad_constraint?.pli ?? 0, loeuf: gene.gnomad_constraint?.oe_lof_upper ?? 0, length: gene.stop - gene.start + 1, exons: canonicalExons || gene.exons.length, sampleSize: 807162, consequences, populations, coverage, clinical, source: "gnomAD v4.1" };
}

export async function searchGnomadGenes(query: string): Promise<GeneSuggestion[]> {
  const data = await callGnomad<{ gene_search: GeneSuggestion[] }>(SEARCH_QUERY, { query });
  return data.gene_search.filter((item) => item.symbol).slice(0, 8);
}

export async function fetchGnomadGene(symbol: string): Promise<GeneData> {
  const normalized = symbol.trim().toUpperCase();
  const metadata = await callGnomad<{ gene: Omit<GeneRecord, "variants"> | null }>(GENE_QUERY, { symbol: normalized });
  if (!metadata.gene) throw new Error(`Gene ${normalized} was not found in gnomAD GRCh38.`);
  const variants = await callGnomad<{ gene: { variants: Variant[] } }>(VARIANTS_QUERY, { symbol: normalized, dataset: "gnomad_r4" });
  const supporting = await callGnomad<{ gene: Pick<GeneRecord, "coverage" | "clinvar_variants"> }>(SUPPORTING_QUERY, { symbol: normalized, dataset: "gnomad_r4" });
  return normalizeGene({ ...metadata.gene, variants: variants.gene.variants, coverage: supporting.gene.coverage, clinvar_variants: supporting.gene.clinvar_variants });
}
