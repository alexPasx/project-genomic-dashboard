# Project · Genomic Dashboard

Responsive React genomics dashboard powered by the live [gnomAD browser](https://gnomad.broadinstitute.org/) GraphQL API.

Search any GRCh38 gene symbol—such as `LRRK2`, `BRCA1`, `TP53`, `SNCA`, or `GBA`—and explore live variant, population-frequency, coverage, constraint, and ClinVar-linked data.

## Run locally

Install [Node.js 20 or newer](https://nodejs.org/), unzip the project, then use one of the following options.

### Windows

Double-click `START_DASHBOARD.bat`.

### macOS

Open Terminal in the project directory and run:

```bash
chmod +x START_DASHBOARD.command
./START_DASHBOARD.command
```

### Linux or any terminal

```bash
npm install
npm run dev:browser
```

The application opens in the computer's default browser. If it does not open automatically, visit `http://127.0.0.1:5173`.

## Production build

```bash
npm run build
npm run preview
```

## Features

- Search and autocomplete for any gene available in gnomAD GRCh38
- Live gnomAD v4 data fetched directly from the browser
- pLoF, missense/inframe, synonymous, and other consequence filters
- Variant, allele-frequency, pLI/LOEUF, gene-length, and exon metrics
- Responsive Recharts visualizations with dark styling
- JSON export for the selected gene view
- No ChatGPT login, account, backend, or API key required

## Notes

An internet connection is required to retrieve live gnomAD data. This project is intended for research and education and is not a diagnostic system.
