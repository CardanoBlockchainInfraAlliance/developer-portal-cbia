# CBIA Developer Tools Compatibility Matrix

This fork of the [Cardano Developer Portal](https://developers.cardano.org/tools/) adds a view of how the portal's builder tools relate to each other and how compatible they are. It's the [CBIA](https://cbia.io) project [*Add Developer Tool Compatibility Matrix to Cardano Developers Portal*](https://projectcatalyst.io/funds/11/cardano-open-developers/cbia-add-developer-tool-compatibility-matrix-to-cardano-developers-portal) (Catalyst Fund 11, #1100088); milestone updates are in [developer-portal-proj-updates](https://github.com/CardanoBlockchainInfraAlliance/developer-portal-proj-updates).

- **Dependency tree:** which tools each tool depends on, and which depend on it
- **Trait matrix:** per tool, its latest release, what changed in what it depends on, who depends on it, its readiness, capabilities and health
- **Two readiness sources:** detected from each tool's repository (default), or Intersect's hand-maintained hard fork readiness tracker, both laid over the same dependency graph
- **Data refreshed by script** from GitHub and from Intersect's tracker, with a reviewed file for corrections that can't be detected

[Running demo](https://45b.io/cbia-infra-tools-ms3/tools-rels-compat/), opened from the portal's tools page with the "Explore relationships and compatibility" button.

## UI usage

### Dependency tree

- The `Dependency tree` / `Dependents tree` button at the top left collapses or expands the tree.
- `Dependencies` / `Dependents` switches between what each tool depends on and what depends on it; `Top-level` / `All tools` between the tools at the ends of the graph and every tool.
- `Soft refs` adds documented integrations (a tool's README naming another) to the hard dependencies found in manifests.
- Click a tool to expand or collapse it; Ctrl+click expands it fully. `Expand all` / `Collapse all` do the whole tree.
- Click a category label at the bottom to show only that category; Ctrl+click adds more.
- Each tool shows its readiness for the selected source (e.g. `✓` Conway-ready, or `in progress` on the Intersect tracker), and a red `blocked` when one of its dependencies is behind (hover for which). Hover a tool for its maker and description.

### Trait matrix

- `Trait matrix ▸`, under the category labels, opens a table of every tool's compatibility data. While it's open, the tree keeps a compact panel of its own at the top and the matrix follows below. Scrolling down pins the tree's controls under the navbar, then the category labels and matrix bar under them, then the matrix's column headings, so the matrix can be scrolled through without losing any controls (on phones, one panel at a time, switched with `Tree / matrix`).
- Columns:
  - **Latest release:** version and date (green when released in the last 90 days)
  - **Depends on:** each dependency with its latest version, green when it was released in the last 90 days (dashed for soft references)
  - **Depended on by:** count; hover for names
  - **Readiness**, for the selected source: the tool's own status, the dependencies holding it back (`blocked by …`), and how many dependencies have no information
  - **Capabilities**, grouped from the CIPs a tool names (wallet connection, token metadata, governance, blueprints, message signing); hover for which CIPs, click one to filter the matrix to every tool with it
  - **Health:** active, stale (no commits for a year), pre-release (no stable release among the last 10), archived
- Click a column header to sort; type in `Filter tools…` to search by name. The category labels filter the matrix too.
- Every tool, in the tree and the matrix, has two icons on hover: the magnifier filters the matrix to **that tool only**, and the branch icon to **that tool and its branch**: everything it depends on in `Dependencies` mode, or everything that depends on it in `Dependents` mode (`Soft refs` included when on). The chip in the matrix bar shows the filter (a tool, a branch or a capability); `×` clears it, as does clicking a category. Choosing a tool also brings it into view in the tree, expanding its parents if needed.

### Readiness sources

The `Readiness` selector in the matrix bar picks where readiness comes from. Both use the same dependency graph, so `blocked` means the same thing in each: a hard dependency is known to be less than ready.

| Source | Era | How it's gathered | Values |
|---|---|---|---|
| **Repos · Conway (detected)** (default) | Conway, the current era | From each repository: naming Conway, Plutus V3 or a Conway governance CIP; plus curated corrections | `✓` ready, `✗` not ready, `?` unknown; `*` = curated |
| **Intersect tracker · Dijkstra (PV12)** | Dijkstra, the next hard fork (protocol version 12) | Synced from [Intersect's readiness tracker](https://docs.google.com/spreadsheets/d/1C1Ai_YTqwKLHtICunzbh_o0FD9XB54Kh/edit?usp=sharing), where each team self-reports per network | `ready`, `in progress`, `reached out`, `n/a`, or none; per network (Musashi, DijkstraNet, Preview, PreProd, Mainnet; Mainnet by default, as Intersect counts it) |

The tracker is filled in as teams report, so early in a hard fork cycle most tools show no information there. A link next to the selector opens the tracker, with the date of the last sync.

### Sharing a view

The view is in the URL, e.g. `/tools-rels-compat/?tool=Kupo&branch=1&matrix=1&source=intersect&net=preview`, or `?cap=governance` for a capability (`tree=0` keeps the tree collapsed).

## Portal files added or changed

| File | What |
|---|---|
| `/src/components/BuilderToolsTree/index.js`, `tree.css` | The tree, trait matrix, readiness model and filters |
| `/src/pages/tools-rels-compat/index.js` | The new page |
| `/src/pages/tools/index.js` | "Explore relationships and compatibility" link next to "View all tools alphabetically" (in `AllToolsReveal`) |
| `/src/pages/tools/styles.module.css` | Breadcrumb styles (used by the new page) and a gap between the two buttons above |
| `/scripts/analyze-builder-tools.mjs` | GitHub enrichment; see *Data enriching* |
| `/scripts/sync-intersect-readiness.mjs` | Intersect tracker sync; see *Readiness from Intersect's tracker* |
| `/src/data/builder-tools/enriched-tools.js` (`.json`) | Enriched tool data (generated) |
| `/src/data/builder-tools/enriched-overrides.js` | Curated corrections (hand-edited) |
| `/src/data/builder-tools/intersect-readiness.js` | Tracker statuses mapped to portal tools (generated) |
| `/src/data/builder-tools/tools-rels-compat.html` | Initial stand-alone proof of concept |
| `package.json` | `enrich-tools` and `sync-readiness` scripts |

The tree's category colours and legend (`CATEGORY_COLORS`, `BUILDER_TOOLS_CATS`, `UTILITIES_CATS` in `/src/components/BuilderToolsTree/index.js`) are hardcoded. When upstream adds a category to `tags.js`, add it there too, or its tools show a grey dot and are hidden while all category filters are on.

## Data enriching

`scripts/analyze-builder-tools.mjs` reads the portal's builder-tools list and writes a copy of it in which every tool gets a `releases` array (versions, stars, license, Cardano era, dependencies on other listed tools, soft references, CIP/era traits), pulled from GitHub.

- Input: `/src/data/builder-tools/tools.js` (upstream list) or `/src/data/builder-tools/enriched-tools.js` (a previous run's output)
- Manual corrections: `/src/data/builder-tools/enriched-overrides.js` (see *Manual overrides* below)
- Output: `/src/data/builder-tools/enriched-tools.js`, imported by `/src/components/BuilderToolsTree`, plus an `enriched-tools.json` copy of the same data (not used by the site; useful only for human data review)
- No `npm install` needed, only Node.js 18+

### 0. Script overview

- **Script:** the input file is imported through a temporary `.mjs` copy (deleted afterwards), so it can keep its `.js` extension. The input's comment header and "ADD YOUR BUILDER TOOL ABOVE THIS LINE" marker are carried over to the output, and only `releases` is regenerated. A tool keeps its previous `releases` when it has no `repository`, or when fetching its GitHub metadata, releases list or manifest files fails.
- **Dependency detection:** for each tool, the script reads the root manifests (`package.json`, `cabal.project`, `Cargo.toml`, `go.mod`, `pom.xml`, Gradle files, `pyproject.toml`, `requirements.txt`, `pnpm-lock.yaml`), the monorepo sub-package manifests under `packages/`, `modules/`, `libs/` etc., and the `README.md`. In manifests, it looks for other listed tools by GitHub slug (`owner/repo`) and by package name, using per-ecosystem lookup tables (npm, Go, Maven, Rust crates, Haskell, Python) near the top of the script. Matches there become `dependencies`. A tool that is only mentioned in the README becomes a `softReference` instead.
- **Traits:** era names, `plutus-v3`, and notable CIPs (`cip30`, `cip68`, `cip1694`…) found in the manifests and README. The latest release also gets `conwayReady: true` when its traits show Conway support (the `conway` era, `plutus-v3`, or a Conway governance CIP); it's left out when there's no evidence, meaning *unknown*. The page groups CIPs into capabilities (wallet connection, token metadata, governance, blueprints, message signing).
- **Releases:** up to the 10 most recent GitHub releases are listed, or a single synthetic `tip` entry when the repo has no formal releases. The entry marked `latest` is the newest stable release, as on GitHub (the newest prerelease only if all listed releases are prereleases). Only the latest entry carries the repo-level data (stars, forks, open issues, license, archived, last commit, Cardano era, `dependencies`, `softReferences`) and traits detected from the current manifests and README. Older entries only have version, tag, date, and traits detected from that release's notes. Their dependencies aren't recorded, since that would require reading old manifests.
- **Shared repos:** when several tools share one repository (cardano-node and cardano-testnet; cardano-api, cardano-rpc and cardano-wasm), they all get that repo's releases, and a dependency on the repo is credited to the tool named after it.

### 1. Create a GitHub token

The script only reads public repository data. Without a token, GitHub allows 60 API requests per hour, and a full run needs around 4 per tool (about 350 for the current list), so in practice a token is required. With a token the limit is 5000 per hour.

Create a **fine-grained personal access token** at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → *Generate new token*:

- **Repository access:** *Public repositories (read-only)*
- **Permissions:** none (leave everything at *No access*)
- **Expiration:** short (e.g. 7–30 days); it is easy to generate a new one

A classic token also works: tick **no scopes** at all, since reading public repositories doesn't need any.

The token never goes into the repo: the script only sends it in the `Authorization` header of requests to `api.github.com` / `raw.githubusercontent.com`, and never logs or writes it.

### 2. Make the token available to your shell (without saving it)

```bash
read -rsp 'GitHub token: ' GITHUB_TOKEN && export GITHUB_TOKEN && echo
```

Run this line exactly as written; don't put your token in it. It prompts `GitHub token:`, you paste the token (nothing is shown), and press Enter. `read -s` stores it in the `GITHUB_TOKEN` variable without echoing it or recording it in shell history, and `export` passes it on to `node`. It lasts until you close that terminal.

The one-liner form `GITHUB_TOKEN=ghp_xxx node ...` also works, but the token then ends up in `~/.bash_history`, unless you start the line with a space (bash's default `HISTCONTROL=ignoreboth` skips space-prefixed lines). Avoid `--token ghp_xxx` for the same reason; it is also visible to other processes via `ps`.

### 3. Run it

From the repo root, after step 2:

**Refresh the existing data** (the usual case: re-reads the last output and updates its `releases`):

```bash
npm run enrich-tools        # or: yarn enrich-tools
```

**Rebuild from the upstream list** (after merging upstream changes to `tools.js`, e.g. new or edited tools):

```bash
npm run enrich-tools -- -i src/data/builder-tools/tools.js -r src/data/builder-tools/enriched-tools.js
```

`-r` carries over the current `releases` (matched by title) for tools without a `repository` and for tools whose GitHub fetch fails, so hand-curated entries aren't lost.

**Without GitHub** (e.g. right after merging upstream, before setting a token): add `--offline` to the rebuild command. The tool list and fields come from `tools.js`, every tool keeps its `releases` from the `-r` file, and new tools start with none until the next online run.

**Standalone** (same thing, without the npm shortcut):

```bash
node scripts/analyze-builder-tools.mjs \
  -i src/data/builder-tools/enriched-tools.js \
  -o src/data/builder-tools/enriched-tools
```

A run takes several minutes (it pauses between requests and waits out GitHub rate limits if hit). Review the result with `git diff src/data/builder-tools/enriched-tools.js`; `git checkout src/data/builder-tools/enriched-tools.*` to discard it. Both output files are tracked, so commit them together to keep the JSON copy in step with the `.js`.

### Arguments

| Argument | Default | What it does |
|---|---|---|
| `-i`, `--input <file>` | `tools.js` (in the current directory) | The builder-tools file to read. **Always pass it from the repo root**, since there is no `tools.js` there. Choosing the input is what picks the mode: `tools.js` starts from the upstream list; `enriched-tools.js` refreshes a previous output. |
| `-o`, `--out <basename>` | `enriched-tools` (in the current directory) | Output path **without extension**; the script writes `<basename>.js` and `<basename>.json`. Point it at `src/data/builder-tools/enriched-tools` to update what the site uses, or elsewhere (e.g. `/tmp/enriched-tools`) for a trial run that leaves the repo untouched. |
| `-r`, `--releases-from <file>` | | A previous output whose `releases` (matched by title) are used for any tool the input has none for: tools without a `repository`, tools whose GitHub fetch fails, and every tool with `--offline`. Meant for rebuilding from `tools.js`; in refresh mode the input already has them. |
| `--offline` | | Make no GitHub requests: only re-read the input (and `-r` file), apply the overrides and rewrite the output. |
| `--overrides <file>` | `src/data/builder-tools/enriched-overrides.js` (found relative to the script) | Manual corrections file; skipped if it doesn't exist. |
| `-t`, `--token <PAT>` | `$GITHUB_TOKEN` | GitHub token. Prefer the environment variable (see step 2). |
| `-h`, `--help` | | Print usage and exit. |

With `npm run`, arguments after `--` are appended to the script's own, and a repeated flag overrides the earlier one, which is how `-- -i ...tools.js` switches the input.

### Manual overrides

Some things can't be detected from GitHub, e.g. a repo that doesn't name the stack it runs on (Koios), core tools whose READMEs don't state the Conway support they've shipped (cardano-node, Ogmios, Aiken…), or a tool with no public repository (Maestro). `/src/data/builder-tools/enriched-overrides.js` holds those corrections, keyed by tool title. They're applied to the latest release at the end of every run, so refreshes and rebuilds never undo them:

```js
Koios: {
  note: "Why this override exists (not written to the output)",
  dependencies: { add: ["cardano-node", "Ogmios"] },   // edit a detected list (add and/or remove)
  cardanoEra: "conway",                                // or replace a value outright
  conwayReady: true,                                   // e.g. confirm readiness the repo doesn't state
},
```

- Dependency names are tool titles. The script warns about an override for an unknown tool, or one naming an unknown tool.
- Overridden fields are listed in that release's `overridden` array, so curated data can be told apart from detected data.
- An entry with only a `note` changes nothing: it flags doubtful data for reviewers (e.g. Typhonjs's detected era, or tools that are probably Conway-ready but not yet confirmed). Runs list these under *Flagged for review*.
- After editing the file, apply it without calling GitHub: `yarn enrich-tools --offline`.
- Removing an override takes effect on the next online run, which recomputes the field from GitHub.

### Re-feeding the output (refresh mode)

The output is written in the same format as `tools.js` (same comment header, same `export const BuilderTools = [...]`, same "ADD YOUR BUILDER TOOL ABOVE THIS LINE" marker), so it can be passed back in as `--input`:

- All original fields of every tool are kept as they are; only `releases` is regenerated.
- Tools with no `repository` keep their existing `releases` (so hand-curated entries survive).
- If GitHub can't be reached for a tool (metadata, releases list, or all manifest files fail), that tool's previous `releases` are kept instead of being emptied.

Refresh mode only knows about the tools already in `enriched-tools.js`. To pick up tools added or edited upstream in `tools.js`, use the *rebuild from upstream* command. Nothing is lost by doing so: `releases` comes from GitHub on every run either way, and `-r` brings over the hand-curated `releases` on tools with no repository (e.g. Maestro), which only exist in `enriched-tools.js`. A tool renamed upstream doesn't match by title, so check its `releases` in the diff.

## Readiness from Intersect's tracker

`scripts/sync-intersect-readiness.mjs` reads Intersect's [Dijkstra hard fork readiness tracker](https://docs.google.com/spreadsheets/d/1C1Ai_YTqwKLHtICunzbh_o0FD9XB54Kh/edit?usp=sharing) ([how it's run](https://cardanoupgrades.docs.intersectmbo.org/dijkstra-era-upgrade/dijkstra-upgrade-readiness)) and writes `/src/data/builder-tools/intersect-readiness.js`. No token is needed: the sheet is public, and each tab is read as CSV.

```bash
yarn sync-readiness        # or: npm run sync-readiness
```

- **Tabs read:** Core Infra, Tooling (Libraries, Tools, Indexers, Higher Level), Node Implementations, and Partner-chains. Exchanges, wallets, DApps, explorers and guidelines aren't builder tools on the portal, so they're skipped.
- **Name mapping:** a sheet row matches a portal tool by title (case-insensitive) or through the `ALIASES` table at the top of the script, e.g. "MeshSDK" → Mesh, "Haskell - The Node" → cardano-node, "Cardano CLI, API & Node Integration" → cardano-cli and cardano-api. Rows with no match are listed at the end of each run; add an alias for a portal tool, or an empty alias to silence one that isn't on the portal.
- **Statuses** per network: `none`, `reached-out`, `in-progress`, `ready`, `n/a` (counted as ready, as the tracker does). An unfamiliar value is kept as `other` with its text, and the run warns about it. A tool on two rows (Scalus is a library and a node) takes the more advanced status per network.
- **Generated file:** don't edit `intersect-readiness.js` by hand; corrections belong in the tracker itself, which Intersect updates from PRs, email (hard-fork@intersectmbo.org) or comments on the sheet.
- If a tab is renamed or removed, the run stops with an error instead of writing partial data.
