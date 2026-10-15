// ============================================================================
// Builder Tools taxonomy: this fork's additions
// ============================================================================
// tags.js is the upstream portal's taxonomy and stays untouched.  These extend
// it for the tools that `scripts/analyze-builder-tools.mjs --extra-from-devex`
// adds from IOG DevX's tooling map, which covers more of the ecosystem than
// the portal does.  Only the relationships and compatibility view uses them.
// See README.CBIA.md, "Extra tools from the DevX map".
// ============================================================================

// Categories the portal doesn't have
export const ExtraCategories = {
  l2: { label: "Layer 2 & Scaling" },
};

// Languages named in the DevX map that the portal doesn't list.  Only real
// programming languages: the map's other values ("Multi", "Service", "JSON",
// "Vue", "Blockly", "Plutus"…) describe a platform, a framework or a format,
// and aren't kept.  C# isn't here: the portal files C# tools under .NET.
export const ExtraLanguageProperties = {
  aiken: { label: "Aiken" },
  bash: { label: "Bash" },
  cpp: { label: "C++" },
  dart: { label: "Dart" },
  elixir: { label: "Elixir" },
  kotlin: { label: "Kotlin" },
  nix: { label: "Nix" },
  pluto: { label: "Pluto" },
  solidity: { label: "Solidity" },
  uplc: { label: "UPLC" },
};
