#!/usr/bin/env node
/**
 * analyze-builder-tools.mjs  (v3)
 *
 * Reads the Cardano developer-portal builder-tools list and produces an
 * augmented copy of that same array — each item is unchanged except that
 * a `releases` array is appended.  No new top-level structure is invented;
 * the output is a drop-in enrichment of the original data.
 *
 * The input array AND its surrounding comment header/footer are read from
 * tools.js (or whatever --input points at), so the output is a true drop-in
 * replacement: feed enriched-tools.js back in as --input to refresh the
 * `releases` data while preserving every other field and comment.  If GitHub
 * can't be reached for a tool, its previous `releases` are kept unchanged.
 *
 * Output shape (one entry):
 * {
 *   title: "Ogmios",
 *   description: "...",
 *   category: "node-access",
 *   ...                          ← all original fields preserved as-is
 *   releases: [
 *     {
 *       version: "6.9.0",
 *       latest: true,
 *       publishedAt: "2025-03-12T10:22:00Z",   ← only on latest
 *       lastCommitDate: "2025-04-01T...",        ← only on latest
 *       lastCommitSha: "a1b2c3d",                ← only on latest
 *       stars: 412,                              ← only on latest
 *       forks: 88,                               ← only on latest
 *       openIssues: 14,                          ← only on latest
 *       license: "Apache-2.0",                   ← only on latest
 *       archived: false,                         ← only on latest
 *       cardanoEra: "Conway",                    ← only on latest
 *       dependencies: ["cardano-node"],          ← title of other listed tools
 *       softReferences: ["Kupo"],                ← documented integrations (README)
 *       traits: ["conway", "babbage", "cip30"]
 *     },
 *     {
 *       version: "6.8.0",
 *       dependencies: ["cardano-node"],
 *       traits: ["babbage"]
 *     }
 *   ]
 * }
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/analyze-builder-tools.mjs [--input tools.js] [--out enriched-tools]
 *   (see README.CBIA.md for the `yarn enrich-tools` / `npm run enrich-tools` shortcut)
 *
 * No npm install needed — uses only Node.js 18+ built-ins.
 */

import { writeFileSync, readFileSync, mkdtempSync } from "fs";
import { parseArgs } from "util";
import { pathToFileURL } from "url";
import { resolve, join } from "path";
import { tmpdir } from "os";

const { values: args } = parseArgs({
  options: {
    token: { type: "string", short: "t" },
    out:   { type: "string", short: "o", default: "enriched-tools" },
    input: { type: "string", short: "i", default: "tools.js" },
    help:  { type: "boolean", short: "h" },
  },
});
if (args.help) {
  console.log("Usage: node analyze-builder-tools.mjs [--token <PAT>] [--input <file>] [--out <basename>]");
  process.exit(0);
}

const GITHUB_TOKEN = args.token ?? process.env.GITHUB_TOKEN ?? "";
const OUT_BASE     = args.out;
const INPUT_FILE   = resolve(args.input);

// ─── Read the source array + its comment header/footer from tools.js ─────────
// The array is imported (so we get the real data, including any fields the
// script never touches, e.g. `icon`).  The raw text is also read so we can
// preserve the leading comment block and the trailing "add tool above" marker
// verbatim — making the output a faithful drop-in replacement.
//
// tools.js uses ESM `export` but the project has no package.json with
// "type": "module", so Node would treat a literal `.js` import as CommonJS and
// choke on `export`.  Copy the text to a temp `.mjs` file and import that, so
// the input file can have any extension.
const inputText = readFileSync(INPUT_FILE, "utf8");
const tmpFile = join(mkdtempSync(join(tmpdir(), "builder-tools-")), "input.mjs");
writeFileSync(tmpFile, inputText);
const { BuilderTools } = await import(pathToFileURL(tmpFile).href);

const headerMatch = inputText.match(/^([\s\S]*?)export\s+const\s+BuilderTools\s*=/);
const HEADER = headerMatch ? headerMatch[1].replace(/\s*$/, "") + "\n\n" : "";

// Trailing comment lines that sit inside the array, just before the closing `];`
const footerMatch = inputText.match(/\n((?:[ \t]*\/\/[^\n]*\n)+)\];[\s]*$/);
const FOOTER = footerMatch ? footerMatch[1].replace(/\n+$/, "") : "";

