#!/usr/bin/env node
/**
 * sync-intersect-readiness.mjs
 *
 * Reads Intersect's Dijkstra hard fork readiness tracker (a public Google
 * Sheet, maintained by hand through self-attestation) and maps its tooling,
 * node and partner-chain rows onto the builder tools listed on the portal.
 *
 * The result is written to src/data/builder-tools/intersect-readiness.js, a
 * separate file from enriched-tools.js (which is derived from GitHub only), so
 * the page can offer the two as alternative readiness sources while using the
 * same dependency graph for both.
 *
 * Output shape:
 *   export const IntersectReadiness = {
 *     source:  { name, era, protocolVersion, sheetUrl, docsUrl, syncedAt },
 *     networks: ["musashi", "dijkstranet", "preview", "preprod", "mainnet"],
 *     tools: {
 *       "Ogmios": {
 *         networks: { musashi: "none", …, mainnet: "in-progress" },
 *         criticalPath: true,
 *         notes: "…",                       ← only when the sheet has notes
 *         rows: [{ tab: "Tooling - Tools", name: "Ogmios" }],
 *       },
 *     },
 *     unmatched: [{ tab, name }],          ← sheet rows with no portal tool
 *   }
 *
 * Statuses: "none" (no info), "reached-out", "in-progress", "ready", "n/a"
 * (counted as ready, as the sheet does), or "other" with the raw text in
 * `raw` when the sheet uses a value this script doesn't know.
 *
 * Usage:
 *   node scripts/sync-intersect-readiness.mjs [--out <file>]
 *   (or `yarn sync-readiness`; no token needed, the sheet is public)
 */

import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { parseArgs } from "util";
import { pathToFileURL, fileURLToPath } from "url";
import { resolve, join, dirname } from "path";
import { tmpdir } from "os";

const { values: args } = parseArgs({
  options: {
    out:  { type: "string", short: "o" },
    help: { type: "boolean", short: "h" },
  },
});
if (args.help) {
  console.log("Usage: node sync-intersect-readiness.mjs [--out <file>]");
  process.exit(0);
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = args.out ? resolve(args.out) : join(REPO, "src/data/builder-tools/intersect-readiness.js");
const TOOLS_FILE = join(REPO, "src/data/builder-tools/enriched-tools.js");

const SHEET_ID  = "1C1Ai_YTqwKLHtICunzbh_o0FD9XB54Kh";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing`;
const DOCS_URL  = "https://cardanoupgrades.docs.intersectmbo.org/dijkstra-era-upgrade/dijkstra-upgrade-readiness";

// Tabs whose rows can be builder tools.  Exchanges, wallets, DApps, explorers
// and guidelines are left out: they aren't listed on the portal's tools page.
const TABS = [
  "Core Infra",
  "Tooling - Libraries",
  "Tooling - Tools",
  "Tooling - Indexers",
  "Tooling - Higher Level",
  "Node Implementations",
  "Partner-chains",
];

const NETWORKS = ["musashi", "dijkstranet", "preview", "preprod", "mainnet"];
const NETWORK_HEADERS = ["Musashi", "DijkstraNet", "Preview", "PreProd", "Mainnet"];

// Sheet name → portal tool title(s), where they differ.  Names that already
// match a portal title (case-insensitively) need no entry.  An empty list
// means "known, but not a tool on the portal" (silences the unmatched report).
const ALIASES = {
  "Blaze Cardano":                       ["Blaze"],
  "Cardano Multiplatform Library":       ["cardano-multiplatform-lib"],
  "Cardano JavaScript SDK":              ["cardano-js-sdk"],
  "MeshSDK":                             ["Mesh"],
  "UTxO RPC":                            ["UTxORPC"],
  "Rosetta-Java":                        ["cardano-rosetta-java"],
  "GraphQL":                             ["cardano-graphql"],
  "cntools (guild-operators)":           ["Guild Operators Suite"],
  "SPO Scripts (@gitmachtl)":            ["StakePool Operator Scripts"],
  "DB-Sync":                             ["cardano-db-sync"],
  "Haskell - The Node":                  ["cardano-node"],
  "Cardano CLI, API & Node Integration": ["cardano-cli", "cardano-api"],
  "Full Mainnet Ready Release":          ["cardano-node"],
  // Core node components, tracked separately by Intersect, not separate tools here
  "Ledger": [], "Consensus": [], "Network": [], "Plutus Core": [],
  "Performance and Tracing": [], "Pre-Release Node": [],
};

const RANK = { none: 0, "reached-out": 1, "in-progress": 2, ready: 3, "n/a": 3, other: 0 };

function normalizeStatus(text) {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return { status: "none" };
  if (t === "ready" || t === "done") return { status: "ready" };
  if (t === "n/a" || t === "na") return { status: "n/a" };
  if (t.startsWith("in progress")) return { status: "in-progress" };
  if (t.startsWith("reached out")) return { status: "reached-out" };
  return { status: "other", raw: text.trim() };
}

// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, newlines)
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchTab(tab) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for tab "${tab}"`);
  const rows = parseCsv(await res.text());
  // An unknown tab name silently returns the first sheet; the network
  // columns tell a real tool tab apart.
  const header = rows[0] ?? [];
  const cols = NETWORK_HEADERS.map(h => header.indexOf(h));
  if (cols.some(i => i < 0)) throw new Error(`Tab "${tab}" has no per-network columns (renamed or removed?)`);
  const critCol = header.indexOf("Critical path");
  const notesCol = header.indexOf("Notes");
  return rows.slice(1)
    .filter(r => (r[0] ?? "").trim())
    .map(r => ({
      tab,
      name: r[0].trim(),
      statuses: cols.map(i => normalizeStatus(r[i])),
      criticalPath: critCol >= 0 && /^yes$/i.test((r[critCol] ?? "").trim()),
      notes: notesCol >= 0 ? (r[notesCol] ?? "").trim() : "",
    }));
}

