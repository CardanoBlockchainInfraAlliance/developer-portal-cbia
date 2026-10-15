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
 *       traits: ["conway", "babbage", "plutus-v3", "cip30"],
 *       conwayReady: true                        ← only on latest; absent = unknown
 *       dijkstraReady: true                      ← same, for the next era (Dijkstra)
 *     },
 *     {
 *       version: "6.8.0",                        ← older releases: no deps
 *       traits: ["babbage"]                      ← from release notes only
 *     }
 *   ]
 * }
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/analyze-builder-tools.mjs [--input tools.js] [--out enriched-tools]
 *     [--releases-from enriched-tools.js] [--extra-from-devex [<url|file>]] [--offline] [--overrides <file>]
 *   (see README.CBIA.md for the `yarn enrich-tools` / `npm run enrich-tools` shortcut)
 *
 * Hand-curated corrections live in src/data/builder-tools/enriched-overrides.js
 * and are applied to each tool's latest release at the end of every run.
 *
 * No npm install needed — uses only Node.js 18+ built-ins.
 */

import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { parseArgs } from "util";
import { pathToFileURL, fileURLToPath } from "url";
import { resolve, join, dirname } from "path";
import { tmpdir } from "os";

// IOG DevX's Cardano tooling map: a wider list of tools than the portal's
// tools.js, read by --extra-from-devex.  Fetching it saves a snapshot next to
// the other builder-tools data, so the copy last used is kept for reference
// and --offline runs can read it.
const DEVX_DEFAULT_URL = "https://github.com/input-output-hk/devx-updates/blob/main/data/cardano-graph.json";
const DEVX_SNAPSHOT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/builder-tools/devx-cardano-graph.json");

// --extra-from-devex takes an optional value (a URL or a file), which
// parseArgs can't express: given bare, fill in the default URL.
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--extra-from-devex" && (i + 1 === argv.length || argv[i + 1].startsWith("-")))
    argv.splice(i + 1, 0, DEVX_DEFAULT_URL);
}

const { values: args } = parseArgs({
  args: argv,
  options: {
    token: { type: "string", short: "t" },
    out:   { type: "string", short: "o", default: "enriched-tools" },
    input: { type: "string", short: "i", default: "tools.js" },
    "releases-from": { type: "string", short: "r" },
    "extra-from-devex": { type: "string" },
    offline: { type: "boolean" },
    overrides: { type: "string" },
    help:  { type: "boolean", short: "h" },
  },
});
if (args.help) {
  console.log("Usage: node analyze-builder-tools.mjs [--token <PAT>] [--input <file>] [--out <basename>]\n" +
              "         [--releases-from <file>] [--extra-from-devex [<url|file>]] [--offline] [--overrides <file>]");
  process.exit(0);
}