// ─── JS-literal serializer (unquoted identifier keys, like the original) ──────
function jsKey(k) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
}
function toJS(value, indent = 0) {
  const pad   = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    // Inline arrays of primitives (matches the original `["rest", "haskell"]`)
    const allPrimitive = value.every(
      v => v === null || ["string", "number", "boolean"].includes(typeof v)
    );
    if (allPrimitive) return "[" + value.map(v => toJS(v)).join(", ") + "]";
    const items = value.map(v => padIn + toJS(v, indent + 1));
    return "[\n" + items.join(",\n") + ",\n" + pad + "]";
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  const props = keys.map(k => padIn + jsKey(k) + ": " + toJS(value[k], indent + 1));
  return "{\n" + props.join(",\n") + ",\n" + pad + "}";
}

// ─── Lookup: title → tool entry ───────────────────────────────────────────────
const titleMap = Object.fromEntries(BuilderTools.map(t => [t.title, t]));

// ─── Repo slug helper ─────────────────────────────────────────────────────────
function repoSlug(tool) {
  if (!tool.repository) return null;
  const m = tool.repository.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}
const slugToTitle = Object.fromEntries(
  BuilderTools.filter(t => t.repository).map(t => [repoSlug(t), t.title])
);
const allSlugs = Object.keys(slugToTitle);

// ─── GitHub API helpers ───────────────────────────────────────────────────────
const GH_API = "https://api.github.com";
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "cardano-portal-analyzer/3.0",
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
};

async function ghFetch(path, { silent = false } = {}) {
  const url = path.startsWith("http") ? path : `${GH_API}${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 200) return res.json();
    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get("x-ratelimit-reset");
      const wait  = reset ? Math.max(0, Number(reset) * 1000 - Date.now()) + 2000 : 60_000;
      if (!silent) console.warn(`  ⚠  Rate-limited — waiting ${Math.ceil(wait / 1000)}s…`);
      await new Promise(r => setTimeout(r, wait));
    } else if (res.status === 404) {
      if (!silent) console.warn(`  ✗  404: ${url}`);
      return null;
    } else {
      if (!silent) console.warn(`  ✗  HTTP ${res.status}: ${url}`);
      return null;
    }
  }
  return null;
}

async function fetchRaw(slug, filePath, branch) {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${slug}/${branch}/${filePath}`,
      { headers }
    );
    if (res.ok) return await res.text();
  } catch { /* ignore */ }
  return null;
}

// ─── Monorepo sub-manifest discovery ─────────────────────────────────────────
async function discoverManifestPaths(slug, branch) {
  const tree = await ghFetch(`/repos/${slug}/git/trees/${branch}?recursive=1`, { silent: true });
  if (!tree?.tree) return [];

  const ROOT = new Set([
    "package.json", "cabal.project", "stack.yaml", "Cargo.toml",
    "go.mod", "pom.xml", "build.gradle", "build.gradle.kts",
    "requirements.txt", "pyproject.toml",
    "pnpm-lock.yaml",   // richer dep info than package.json in pnpm monorepos
    "README.md",
  ]);
  const SUB_RE = /^(packages|subprojects|modules|libs|projects|apps|integrations)\/[^/]+\/(package\.json|build\.gradle(?:\.kts)?|pom\.xml|Cargo\.toml)$/;

  return tree.tree
    .filter(n => n.type === "blob")
    .map(n => n.path)
    .filter(p => ROOT.has(p) || SUB_RE.test(p));
}

