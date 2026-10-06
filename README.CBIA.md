This file includes the documentation for `CBIA Developer Tools Compatibility Matrix Project`, which aims to extend https://developers.cardano.org/tools/ with visualization for relationships and compatibility between tools.

## UI Usage

- A [running demo](https://45b.io/cbia-infra-tools/tools/) of our version of the tooling page is available.

- The visualization can be accessed via the "Explore relationships and compatibility" button, taking you to [/tools-rels-compat/](https://45b.io/cbia-infra-tools/tools-rels-compat/).

- Toggles are available to opt between viewing in `Dependencies` or `Dependents` mode and `Top-level` or `All tools`.

- A `Soft refs` allows taking in consideration when tools mentions/integrates with each other but don't hard-depend.

- `Expand all` / `Collapse all` controls are available, as well as clicking tool items. Ctrl+click will fully expand an item.

- Category labels on the page bottom may also be clicked to filter the visualization. Ctrl+click will accumulate categories.

## Portal Files added or changed

- `/src/components/BuilderToolsTree` include `index.js` and `tree.css`

- `/src/data/builder-tools/tools-rels-compat.html` -- initial stand-alone PoC

- `/src/pages/tools/index.js` -- minor modifications

- `/src/pages/tools/styles.module.css` -- minor modifications

- `/src/pages/tools-rels-compat/index.js` -- new page layout

## Data enriching

`scripts/analyze-builder-tools.mjs` reads the portal's builder-tools list and writes a copy of it in which every tool gets a `releases` array (versions, stars, license, Cardano era, dependencies on other listed tools, soft references, CIP/era traits), pulled from GitHub.

- Input: `/src/data/builder-tools/tools.js` (upstream list) or `/src/data/builder-tools/enriched-tools.js` (a previous run's output)
- Output: `/src/data/builder-tools/enriched-tools.js`, imported by `/src/components/BuilderToolsTree`, plus an `enriched-tools.json` copy of the same data (not used by the site; useful only for human data review)
- No `npm install` needed, only Node.js 18+

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
npm run enrich-tools -- -i src/data/builder-tools/tools.js
```

**Standalone** (same thing, without the npm shortcut):

```bash
node scripts/analyze-builder-tools.mjs \
  -i src/data/builder-tools/enriched-tools.js \
  -o src/data/builder-tools/enriched-tools
```

A run takes several minutes (it pauses between requests and waits out GitHub rate limits if hit). Review the result with `git diff src/data/builder-tools/enriched-tools.js`; `git checkout` that file to discard it.

### Arguments

| Argument | Default | What it does |
|---|---|---|
| `-i`, `--input <file>` | `tools.js` (in the current directory) | The builder-tools file to read. **Always pass it from the repo root**, since there is no `tools.js` there. Choosing the input is what picks the mode: `tools.js` starts from the upstream list; `enriched-tools.js` refreshes a previous output. |
| `-o`, `--out <basename>` | `enriched-tools` (in the current directory) | Output path **without extension**; the script writes `<basename>.js` and `<basename>.json`. Point it at `src/data/builder-tools/enriched-tools` to update what the site uses, or elsewhere (e.g. `/tmp/enriched-tools`) for a trial run that leaves the repo untouched. |
| `-t`, `--token <PAT>` | `$GITHUB_TOKEN` | GitHub token. Prefer the environment variable (see step 2). |
| `-h`, `--help` | | Print usage and exit. |

With `npm run`, arguments after `--` are appended to the script's own, and a repeated flag overrides the earlier one, which is how `-- -i ...tools.js` switches the input.

### Re-feeding the output (refresh mode)

The output is written in the same format as `tools.js` (same comment header, same `export const BuilderTools = [...]`, same "ADD YOUR BUILDER TOOL ABOVE THIS LINE" marker), so it can be passed back in as `--input`:

- All original fields of every tool are kept as they are; only `releases` is regenerated.
- Tools with no `repository` keep their existing `releases` (so hand-curated entries survive).
- If GitHub can't be reached for a tool (metadata, releases list, or all manifest files fail), that tool's previous `releases` are kept instead of being emptied.

Refresh mode only knows about the tools already in `enriched-tools.js`. To pick up tools added or edited upstream in `tools.js`, use the *rebuild from upstream* command. Nothing is lost by doing so, since `releases` comes from GitHub on every run either way (except hand-curated `releases` on tools with no repository, which only exist in `enriched-tools.js`).
