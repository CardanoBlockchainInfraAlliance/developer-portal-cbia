/*
 * Hand-curated corrections to the data scripts/analyze-builder-tools.mjs
 * detects from GitHub.  Applied to each tool's latest release at the end of
 * every run (including --offline), so they survive refreshes and rebuilds.
 *
 * Keyed by tool title, exactly as in tools.js.  Per field:
 *   field: value               replaces what was detected
 *                              (e.g. cardanoEra: "conway", conwayReady: false,
 *                              dependencies: [...])
 *   field: { add, remove }     edits a detected list
 *                              (e.g. dependencies: { add: ["Ogmios"] },
 *                              traits: { add: ["cip30"] } for a capability)
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
    note: "The repo is only a README and doesn't name its stack; Koios runs on cardano-node, cardano-db-sync and Ogmios, and serves Conway governance endpoints (DReps, proposals, votes).",
    dependencies: { add: ["cardano-node", "cardano-db-sync", "Ogmios"] },
    conwayReady: true,
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
    conwayReady: true,
  },

  // Conway readiness of core tools: their READMEs don't name the era, but
  // they've shipped Conway support (the matrix's readiness column).
  "cardano-node": {
    note: "Conway has been mainnet's era since the Chang hard fork (Sep 2024); the node is what runs it.",
    conwayReady: true,
  },
  "cardano-cli": {
    note: "Ships with the node; has Conway governance commands (DRep registration, votes, governance actions).",
    conwayReady: true,
  },
  "cardano-api": {
    note: "The library under cardano-cli and the node's clients; Conway support since the Chang hard fork.",
    conwayReady: true,
  },
  Ogmios: {
    note: "Ogmios 6.x serves Conway blocks, governance and Plutus V3.",
    conwayReady: true,
  },
  "cardano-db-sync": {
    note: "db-sync 13.3+ indexes Conway governance data.",
    conwayReady: true,
  },
  Aiken: {
    note: "Compiles to Plutus V3 since Aiken 1.1.",
    conwayReady: true,
  },
  "Cardano Serialization Library": {
    note: "CSL 12+ builds Conway transactions (certificates, votes, Plutus V3).",
    conwayReady: true,
  },
  Blockfrost: {
    note: "Serves Conway governance endpoints (DReps, proposals, votes).",
    conwayReady: true,
  },

  // Probably Conway-ready too; flagged for a maintainer or reviewer to confirm.
  Mesh: {
    note: "Likely Conway-ready (Conway transaction building); confirm and set conwayReady.",
  },
  "Lucid Evolution": {
    note: "Likely Conway-ready (Plutus V3, governance); confirm and set conwayReady.",
  },
  Hydra: {
    note: "Likely Conway-ready (heads on Conway-era nodes); confirm and set conwayReady.",
  },
  Mithril: {
    note: "Likely Conway-ready (signs a Conway-era chain); confirm and set conwayReady.",
  },
  Dingo: {
    note: "Likely Conway-ready (Go node following Conway mainnet); confirm and set conwayReady.",
  },
};