const GITHUB_TOKEN = args.token ?? process.env.GITHUB_TOKEN ?? "";
// Without a token GitHub allows 60 requests an hour, far short of a full run,
// which would stall for hours on rate limits.  Stop before doing anything.
if (!GITHUB_TOKEN && !args.offline) {
  console.error("✗  No GitHub token: set GITHUB_TOKEN (see README.CBIA.md, step 2), or pass --offline. Nothing was done.");
  process.exit(1);
}
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
async function loadModule(text) {
  const tmpDir  = mkdtempSync(join(tmpdir(), "builder-tools-"));
  const tmpFile = join(tmpDir, "input.mjs");
  writeFileSync(tmpFile, text);
  try {
    return await import(pathToFileURL(tmpFile).href);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
const loadBuilderTools = async text => (await loadModule(text)).BuilderTools;
const inputText = readFileSync(INPUT_FILE, "utf8");
const InputTools = await loadBuilderTools(inputText);

// ─── --extra-from-devex: tools from IOG DevX's map that the input lacks ──────
// Only the tool list is taken from the map (name, description, links,
// category, languages); its dependency edges aren't used, since dependencies
// are detected from each repository like every other tool's.  Added tools
// carry `source: "devx"` and are listed after the input's.  On a re-run with
// the flag they are dropped and re-derived from the map (keeping their
// `releases`), so edits to the map reach them and tools that have since
// joined tools.js aren't listed twice.
const DEVX_CATEGORY = {
  sc: "smart-contracts", sdk: "sdk", api: "api", idx: "indexer", l2: "l2",
  wallet: "wallet", ops: "operations", gov: "governance", oracle: "oracle",
  infra: "integration",
  // Split by the map's role, to fit the portal's finer categories
  node: n => n.role === "full-node" ? "node" : n.role === "wallet" ? "wallet" : "node-access",
  dev: n => ["contract-testing", "contract-debugger", "inspector"].includes(n.role) ? "testing" : "dev-env",
};
// The map's languages → language and interface properties: the portal's
// (tags.js), plus the languages this fork adds (enriched-tags.js).  Values that
// aren't programming languages ("Multi", "Service", "JSON", "Vue"…) are left out.
const DEVX_PROPERTY = {
  "TypeScript": "typescript", "TS": "typescript", "JavaScript": "javascript", "JS": "javascript",
  "Python": "python", "Rust": "rust", "Haskell": "haskell", "Java": "java", ".NET": "net",
  "C#": "net", // the portal files C# tools under .NET
  "Go": "golang", "Scala": "scala", "Scala 3": "scala", "C": "c", "PureScript": "purescript",
  "Elm": "elm", "PHP": "php", "Swift": "swift",
  "Aiken": "aiken", "Bash": "bash", "C++": "cpp", "Dart": "dart", "Elixir": "elixir",
  "Kotlin": "kotlin", "Nix": "nix", "Pluto": "pluto", "Solidity": "solidity", "UPLC": "uplc",
  "REST API": "rest", "REST": "rest", "gRPC spec": "grpc", "WS": "websocket",
};
// Categories and properties the mappings above may produce, so a typo in them
// stops the run instead of writing a value the page doesn't know
const TAGS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/builder-tools");
async function loadValidTags() {
  const tags  = await loadModule(readFileSync(join(TAGS_DIR, "tags.js"), "utf8"));
  const extra = await loadModule(readFileSync(join(TAGS_DIR, "enriched-tags.js"), "utf8"));
  return {
    categories: new Set([...Object.keys(tags.Categories), ...Object.keys(extra.ExtraCategories)]),
    properties: new Set([...Object.keys(tags.Properties), ...Object.keys(extra.ExtraLanguageProperties)]),
  };
}
const normName = s => (s ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
// IOG repos moved from input-output-hk to IntersectMBO; GitHub redirects the
// old slugs, so treat the two orgs as one when comparing repositories.
const normSlug = s => s?.toLowerCase().replace(/^input-output-hk\//, "intersectmbo/") ?? null;
const githubSlug = url => url?.match(/github\.com\/([^/]+\/[^/#?]+?)(?:\.git)?\/?$/)?.[1] ?? null;

async function loadDevxGraph(source) {
  if (!/^https?:/.test(source)) return JSON.parse(readFileSync(resolve(source), "utf8"));
  if (args.offline) {
    if (!existsSync(DEVX_SNAPSHOT)) throw new Error(`--offline needs a snapshot at ${DEVX_SNAPSHOT}; run once online first`);
    console.log(`   --extra-from-devex: reading the snapshot ${DEVX_SNAPSHOT}`);
    return JSON.parse(readFileSync(DEVX_SNAPSHOT, "utf8"));
  }
  // A github.com/…/blob/… page link is fetched from raw.githubusercontent.com
  const url = source.replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//, "https://raw.githubusercontent.com/$1/");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`--extra-from-devex: HTTP ${res.status} from ${url}`);
  const text = await res.text();
  const graph = JSON.parse(text);
  writeFileSync(DEVX_SNAPSHOT, text.endsWith("\n") ? text : text + "\n");
  console.log(`   --extra-from-devex: fetched ${url} (generated ${graph.meta?.generated ?? "?"}), snapshot → ${DEVX_SNAPSHOT}`);
  return graph;
}

function addDevxTools(inputTools, graph, valid) {
  for (const p of new Set(Object.values(DEVX_PROPERTY)))
    if (!valid.properties.has(p)) throw new Error(`DEVX_PROPERTY maps to "${p}", which isn't in tags.js or enriched-tags.js`);
  const previous = Object.fromEntries(inputTools.filter(t => t.source === "devx").map(t => [t.title, t.releases]));
  const tools = inputTools.filter(t => t.source !== "devx");
  const names = new Set(tools.map(t => normName(t.title)));
  const slugs = new Set(tools.map(t => normSlug(githubSlug(t.repository))).filter(Boolean));
  // A repo the map gives several tools (Plutus Core and Plinth; cardano-node,
  // cardano-submit-api and cardano-testnet) can't identify one of them, so
  // those are matched by name only.
  const repoCount = {};
  for (const n of graph.nodes) if (n.repo) repoCount[normSlug(n.repo)] = (repoCount[normSlug(n.repo)] ?? 0) + 1;

  const added = [], dropped = new Set();
  for (const n of graph.nodes) {
    const slug = normSlug(n.repo);
    if (names.has(normName(n.name)) || (slug && repoCount[slug] === 1 && slugs.has(slug))) continue;
    const category = typeof DEVX_CATEGORY[n.category] === "function" ? DEVX_CATEGORY[n.category](n) : DEVX_CATEGORY[n.category];
    if (!category) { console.warn(`  ⚠  devx: "${n.name}" has unknown category "${n.category}", skipped`); continue; }
    if (!valid.categories.has(category)) throw new Error(`DEVX_CATEGORY maps to "${category}", which isn't in tags.js or enriched-tags.js`);
    const langs = [...new Set([...(n.languages ?? []), ...(n.devLangs ?? [])])];
    for (const l of langs) if (!DEVX_PROPERTY[l]) dropped.add(l);
    // `repoUrl` isn't always a repository (a docs page, a marketplace listing)
    const repository = githubSlug(n.repoUrl) ? n.repoUrl : null;
    const tool = {
      title: n.name,
      description: n.description,
      website: n.website ?? (repository ? null : n.repoUrl) ?? n.docsUrl ?? null,
      docs: n.docsUrl ?? null,
      repository,
      category,
      properties: [...new Set(langs.map(l => DEVX_PROPERTY[l]).filter(Boolean))],
      source: "devx",
      devxId: n.id,
    };
    const releases = previous[n.name] ?? RELEASES_FROM[n.name];
    if (releases) tool.releases = releases;
    added.push(tool);
    names.add(normName(n.name));
  }
  console.log(`   --extra-from-devex: ${graph.nodes.length} tools in the map, ${graph.nodes.length - added.length} already listed, ${added.length} added` +
              ` (${added.filter(t => !t.repository).length} with no repository)`);
  if (dropped.size) console.log(`   --extra-from-devex: values that aren't languages, left out: ${[...dropped].sort().join(", ")}`);
  return [...tools, ...added];
}

// --releases-from: a previous output whose `releases` (matched by title) are
// used wherever the input has none, i.e. when rebuilding from upstream
// tools.js.  This keeps hand-curated `releases` on tools without a repository,
// and gives tools whose GitHub fetch fails their last known data.
const RELEASES_FROM = args["releases-from"]
  ? Object.fromEntries(
      (await loadBuilderTools(readFileSync(resolve(args["releases-from"]), "utf8")))
        .filter(t => t.releases)
        .map(t => [t.title, t.releases])
    )
  : {};
const previousReleases = tool => tool.releases ?? RELEASES_FROM[tool.title] ?? [];

const BuilderTools = args["extra-from-devex"]
  ? addDevxTools(InputTools, await loadDevxGraph(args["extra-from-devex"]), await loadValidTags())
  : InputTools;

// --overrides: hand-curated corrections, keyed by tool title (see the comment
// at the top of that file for the format).  Defaults to the repo's
// enriched-overrides.js, found relative to this script; skipped if missing.
const OVERRIDES_FILE = args.overrides
  ? resolve(args.overrides)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/builder-tools/enriched-overrides.js");
const OVERRIDES = existsSync(OVERRIDES_FILE)
  ? (await loadModule(readFileSync(OVERRIDES_FILE, "utf8"))).EnrichedOverrides ?? {}
  : {};

// Applies a tool's override to its latest release (creating a bare one if the
// tool has none), and records the touched fields in `overridden`.  A field set
// to a value replaces the detected one; a field set to { add, remove } edits a
// detected list.  Applying the same override twice gives the same result, so
// re-feeding an output that already has it applied is safe.
function applyOverrides(tool) {
  const ov = OVERRIDES[tool.title];
  // A note-only entry is a flag for reviewers and changes nothing
  if (!ov || Object.keys(ov).every(k => k === "note")) return tool;
  const releases = (tool.releases ?? []).map(r => ({ ...r }));
  let latest = releases.find(r => r.latest);
  if (!latest) releases.unshift(latest = { latest: true });

  const touched = [];
  for (const [field, val] of Object.entries(ov)) {
    if (field === "note") continue;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const list = new Set(latest[field] ?? []);
      for (const x of val.remove ?? []) list.delete(x);
      for (const x of val.add ?? []) list.add(x);
      latest[field] = [...list];
    } else {
      latest[field] = val;
    }
    touched.push(field);
  }
  // A curated hard dependency shouldn't also show as a soft reference
  if (latest.softReferences && latest.dependencies) {
    latest.softReferences = latest.softReferences.filter(t => !latest.dependencies.includes(t));
    if (!latest.softReferences.length) delete latest.softReferences;
  }
  latest.overridden = touched;
  return { ...tool, releases };
}

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
// Several tools can share a repo (cardano-node + cardano-testnet; cardano-api
// + cardano-rpc + cardano-wasm).  A match on that repo is credited to the tool
// named after it, else to the first one listed, never to whichever comes last.
const slugToTitle = {};
for (const t of BuilderTools) {
  const slug = repoSlug(t);
  if (!slug) continue;
  const named = t.title.toLowerCase() === slug.split("/")[1].toLowerCase();
  if (!(slug in slugToTitle) || named) slugToTitle[slug] = t.title;
}
const allSlugs = Object.keys(slugToTitle);

// One regex per slug, matching `owner/repo` as a whole: not preceded by a
// character that could extend the owner, not followed by one that could extend
// the repo name (so "MeshJS/mesh" doesn't match "MeshJS/mesh-contracts"), but
// allowing a trailing ".git" or sentence-ending ".".  Case-insensitive, since
// GitHub slugs are.
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slugRegexes = allSlugs.map(slug => {
  const [owner, repo] = slug.split("/").map(escapeRe);
  return [slug, new RegExp(`(?<![\\w.-])${owner}[/\\\\]${repo}(?![\\w-]|\\.(?!git\\b)\\w)`, "i")];
});

// ─── GitHub API helpers ───────────────────────────────────────────────────────
const GH_API = "https://api.github.com";
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "cardano-portal-analyzer/3.0",
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
};

// How long to wait before retrying a rate-limited response, or null if the
// response isn't a rate limit.  GitHub signals its primary limit with
// `x-ratelimit-remaining: 0` (+ `x-ratelimit-reset`) and its secondary limit
// with `retry-after`, on either 403 or 429.  A 403 without those headers is a
// plain "forbidden" and retrying won't help.
function rateLimitWait(res) {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) return Number(retryAfter) * 1000 + 1000;
  const reset = res.headers.get("x-ratelimit-reset");
  if (res.headers.get("x-ratelimit-remaining") === "0" && reset)
    return Math.max(0, Number(reset) * 1000 - Date.now()) + 2000;
  return res.status === 429 ? 60_000 : null;
}

async function ghFetch(path, { silent = false } = {}) {
  const url = path.startsWith("http") ? path : `${GH_API}${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 200) return res.json();
    if (res.status === 401) {
      // Bad token: every request would fail the same way, so stop before
      // writing an output that silently kept every tool's old data.
      console.error(`\n✗  HTTP 401 from GitHub: GITHUB_TOKEN is invalid, expired or revoked. Nothing was written.`);
      process.exit(1);
    }
    const wait = rateLimitWait(res);
    if (wait !== null) {
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
  const url = `https://raw.githubusercontent.com/${slug}/${branch}/${filePath}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return await res.text();
      const wait = rateLimitWait(res);
      if (wait === null) return null;
      console.warn(`  ⚠  Rate-limited on raw files — waiting ${Math.ceil(wait / 1000)}s…`);
      await new Promise(r => setTimeout(r, wait));
    } catch {
      return null;
    }
  }
  return null;
}

// ─── Monorepo sub-manifest discovery ─────────────────────────────────────────
const ROOT_MANIFESTS = new Set([
  "package.json", "cabal.project", "stack.yaml", "Cargo.toml",
  "go.mod", "pom.xml", "build.gradle", "build.gradle.kts",
  "requirements.txt", "pyproject.toml",
  "pnpm-lock.yaml",   // richer dep info than package.json in pnpm monorepos
  "README.md",
]);
const SUB_DIRS = ["packages", "subprojects", "modules", "libs", "projects", "apps", "integrations"];
const SUB_RE = new RegExp(
  `^(${SUB_DIRS.join("|")})\\/[^/]+\\/(package\\.json|build\\.gradle(?:\\.kts)?|pom\\.xml|Cargo\\.toml)$`
);
// Sub-package manifests are fetched from raw.githubusercontent.com, which
// doesn't count against the API rate limit, but each one still costs a request.
const MAX_SUB_MANIFESTS = 40;

// Returns root manifests first, then up to MAX_SUB_MANIFESTS sub-package ones,
// so a large monorepo can't crowd out the root files.
async function discoverManifestPaths(slug, branch) {
  const tree = await ghFetch(`/repos/${slug}/git/trees/${branch}?recursive=1`, { silent: true });
  if (!tree?.tree) return [];

  let paths = tree.tree.filter(n => n.type === "blob").map(n => n.path);

  if (tree.truncated) {
    // The recursive listing hit GitHub's size limit and may be missing files.
    // Rebuild it from the root level plus a recursive listing of each
    // monorepo directory, which are much smaller.
    const rootTree = await ghFetch(`/repos/${slug}/git/trees/${branch}`, { silent: true });
    const rootEntries = rootTree?.tree ?? [];
    paths = rootEntries.filter(n => n.type === "blob").map(n => n.path);
    for (const dir of rootEntries.filter(n => n.type === "tree" && SUB_DIRS.includes(n.path))) {
      const sub = await ghFetch(`/repos/${slug}/git/trees/${dir.sha}?recursive=1`, { silent: true });
      for (const n of sub?.tree ?? []) {
        if (n.type === "blob") paths.push(`${dir.path}/${n.path}`);
      }
    }
  }

  const root = paths.filter(p => ROOT_MANIFESTS.has(p));
  const sub  = paths.filter(p => SUB_RE.test(p));
  if (sub.length > MAX_SUB_MANIFESTS)
    console.warn(`   ⚠  ${sub.length} sub-package manifests, reading the first ${MAX_SUB_MANIFESTS}`);
  return [...root, ...sub.slice(0, MAX_SUB_MANIFESTS)];
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
  "@anastasia-labs/cardano-multiplatform-lib-nodejs":  "dcSpark/cardano-multiplatform-lib",
  "@anastasia-labs/cardano-multiplatform-lib-browser": "dcSpark/cardano-multiplatform-lib",
  "@cardano-sdk/core":                          "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/crypto":                        "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/tx-construction":               "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/wallet":                        "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/ogmios":                        "input-output-hk/cardano-js-sdk",
  "@cardano-sdk/util":                          "input-output-hk/cardano-js-sdk",
  "@sidan-lab/sidan-csl-rs-nodejs":            "sidan-lab/whisky",
  "@sidan-lab/sidan-csl-rs-browser":           "sidan-lab/whisky",
  "@sidan-lab/whisky":                         "sidan-lab/whisky",
  "@sidan-lab/whisky-js-nodejs":               "sidan-lab/whisky",
  "@sidan-lab/whisky-js-browser":              "sidan-lab/whisky",
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
  "cardano-api":            "IntersectMBO/cardano-api",
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
    for (const [slug, re] of slugRegexes) {
      if (slug !== selfSlug && re.test(text)) target.add(slug);
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
const ERA_TRAITS = ["byron", "shelley", "allegra", "mary", "alonzo", "babbage", "conway", "dijkstra"];
// An era named as a word; for Dijkstra, not the shortest-path algorithm
const eraRegex = era => era === "dijkstra"
  ? /\bdijkstra\b(?!['’]s\b|\s+algorithm)/i
  : new RegExp(`\\b${era}\\b`, "i");
const CIP_RE = /\bCIP-?(\d+)\b/gi;
// CIP numbers that appear frequently in Cardano tooling READMEs and are worth
// surfacing, plus the Dijkstra era's (112, 118, 159, 167, 176)
const NOTABLE_CIPS = new Set([
  "1", "2", "3", "8", "9", "14", "19", "21", "25", "26", "27",
  "30", "31", "32", "33", "34", "36", "45", "50", "54", "57",
  "67", "68", "86", "95", "100", "104", "105", "108", "112", "118", "119", "129",
  "159", "167", "176", "1694",
]);
// Plutus V3 only exists from the Conway era on, so it's evidence of Conway
// support; Plutus V4 comes with Dijkstra
const PLUTUS_V3_RE = /\bplutus[\s_-]?v3\b/i;
const PLUTUS_V4_RE = /\bplutus[\s_-]?v4\b/i;

// Evidence that a tool supports the current (Conway) era: naming the era,
// Plutus V3, or the Conway governance CIPs.  Absence means "unknown", not "no";
// a confirmed "no" (or "yes") comes from the overrides file.
const CONWAY_EVIDENCE = new Set([
  "conway", "plutus-v3", "cip95", "cip100", "cip105", "cip108", "cip119", "cip129", "cip1694",
]);
const isConwayReady = traits => (traits ?? []).some(t => CONWAY_EVIDENCE.has(t));

// Evidence that a tool supports the next era, Dijkstra (protocol version 12):
// naming the era, Plutus V4, or a Dijkstra CIP a tool would implement (CIP-112
// guard scripts, CIP-118 nested transactions, CIP-159 account addresses,
// CIP-167 no isValid, CIP-176 block body serialization; Intersect's Dijkstra
// upgrade overview lists the era's scope).  The consensus and parameter CIPs
// in that scope (Leios, Peras, staking rewards, fees) aren't evidence: a tool
// gets them from the node.  Absence means "unknown", as for Conway.
const DIJKSTRA_EVIDENCE = new Set([
  "dijkstra", "plutus-v4", "cip112", "cip118", "cip159", "cip167", "cip176",
]);
const isDijkstraReady = traits => (traits ?? []).some(t => DIJKSTRA_EVIDENCE.has(t));
// Each readiness flag on a latest release, and how it's detected
const READINESS = { conwayReady: isConwayReady, dijkstraReady: isDijkstraReady };

function detectTraits(texts) {
  const traits = new Set();
  for (const text of texts) {
    if (!text) continue;
    for (const era of ERA_TRAITS) {
      if (eraRegex(era).test(text)) traits.add(era);
    }
    if (PLUTUS_V3_RE.test(text)) traits.add("plutus-v3");
    if (PLUTUS_V4_RE.test(text)) traits.add("plutus-v4");
    let m;
    while ((m = CIP_RE.exec(text)) !== null) {
      // CIP-0118 and CIP-118 are the same CIP
      const n = String(parseInt(m[1], 10));
      if (NOTABLE_CIPS.has(n)) traits.add(`cip${n}`);
    }
  }
  // Return eras first (chronological), then Plutus versions, then CIPs (numeric)
  const eras = ERA_TRAITS.filter(e => traits.has(e));
  const plutus = ["plutus-v3", "plutus-v4"].filter(p => traits.has(p));
  const cips = [...traits].filter(t => t.startsWith("cip")).sort((a, b) => {
    return parseInt(a.slice(3)) - parseInt(b.slice(3));
  });
  return [...eras, ...plutus, ...cips];
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
  if (args.offline)
    console.log("   --offline: no GitHub requests, every tool keeps its previous releases.");

  const enriched = [];

  for (const tool of BuilderTools) {
    const { title } = tool;
    const slug = repoSlug(tool);
    console.log(`\n→ ${title}${slug ? ` (${slug})` : " [no repository]"}`);

    // Tools without a GitHub repository preserve any manually-curated releases
    if (!slug || args.offline) {
      enriched.push({ ...tool, releases: previousReleases(tool) });
      continue;
    }

    // On a failed fetch, keep whatever `releases` the input already had, so a
    // refresh run (--input enriched-tools.js) never wipes good data.
    const keepPrevious = reason => {
      const releases = previousReleases(tool);
      console.warn(`  ✗  ${reason} — keeping previous releases (${releases.length})`);
      enriched.push({ ...tool, releases });
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

    // 4. Fetch manifest text
    const textDocs = [];
    for (const path of manifestPaths) {
      const text = await fetchRaw(slug, path, branch);
      if (text) textDocs.push({ source: path, text });
      await new Promise(r => setTimeout(r, 80));
    }
    console.log(`   ↳  fetched ${textDocs.length} manifest/doc files`);
    if (textDocs.length === 0 && previousReleases(tool).length) {
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
      // Build an entry per GitHub release, newest first.
      // For releases other than the latest, we can only infer traits from the
      // release body (changelog) — we don't re-fetch old manifests.
      // "Latest" is the newest stable release, as on GitHub; only if every
      // listed release is a prerelease does the newest prerelease count.
      const stableIdx = ghReleases.findIndex(r => !r.prerelease);
      const latestIdx = stableIdx === -1 ? 0 : stableIdx;
      releases = ghReleases.map((rel, idx) => {
        const isLatest = idx === latestIdx;
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
          // Prior releases: minimal shape — version and traits from release
          // notes.  No dependencies: they'd need that release's manifests, and
          // copying the latest ones would present a guess as data.
          return {
            version:      rel.version,
            tag:          rel.tag,
            prerelease:   rel.prerelease || undefined,
            publishedAt:  rel.publishedAt,
            traits:       releaseTraits,
          };
        }
      });
    }

    // Strip undefined values for clean JSON
    releases = releases.map(r => Object.fromEntries(
      Object.entries(r).filter(([, v]) => v !== undefined && v !== null)
    ));

    console.log(`   ✓  ${releases.length} release(s) | era: ${latestEraStr} | deps: ${latestDeps.join(", ") || "none"}`);

    enriched.push({ ...tool, releases });
    await new Promise(r => setTimeout(r, 400));
  }

  // ─── Derived compatibility: conwayReady, dijkstraReady ────────────────────
  // Recomputed from the latest release's traits on every run (so it also works
  // with --offline), before overrides, which can set them either way.
  for (const t of enriched) {
    const latest = t.releases?.find(r => r.latest);
    if (!latest) continue;
    for (const [flag, isReady] of Object.entries(READINESS)) {
      if (isReady(latest.traits)) latest[flag] = true;
      else delete latest[flag];
    }
  }

  // ─── Hand-curated overrides ───────────────────────────────────────────────
  const titles = new Set(enriched.map(t => t.title));
  for (const [title, ov] of Object.entries(OVERRIDES)) {
    if (!titles.has(title)) console.warn(`  ⚠  Override for unknown tool "${title}" — ignored`);
    for (const field of ["dependencies", "softReferences"]) {
      const v = ov[field];
      const named = Array.isArray(v) ? v : [...(v?.add ?? []), ...(v?.remove ?? [])];
      for (const t of named)
        if (!titles.has(t)) console.warn(`  ⚠  Override for "${title}": ${field} names unknown tool "${t}"`);
    }
  }
  for (let i = 0; i < enriched.length; i++) enriched[i] = applyOverrides(enriched[i]);
  // Curated traits count as evidence too, unless the flag itself is curated
  for (const t of enriched) {
    const latest = t.releases?.find(r => r.latest);
    if (!latest?.overridden?.includes("traits")) continue;
    for (const [flag, isReady] of Object.entries(READINESS)) {
      if (latest.overridden.includes(flag)) continue;
      if (isReady(latest.traits)) latest[flag] = true;
      else delete latest[flag];
    }
  }
  const isNoteOnly = ov => Object.keys(ov).every(k => k === "note");
  const applied = enriched.filter(t => OVERRIDES[t.title] && !isNoteOnly(OVERRIDES[t.title])).map(t => t.title);
  const flagged = enriched.filter(t => OVERRIDES[t.title] && isNoteOnly(OVERRIDES[t.title])).map(t => t.title);
  if (applied.length) console.log(`\n✎  Overrides applied (${OVERRIDES_FILE}): ${applied.join(", ")}`);
  if (flagged.length) console.log(`✎  Flagged for review (note only, no change): ${flagged.join(", ")}`);

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
  const withDeps    = enriched.filter(t => t.releases?.find(r => r.latest)?.dependencies?.length > 0).length;
  const withRels    = enriched.filter(t => t.releases?.length > 0).length;
  console.log(`\nDone. ${enriched.length} tools enriched, ${withRels} with releases, ${withDeps} with detected dependencies.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