// ─── Ecosystem-aware dependency matching ─────────────────────────────────────
// Maps ecosystem package identifiers → repo slug
const NPM_TO_SLUG = {
  "@emurgo/cardano-serialization-lib-nodejs":   "Emurgo/cardano-serialization-lib",
  "@emurgo/cardano-serialization-lib-browser":  "Emurgo/cardano-serialization-lib",
  "@emurgo/cardano-serialization-lib-asmjs":    "Emurgo/cardano-serialization-lib",
  "@dcspark/cardano-multiplatform-lib-nodejs":  "dcSpark/cardano-multiplatform-lib",
  "@dcspark/cardano-multiplatform-lib-browser": "dcSpark/cardano-multiplatform-lib",
  "@harmoniclabs/cardano-multiplatform-lib":    "dcSpark/cardano-multiplatform-lib",
  "@cardano-sdk/core":                          "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/crypto":                        "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/tx-construction":               "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/wallet":                        "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/ogmios":                        "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/util":                          "input-output-hk/cardano-js-sdk",
  "@sidan-lab/sidan-csl-rs-nodejs":            "sidan-lab/whisky",
  "@sidan-lab/sidan-csl-rs-browser":           "sidan-lab/whisky",
  "@sidan-lab/whisky":                         "sidan-lab/whisky",
  "@harmoniclabs/pebble":                      "HarmonicLabs/pebble",
  "@harmoniclabs/plutus-data":                 "HarmonicLabs/pebble",
  "@harmoniclabs/cardano-ledger-ts":           "HarmonicLabs/pebble",
  "lucid-cardano":                              "spacebudz/lucid",
  "@lucid-evolution/lucid":                    "Anastasia-Labs/lucid-evolution",
  "@lucid-evolution/core-types":               "Anastasia-Labs/lucid-evolution",
  "@lucid-evolution/provider":                 "Anastasia-Labs/lucid-evolution",
  "@lucid-evolution/utils":                    "Anastasia-Labs/lucid-evolution",
  "@meshsdk/core":                             "MeshJS/mesh",
  "@meshsdk/core-csl":                         "MeshJS/mesh",
  "@meshsdk/core-cst":                         "MeshJS/mesh",
  "@meshsdk/react":                            "MeshJS/mesh",
  "@meshsdk/transaction":                      "MeshJS/mesh",
  "@meshsdk/wallet":                           "MeshJS/mesh",
  "@meshsdk/provider":                         "MeshJS/mesh",
  "@blaze-cardano/sdk":                        "butaneprotocol/blaze-cardano",
  "@blaze-cardano/core":                       "butaneprotocol/blaze-cardano",
  "@blaze-cardano/tx":                         "butaneprotocol/blaze-cardano",
  "@cardano-ogmios/client":                    "CardanoSolutions/ogmios",
  "@cardano-ogmios/schema":                    "CardanoSolutions/ogmios",
  "@stricahq/typhonjs":                        "StricaHQ/typhonjs",
  "@fabianbormann/cardano-peer-connect":       "fabianbormann/cardano-peer-connect",
  "cardano-peer-connect":                      "fabianbormann/cardano-peer-connect",
  "@cardano-foundation/cardano-connect-with-wallet":      "cardano-foundation/cardano-connect-with-wallet",
  "@cardano-foundation/cardano-connect-with-wallet-core": "cardano-foundation/cardano-connect-with-wallet",
  "@ada-anvil/weld":                           "Cardano-Forge/weld",
  "@helios-lang/compiler":                     "HeliosLang/compiler",
  "@helios-lang/ledger":                       "HeliosLang/compiler",
};
const GO_MODULE_TO_SLUG = {
  "github.com/blinklabs-io/gouroboros": "blinklabs-io/gouroboros",
  "github.com/blinklabs-io/adder":      "blinklabs-io/adder",
  "github.com/blinklabs-io/bursa":      "blinklabs-io/bursa",
  "github.com/Salvionied/apollo":       "Salvionied/apollo",
};
const MAVEN_PREFIX_TO_SLUG = {
  "com.bloxbean.cardano:cardano-client":       "bloxbean/cardano-client-lib",
  "io.bloxbean:yaci-store":                    "bloxbean/yaci-store",
  "com.bloxbean.cardano:yaci":                 "bloxbean/yaci-store",
  "org.cardanofoundation:cf-ledger-sync":      "cardano-foundation/cf-ledger-sync",
  "org.cardanofoundation:rewards-calculation": "cardano-foundation/cf-java-rewards-calculation",
};
const CRATE_TO_SLUG = {
  "pallas":            "txpipe/pallas",
  "pallas-network":    "txpipe/pallas",
  "pallas-codec":      "txpipe/pallas",
  "pallas-traverse":   "txpipe/pallas",
  "pallas-primitives": "txpipe/pallas",
  "oura":              "txpipe/oura",
  "whisky":            "sidan-lab/whisky",
};
const HASKELL_PKG_TO_SLUG = {
  "cardano-api":            "IntersectMBO/cardano-node",
  "cardano-node":           "IntersectMBO/cardano-node",
  "cardano-ledger-core":    "IntersectMBO/cardano-node",
  "cardano-ledger-conway":  "IntersectMBO/cardano-node",
  "ouroboros-network":      "IntersectMBO/cardano-node",
  "ouroboros-consensus":    "IntersectMBO/cardano-node",
  "cardano-crypto":         "IntersectMBO/cardano-addresses",
  "cardano-addresses":      "IntersectMBO/cardano-addresses",
  "bech32":                 "IntersectMBO/bech32",
  "plutus-core":            "IntersectMBO/plutus",
  "plutus-ledger-api":      "IntersectMBO/plutus",
  "plutus-tx":              "IntersectMBO/plutus",
  "plutarch":               "Plutonomicon/plutarch-plutus",
  "cardano-db-sync":        "IntersectMBO/cardano-db-sync",
  "cardano-wallet-core":    "cardano-foundation/cardano-wallet",
  "atlas-cardano":          "geniusyield/atlas",
  "hydra-cardano-api":      "cardano-scaling/hydra",
  "ogmios":                 "CardanoSolutions/ogmios",
};
const PYTHON_PKG_TO_SLUG = {
  "pycardano": "Python-Cardano/pycardano",
  "opshin":    "OpShin/opshin",
};