async function loadPortalTitles() {
  const tmpDir = mkdtempSync(join(tmpdir(), "builder-tools-"));
  const tmpFile = join(tmpDir, "tools.mjs");
  writeFileSync(tmpFile, readFileSync(TOOLS_FILE, "utf8"));
  try {
    return (await import(pathToFileURL(tmpFile).href)).BuilderTools.map(t => t.title);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`\n🔍 Syncing Intersect's Dijkstra readiness tracker…`);
  const titles = await loadPortalTitles();
  const byLower = new Map(titles.map(t => [t.toLowerCase(), t]));

  const tools = {};
  const unmatched = [];
  for (const tab of TABS) {
    const rows = await fetchTab(tab);
    console.log(`   ${tab}: ${rows.length} rows`);
    for (const row of rows) {
      const targets = ALIASES[row.name] ?? [byLower.get(row.name.toLowerCase())].filter(Boolean);
      if (!targets.length) {
        if (!(row.name in ALIASES)) unmatched.push({ tab, name: row.name });
        continue;
      }
      for (const title of targets) {
        if (!titles.includes(title)) {
          console.warn(`  ⚠  Alias for "${row.name}" points at unknown portal tool "${title}"`);
          continue;
        }
        const entry = tools[title] ??= {
          networks: Object.fromEntries(NETWORKS.map(n => [n, "none"])),
          criticalPath: false,
          rows: [],
        };
        // A tool listed twice (e.g. Scalus as a library and a node) counts
        // its more advanced status per network.
        row.statuses.forEach(({ status, raw }, i) => {
          const net = NETWORKS[i];
          if (RANK[status] > RANK[entry.networks[net]] || (status === "other" && entry.networks[net] === "none")) {
            entry.networks[net] = status;
            if (raw) (entry.raw ??= {})[net] = raw;
          }
        });
        entry.criticalPath ||= row.criticalPath;
        if (row.notes) entry.notes = entry.notes ? `${entry.notes} / ${row.notes}` : row.notes;
        entry.rows.push({ tab, name: row.name });
      }
    }
  }

  const data = {
    source: {
      name: "Intersect Dijkstra hard fork readiness tracker",
      era: "dijkstra",
      protocolVersion: 12,
      sheetUrl: SHEET_URL,
      docsUrl: DOCS_URL,
      syncedAt: new Date().toISOString(),
    },
    networks: NETWORKS,
    tools: Object.fromEntries(Object.entries(tools).sort(([a], [b]) => a.localeCompare(b))),
    unmatched,
  };

  const out =
    "// Generated by scripts/sync-intersect-readiness.mjs from Intersect's public\n" +
    "// Dijkstra hard fork readiness tracker. Don't edit by hand: re-run\n" +
    "// `yarn sync-readiness` (statuses there are self-attested by each team).\n\n" +
    `export const IntersectReadiness = ${JSON.stringify(data, null, 2)};\n`;
  writeFileSync(OUT_FILE, out);

  const known = Object.values(tools).filter(t => Object.values(t.networks).some(s => s !== "none")).length;
  console.log(`\n✅  ${Object.keys(tools).length} portal tools mapped (${known} with any status) → ${OUT_FILE}`);
  if (unmatched.length)
    console.log(`   Not on the portal (${unmatched.length}): ${unmatched.map(u => u.name).join(", ")}`);
  const odd = Object.entries(tools).filter(([, t]) => t.raw).map(([n, t]) => `${n} ${JSON.stringify(t.raw)}`);
  if (odd.length) console.warn(`  ⚠  Unrecognised statuses: ${odd.join("; ")}`);
}

main().catch(err => { console.error(`\n✗  ${err.message}`); process.exit(1); });
