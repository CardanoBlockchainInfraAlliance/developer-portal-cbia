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

- `/home/lucas/Code/CBIA/developer-portal-cbia/src/pages/tools/index.js` -- minor modifications

- `/home/lucas/Code/CBIA/developer-portal-cbia/src/pages/tools/styles.module.css` -- minor modifications

- `/home/lucas/Code/CBIA/developer-portal-cbia/src/pages/tools-rels-compat/index.js` -- new page layout

## Data enriching

- For now, enrichment of `/src/data/builder-tools/tools.js` data is being done outside of this repo

- Resulting in `/src/data/builder-tools/enriched-tools.js` with the dependency/compatibility data, which we've imported