function extractDepsFromTexts(textDocs, selfSlug) {
  const hard = new Set(); // manifest
  const soft = new Set(); // README mentions only

  for (const { source, text } of textDocs) {
    if (!text) continue;
    const isReadme = /readme/i.test(source);
    const target   = isReadme ? soft : hard;

    // GitHub URL slug match — works across all ecosystems as a fallback
    for (const slug of allSlugs) {
      if (slug === selfSlug) continue;
      if (new RegExp(slug.replace("/", "[/\\\\]"), "i").test(text)) target.add(slug);
    }

    if (isReadme) continue;

    // npm
    for (const [pkg, slug] of Object.entries(NPM_TO_SLUG)) {
      if (slug !== selfSlug && text.includes(`"${pkg}"`)) hard.add(slug);
    }
    // Go
    for (const [mod, slug] of Object.entries(GO_MODULE_TO_SLUG)) {
      if (slug !== selfSlug && text.includes(mod)) hard.add(slug);
    }
    // Maven
    for (const [prefix, slug] of Object.entries(MAVEN_PREFIX_TO_SLUG)) {
      if (slug !== selfSlug && text.includes(prefix)) hard.add(slug);
    }
    // Rust crates
    for (const [crate, slug] of Object.entries(CRATE_TO_SLUG)) {
      if (slug !== selfSlug &&
          (new RegExp(`^${crate}\\s*[=.]`, "m").test(text) ||
           new RegExp(`"${crate}"`, "g").test(text))) {
        hard.add(slug);
      }
    }
    // Haskell
    for (const [pkg, slug] of Object.entries(HASKELL_PKG_TO_SLUG)) {
      if (slug !== selfSlug && new RegExp(`\\b${pkg}\\b`).test(text)) hard.add(slug);
    }
    // Python
    for (const [pkg, slug] of Object.entries(PYTHON_PKG_TO_SLUG)) {
      if (slug !== selfSlug && new RegExp(`\\b${pkg}\\b`, "i").test(text)) hard.add(slug);
    }
  }

  return {
    hard: [...hard].sort().map(s => slugToTitle[s]).filter(Boolean),
    soft: [...soft].filter(s => !hard.has(s)).sort().map(s => slugToTitle[s]).filter(Boolean),
  };
}

// ─── Cardano era + CIP trait detection ───────────────────────────────────────
const ERA_TRAITS = ["byron", "shelley", "allegra", "mary", "alonzo", "babbage", "conway"];
const CIP_RE = /\bCIP-?(\d+)\b/gi;
// CIP numbers that appear frequently in Cardano tooling READMEs and are worth surfacing
const NOTABLE_CIPS = new Set([
  "1", "2", "3", "8", "9", "14", "19", "21", "25", "26", "27",
  "30", "31", "32", "33", "34", "36", "45", "50", "54", "57",
  "67", "68", "86", "95", "100", "104", "108", "119", "129",
]);

