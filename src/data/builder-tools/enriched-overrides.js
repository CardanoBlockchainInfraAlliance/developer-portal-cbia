/*
 * Hand-curated corrections to the data scripts/analyze-builder-tools.mjs
 * detects from GitHub.  Applied to each tool's latest release at the end of
 * every run (including --offline), so they survive refreshes and rebuilds.
 *
 * Keyed by tool title, exactly as in tools.js.  Per field:
 *   field: value               replaces what was detected
 *                              (e.g. cardanoEra: "conway", dependencies: [...])
 *   field: { add, remove }     edits a detected list
 *                              (e.g. dependencies: { add: ["Ogmios"] })
 *   note: "..."                why the override exists; not written to the output
 *
 * An entry with only a `note` changes nothing; use it to flag doubtful data
 * for reviewers.
 *
 * Dependency names are tool titles.  The script warns about unknown tools or
 * titles.  Overridden fields are listed in the release's `overridden` array.
 *
 * After editing, apply without calling GitHub:  yarn enrich-tools --offline
 */

export const EnrichedOverrides = {
  Koios: {
    note: "The repo is only a README and doesn't name its stack; Koios runs on cardano-node, cardano-db-sync and Ogmios.",
    dependencies: { add: ["cardano-node", "cardano-db-sync", "Ogmios"] },
  },
  Maestro: {
    note: "No public repository; carried over from the legacy hand-curated data.",
    dependencies: ["cardano-node", "Pallas", "gOuroboros", "cardano-db-sync", "Koios"],
  },
  Marlowe: {
    note: "README no longer names an era; latest release (runtime 1.0.0, May 2024) predates Conway.",
    cardanoEra: "babbage",
  },
  Typhonjs: {
    note: "Detected era is \"byron\" only because the README mentions Byron addresses; the era Typhonjs actually supports is unverified. Add cardanoEra here once confirmed.",
  },
  Scalus: {
    note: "README no longer names an era; Scalus targets Plutus V3, which is Conway.",
    cardanoEra: "conway",
  },
};