function detectTraits(texts) {
  const traits = new Set();
  for (const text of texts) {
    if (!text) continue;
    for (const era of ERA_TRAITS) {
      if (new RegExp(`\\b${era}\\b`, "i").test(text)) traits.add(era);
    }
    let m;
    while ((m = CIP_RE.exec(text)) !== null) {
      if (NOTABLE_CIPS.has(m[1])) traits.add(`cip${m[1]}`);
    }
  }
  // Return eras first (chronological), then CIPs (numeric)
  const eras = ERA_TRAITS.filter(e => traits.has(e));
  const cips = [...traits].filter(t => t.startsWith("cip")).sort((a, b) => {
    return parseInt(a.slice(3)) - parseInt(b.slice(3));
  });
  return [...eras, ...cips];
}

function latestEra(traits) {
  for (let i = ERA_TRAITS.length - 1; i >= 0; i--) {
    if (traits.includes(ERA_TRAITS[i])) return ERA_TRAITS[i];
  }
  return "unknown";
}

// ─── GitHub releases fetching ─────────────────────────────────────────────────
async function fetchReleases(slug, limit = 10) {
  const data = await ghFetch(`/repos/${slug}/releases?per_page=${limit}`, { silent: true });
  if (!Array.isArray(data)) return null; // fetch failed (distinct from "no releases")
  return data.map(r => ({
    version:     r.tag_name?.replace(/^v/, "") ?? r.name,
    tag:         r.tag_name,
    publishedAt: r.published_at,
    prerelease:  r.prerelease,
    body:        r.body ?? "",
  }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 Enriching ${BuilderTools.length} builder-tool entries from ${args.input} (v3)…`);
  if (!GITHUB_TOKEN)
    console.warn("⚠  No GITHUB_TOKEN — rate limit: 60 req/hr. Will be slow.\n");

  const enriched = [];

  for (const tool of BuilderTools) {
    const { title } = tool;
    const slug = repoSlug(tool);
    console.log(`\n→ ${title}${slug ? ` (${slug})` : " [no repository]"}`);

    // Tools without a GitHub repository preserve any manually-curated releases
    if (!slug) {
      enriched.push({ ...tool, releases: tool.releases ?? [] });
      continue;
    }

    // On a failed fetch, keep whatever `releases` the input already had, so a
    // refresh run (--input enriched-tools.js) never wipes good data.
    const keepPrevious = reason => {
      console.warn(`  ✗  ${reason} — keeping previous releases (${(tool.releases ?? []).length})`);
      enriched.push({ ...tool, releases: tool.releases ?? [] });
    };

    // 1. Core repo metadata
    const meta = await ghFetch(`/repos/${slug}`);
    if (!meta) {
      keepPrevious("Could not fetch metadata");
      continue;
    }
    const branch = meta.default_branch ?? "main";

    // 2. Latest commit on default branch
    const branchData = await ghFetch(`/repos/${slug}/branches/${branch}`, { silent: true });
    const lastCommitDate = branchData?.commit?.commit?.author?.date ?? null;
    const lastCommitSha  = branchData?.commit?.sha?.slice(0, 7) ?? null;

    // 3. Discover manifests (root + monorepo sub-packages)
    const manifestPaths = await discoverManifestPaths(slug, branch);
    if (!manifestPaths.some(p => /readme/i.test(p))) manifestPaths.push("README.md");

    // 4. Fetch manifest text (cap at 25 files to avoid rate-limit blowout)
    const textDocs = [];
    for (const path of manifestPaths.slice(0, 25)) {
      const text = await fetchRaw(slug, path, branch);
      if (text) textDocs.push({ source: path, text });
      await new Promise(r => setTimeout(r, 80));
    }
    console.log(`   ↳  fetched ${textDocs.length} manifest/doc files`);
    if (textDocs.length === 0 && tool.releases?.length) {
      keepPrevious("Could not fetch any manifest/doc files");
      continue;
    }

    // 5. Dependencies and traits from latest manifests
    const { hard: latestDeps, soft: latestSoft } = extractDepsFromTexts(textDocs, slug);
    const allTexts   = textDocs.map(d => d.text);
    const latestTraits = detectTraits(allTexts);
    const latestEraStr = latestEra(latestTraits);

    // 6. GitHub releases list
    const ghReleases = await fetchReleases(slug, 10);
    if (ghReleases === null) {
      keepPrevious("Could not fetch releases list");
      continue;
    }

    // 7. Build the `releases` array
    //    Latest release = the first entry from GitHub releases (or a synthetic
    //    "tip" entry if the repo has no formal releases).
    //    Only the latest release carries the enriched repo-level metadata.

    let releases = [];

    if (ghReleases.length === 0) {
      // No formal releases — synthesise a "tip" entry from the default branch
      releases = [{
        version:       "tip",
        latest:        true,
        publishedAt:   lastCommitDate,
        lastCommitDate,
        lastCommitSha,
        stars:         meta.stargazers_count,
        forks:         meta.forks_count,
        openIssues:    meta.open_issues_count,
        license:       meta.license?.spdx_id ?? meta.license?.name ?? null,
        archived:      meta.archived,
        cardanoEra:    latestEraStr,
        dependencies:  latestDeps,
        softReferences: latestSoft,
        traits:        latestTraits,
      }];
    } else {
      // Build an entry per GitHub release.
      // For releases after the first, we can only infer traits from the
      // release body (changelog) — we don't re-fetch old manifests.
      releases = ghReleases.map((rel, idx) => {
        const isLatest = idx === 0;
        const releaseTraits = detectTraits([rel.body]);

        if (isLatest) {
          return {
            version:       rel.version,
            tag:           rel.tag,
            latest:        true,
            prerelease:    rel.prerelease || undefined,
            publishedAt:   rel.publishedAt,
            lastCommitDate,
            lastCommitSha,
            stars:         meta.stargazers_count,
            forks:         meta.forks_count,
            openIssues:    meta.open_issues_count,
            license:       meta.license?.spdx_id ?? meta.license?.name ?? null,
            archived:      meta.archived,
            cardanoEra:    latestEraStr,
            dependencies:  latestDeps,
            softReferences: latestSoft.length ? latestSoft : undefined,
            traits:        latestTraits,
          };
        } else {
          // Prior releases: minimal shape — version, deps (same as latest, we
          // can't easily retrieve old lockfiles), and traits from release notes.
          return {
            version:      rel.version,
            tag:          rel.tag,
            prerelease:   rel.prerelease || undefined,
            publishedAt:  rel.publishedAt,
            dependencies: latestDeps, // best approximation without checkout
            traits:       releaseTraits,
          };
        }
      });
    }

    // Strip undefined values for clean JSON
    releases = releases.map(r => Object.fromEntries(
      Object.entries(r).filter(([, v]) => v !== undefined && v !== null)
    ));

    const latest = releases.find(r => r.latest);
    console.log(`   ✓  ${releases.length} release(s) | era: ${latestEraStr} | deps: ${latestDeps.join(", ") || "none"}`);

    enriched.push({ ...tool, releases });
    await new Promise(r => setTimeout(r, 400));
  }

  // ─── Output: enriched tools array as JS export (mirrors original format) ──
  // Reuse the original file's comment header and trailing marker so the result
  // is a drop-in replacement, and serialize with unquoted keys via toJS().
  const items = enriched.map(t => "  " + toJS(t, 1));
  const arrayBody = items.join(",\n") + ",\n" + (FOOTER ? FOOTER + "\n" : "");
  const jsOut = `${HEADER}export const BuilderTools = [\n${arrayBody}];\n`;
  writeFileSync(`${OUT_BASE}.js`, jsOut);
  console.log(`\n✅  JS   → ${OUT_BASE}.js`);

  // Also write plain JSON for easy downstream consumption
  writeFileSync(`${OUT_BASE}.json`, JSON.stringify(enriched, null, 2));
  console.log(`✅  JSON → ${OUT_BASE}.json`);

  // ─── Summary ──────────────────────────────────────────────────────────────
  const withDeps    = enriched.filter(t => t.releases?.[0]?.dependencies?.length > 0).length;
  const withRels    = enriched.filter(t => t.releases?.length > 0).length;
  console.log(`\nDone. ${enriched.length} tools enriched, ${withRels} with releases, ${withDeps} with detected dependencies.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
