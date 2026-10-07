import React, { useEffect, useRef } from "react";
import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { BuilderTools } from "@site/src/data/builder-tools/enriched-tools.js";
import { IntersectReadiness } from "@site/src/data/builder-tools/intersect-readiness.js";
import { slugify } from "@site/src/data/builder-tools/slug";
import { LanguageProperties, InterfaceProperties } from "@site/src/data/builder-tools/tags.js";
import "./tree.css";

export default function BuilderToolsTree() {
  const initialized = useRef(false);
  const toolsUrl = useBaseUrl("/tools/");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // ---- category -> colour ----------------------------------------------
    const CATEGORY_COLORS = {
      "node":            "#4da6ff",
      "node-access":     "#56c2ff",
      "sdk":             "#a371f7",
      "wallet":          "#ffb454",
      "indexer":         "#3fb950",
      "integration":     "#39c5cf",
      "operations":      "#e3b341",
      "smart-contracts": "#f778ba",
      "api":             "#79c0ff",
      "dev-env":         "#7ee787",
      "governance":      "#d2a8ff",
      "testing":         "#ff7b72",
      "oracle":          "#f0883e",
    };
    const colorFor = c => CATEGORY_COLORS[c] || "#8b98ad";

    // ---- tool tooltip ----------------------------------------------------
    const toolTip = document.getElementById("tool-tooltip");
    let tipTouchTimer = null;
    let tipHoverTimer = null;
    let tipLeaveTimer = null;
    let tipRow = null;

    function makerOf(tool) {
      if (tool.repository) {
        const m = tool.repository.match(/github\.com\/([^/]+)/);
        if (m) return m[1];
      }
      if (tool.website) {
        try { return new URL(tool.website).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      }
      return null;
    }

    function showToolTip(row, tool) {
      const maker = makerOf(tool);
      const desc = tool.description || "";
      toolTip.innerHTML = "";
      if (maker) {
        const byEl = document.createElement("div");
        byEl.className = "tip-by";
        byEl.textContent = `By ${maker}`;
        toolTip.appendChild(byEl);
      }
      if (desc) {
        const descEl = document.createElement("div");
        descEl.className = "tip-desc";
        descEl.textContent = desc;
        toolTip.appendChild(descEl);
      }
      // Its category, as the legend shows it
      const cat = document.createElement("div");
      cat.className = "tip-cat";
      const catDot = document.createElement("span");
      catDot.className = "dot";
      catDot.style.background = colorFor(tool.category);
      const catLabel = document.createElement("span");
      catLabel.textContent = ALL_LEGEND_CATS.find(c => c.key === tool.category)?.label || tool.category;
      cat.append(catDot, catLabel);
      toolTip.appendChild(cat);
      const r = row.getBoundingClientRect();
      const tipW = 340;
      let left = r.left;
      if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
      toolTip.style.left = Math.max(8, left) + "px";
      toolTip.style.top  = Math.min(r.bottom + 6, window.innerHeight - 80) + "px";
      toolTip.classList.add("visible");
      tipRow = row;
    }

    function hideToolTip() {
      toolTip.classList.remove("visible");
      tipRow = null;
      clearTimeout(tipTouchTimer);
      clearTimeout(tipHoverTimer);
      clearTimeout(tipLeaveTimer);
    }

    // Leaving a row hides the tooltip after a short grace period, so the
    // pointer can cross onto it; it stays while hovered.
    function leaveToolTip() {
      clearTimeout(tipHoverTimer);
      clearTimeout(tipLeaveTimer);
      tipLeaveTimer = setTimeout(hideToolTip, 250);
    }
    toolTip.addEventListener("mouseenter", () => {
      clearTimeout(tipLeaveTimer);
      clearTimeout(tipTouchTimer);
    });
    toolTip.addEventListener("mouseleave", leaveToolTip);

    function attachTooltip(row, tool) {
      row.addEventListener("mouseenter", () => {
        if (tipRow === row) { clearTimeout(tipLeaveTimer); return; }
        hideToolTip();
        tipHoverTimer = setTimeout(() => showToolTip(row, tool), 1500);
      });
      row.addEventListener("mouseleave", leaveToolTip);
      row.addEventListener("touchend", () => {
        clearTimeout(tipTouchTimer);
        showToolTip(row, tool);
        tipTouchTimer = setTimeout(hideToolTip, 3000);
      });
    }

    document.addEventListener("scroll", hideToolTip, true);

    // ---- build index + dependency edges ----------------------------------
    const byTitle = new Map(BuilderTools.map(t => [t.title, t]));

    const latestOf = t => t.releases?.find(r => r.latest) || t.releases?.[0] || {};
    const hardDepsOf = t => latestOf(t).dependencies || [];
    const softDepsOf = t => latestOf(t).softReferences || [];

    // ---- readiness: one model, two sources --------------------------------
    // "repos": Conway readiness detected from GitHub (plus curation), in
    //          enriched-tools.js.
    // "intersect": Intersect's Dijkstra (PV12) readiness tracker, per network,
    //          synced into intersect-readiness.js.
    // Both map to a rank (0 not ready … 3 ready, null = no info), so the same
    // dependency graph can tell which tools are held back by a dependency.
    const READINESS_SOURCES = {
      repos:     { label: "Repos · Conway (detected)", short: "Conway" },
      intersect: { label: "Intersect tracker · Dijkstra (PV12)", short: "Dijkstra" },
    };
    const NETWORK_LABELS = {
      musashi: "Musashi", dijkstranet: "DijkstraNet", preview: "Preview", preprod: "PreProd", mainnet: "Mainnet",
    };
    const INTERSECT_STATUS = {
      ready:         { rank: 3, text: "ready",       cls: "ready" },
      "n/a":         { rank: 3, text: "n/a",         cls: "ready", tip: "Not applicable (counted as ready by the tracker)" },
      "in-progress": { rank: 2, text: "in progress", cls: "progress" },
      "reached-out": { rank: 1, text: "reached out", cls: "early" },
    };
    let readinessSource = "repos";
    let readinessNet = "mainnet";

    // { rank, text, cls, tip } — rank null means no information
    function readinessOf(t) {
      if (readinessSource === "intersect") {
        const entry = IntersectReadiness.tools[t.title];
        if (!entry) return { rank: null, text: "", cls: "none", tip: "Not in Intersect's tracker" };
        const status = entry.networks[readinessNet];
        const s = INTERSECT_STATUS[status];
        const net = NETWORK_LABELS[readinessNet];
        if (!s) {
          const raw = entry.raw?.[readinessNet];
          return { rank: null, text: raw ? raw : "", cls: "none",
                   tip: raw ? `Tracker says "${raw}" on ${net}` : `No info on ${net} yet` };
        }
        return { rank: s.rank, text: s.text, cls: s.cls,
                 tip: `${s.tip || s.text[0].toUpperCase() + s.text.slice(1)} on ${net}${entry.criticalPath ? " · critical path" : ""}` };
      }
      const l = latestOf(t);
      const curated = (l.overridden || []).includes("conwayReady");
      if (l.conwayReady === true)
        return { rank: 3, text: "✓", cls: "ready", curated,
                 tip: curated ? "Conway-ready (curated)" : "Conway-ready: names Conway, Plutus V3 or a governance CIP" };
      if (l.conwayReady === false)
        return { rank: 0, text: "✗", cls: "not", curated: true, tip: "Not Conway-ready (curated)" };
      return { rank: null, text: "?", cls: "none", tip: "Unknown: no Conway evidence found" };
    }

    // Hard dependencies with known readiness below "ready" hold a tool back,
    // whatever its own status; dependencies with no info are only counted.
    function blockersOf(t) {
      const blockers = [], unknown = [];
      for (const d of hardDepsOf(t)) {
        const dep = byTitle.get(d);
        if (!dep) continue;
        const r = readinessOf(dep);
        if (r.rank === null) unknown.push(d);
        else if (r.rank < 3) blockers.push({ title: d, text: r.text, cls: r.cls });
      }
      return { blockers, unknown };
    }

    // Small marks after a tool's name in the tree: its readiness, and a
    // "blocked" flag when a dependency is behind.
    function makeReadinessMarks(tool) {
      const frag = document.createDocumentFragment();
      const r = readinessOf(tool);
      if (r.rank !== null) {
        const m = document.createElement("span");
        m.className = `rd-mark rd-${r.cls}`;
        m.textContent = r.text;
        m.title = r.tip;
        frag.appendChild(m);
      }
      const { blockers } = blockersOf(tool);
      if (blockers.length) {
        const b = document.createElement("span");
        b.className = "rd-blocked";
        b.textContent = "blocked";
        b.title = "Held back by: " + blockers.map(x => `${x.title} (${x.text})`).join(", ");
        frag.appendChild(b);
      }
      return frag;
    }

    const sorted = [...BuilderTools].sort((a, b) => a.title.localeCompare(b.title));
    const allRoots = sorted;

    let depsOf = hardDepsOf;
    let dependedUpon = new Set();
    let consumerRoots = [];
    let reverseDeps = new Map();
    let foundationRoots = [];

    function rebuildEdges(includeSoft) {
      depsOf = includeSoft
        ? t => [...new Set([...hardDepsOf(t), ...softDepsOf(t)])]
        : hardDepsOf;

      dependedUpon = new Set();
      for (const t of BuilderTools) for (const d of depsOf(t)) dependedUpon.add(d);

      consumerRoots = sorted.filter(t => !dependedUpon.has(t.title));

      reverseDeps = new Map();
      for (const t of BuilderTools) {
        for (const dep of depsOf(t)) {
          if (!reverseDeps.has(dep)) reverseDeps.set(dep, new Set());
          reverseDeps.get(dep).add(t);
        }
      }

      foundationRoots = sorted.filter(t => depsOf(t).length === 0 && reverseDeps.has(t.title));
    }

    rebuildEdges(false);

    // ---- category definitions + filter state ----------------------------
    const BUILDER_TOOLS_CATS = [
      { key: "sdk",             label: "SDKs & Libraries" },
      { key: "indexer",         label: "Indexers & Data" },
      { key: "wallet",          label: "Wallets & Connectivity" },
      { key: "smart-contracts", label: "Smart Contracts" },
      { key: "node-access",     label: "Node Access & RPC" },
      { key: "api",             label: "APIs & Providers" },
      { key: "node",            label: "Nodes & Clients" },
    ];
    const UTILITIES_CATS = [
      { key: "dev-env",     label: "Developer Environments" },
      { key: "testing",     label: "Testing & Debugging" },
      { key: "operations",  label: "Node Operations" },
      { key: "governance",  label: "Governance" },
      { key: "integration", label: "Integration & Middleware" },
      { key: "oracle",      label: "Oracles & Data Feeds" },
    ];
    const ALL_LEGEND_CATS = [...BUILDER_TOOLS_CATS, ...UTILITIES_CATS];
    const allCatKeys = new Set(ALL_LEGEND_CATS.map(c => c.key));
    let activeCategories = new Set(allCatKeys);

    // ---- render ----------------------------------------------------------
    const treeEl = document.getElementById("tree");
    const toolCountEl = document.getElementById("toolCount");
    const viewSub = document.getElementById("viewSub");
    const treeTitleEl = document.getElementById("treeTitle");
    const TREE_TITLES = { deps: "Dependency tree", dependents: "Dependents tree" };
    const VIEW_SUBS = {
      deps_consumers:       "what each depends on · tools nothing else depends on",
      deps_all:             "what each depends on · all tools",
      dependents_consumers: "what depends on each · foundation tools",
      dependents_all:       "what depends on each · all tools",
    };

    // ---- tool actions: "this tool only" / "this tool and its branch" -------
    const ICON_TOOL = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const ICON_BRANCH = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="4" cy="3" r="1.8" fill="currentColor"/><circle cx="4" cy="13" r="1.8" fill="currentColor"/><circle cx="12" cy="8" r="1.8" fill="currentColor"/><path d="M4 4.8v6.4M4 8h4.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

    const ICON_PAGE = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.5 1.5V5H13M6.5 8.5h4M6.5 11.5h4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

    function makeToolActions(tool) {
      const wrap = document.createElement("span");
      wrap.className = "tool-actions";
      for (const [branch, icon, what] of [[false, ICON_TOOL, "this tool only"], [true, ICON_BRANCH, "this tool and its branch"]]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tool-action";
        btn.innerHTML = icon;
        btn.title = `Trait matrix: ${what}`;
        btn.setAttribute("aria-label", `${tool.title}: show ${what} in the trait matrix`);
        btn.addEventListener("click", e => {
          e.stopPropagation();
          selectTool(tool.title, branch);
        });
        wrap.appendChild(btn);
      }
      const page = document.createElement("a");
      page.className = "tool-action";
      page.href = `${toolsUrl}${slugify(tool.title)}/`;
      page.innerHTML = ICON_PAGE;
      page.title = "Tool page";
      page.setAttribute("aria-label", `${tool.title}: tool page`);
      page.addEventListener("click", e => e.stopPropagation());
      wrap.appendChild(page);
      return wrap;
    }

    // Row shared by both tree directions: toggle, category dot, title,
    // readiness marks, and the tool actions.
    function makeRow(tool) {
      const row = document.createElement("div");
      row.className = "node-row";
      row.dataset.title = tool.title;

      const toggle = document.createElement("span");
      toggle.className = "toggle";

      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.color = colorFor(tool.category);
      dot.style.background = colorFor(tool.category);
      dot.title = tool.category;

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = tool.title;

      row.append(toggle, dot, label);

      row.appendChild(makeReadinessMarks(tool));

      attachTooltip(row, tool);
      return { row, toggle };
    }

    function buildNode(tool, ancestors) {
      const node = document.createElement("div");
      node.className = "node";

      const { row, toggle } = makeRow(tool);
      node.appendChild(row);

      const isCycle = ancestors.has(tool.title);
      const childTitles = isCycle
        ? []
        : depsOf(tool).map(d => byTitle.get(d)).filter(Boolean);

      if (isCycle && depsOf(tool).length) {
        const cm = document.createElement("span");
        cm.className = "cycle-mark";
        cm.textContent = "↺";
        cm.title = "already shown higher in this branch";
        row.appendChild(cm);
      }

      row.appendChild(makeToolActions(tool));

      if (childTitles.length) {
        toggle.textContent = "▾";
        row.classList.add("interactive");

        const childrenWrap = document.createElement("div");
        childrenWrap.className = "children";
        const inner = document.createElement("div");
        inner.className = "inner";
        childrenWrap.appendChild(inner);

        const nextAncestors = new Set(ancestors).add(tool.title);
        childTitles
          .sort((a, b) => a.title.localeCompare(b.title))
          .forEach(child => inner.appendChild(buildNode(child, nextAncestors)));

        node.appendChild(childrenWrap);

        row.addEventListener("click", e => {
          if (e.ctrlKey || e.metaKey) {
            node.querySelectorAll(".node").forEach(n => n.classList.remove("collapsed"));
            node.classList.remove("collapsed");
          } else {
            node.classList.toggle("collapsed");
          }
        });
      } else {
        toggle.classList.add("leaf");
        toggle.textContent = "•";
      }

      return node;
    }

    function buildNodeReverse(tool, ancestors) {
      const node = document.createElement("div");
      node.className = "node";

      const { row, toggle } = makeRow(tool);
      node.appendChild(row);

      const isCycle = ancestors.has(tool.title);
      const childTools = isCycle ? [] : [...(reverseDeps.get(tool.title) ?? [])];

      if (isCycle && reverseDeps.has(tool.title)) {
        const cm = document.createElement("span");
        cm.className = "cycle-mark";
        cm.textContent = "↺";
        cm.title = "already shown higher in this branch";
        row.appendChild(cm);
      }

      row.appendChild(makeToolActions(tool));

      if (childTools.length) {
        toggle.textContent = "▾";
        row.classList.add("interactive");

        const childrenWrap = document.createElement("div");
        childrenWrap.className = "children";
        const inner = document.createElement("div");
        inner.className = "inner";
        childrenWrap.appendChild(inner);

        const nextAncestors = new Set(ancestors).add(tool.title);
        childTools
          .sort((a, b) => a.title.localeCompare(b.title))
          .forEach(child => inner.appendChild(buildNodeReverse(child, nextAncestors)));

        node.appendChild(childrenWrap);

        row.addEventListener("click", e => {
          if (e.ctrlKey || e.metaKey) {
            node.querySelectorAll(".node").forEach(n => n.classList.remove("collapsed"));
            node.classList.remove("collapsed");
          } else {
            node.classList.toggle("collapsed");
          }
        });
      } else {
        toggle.classList.add("leaf");
        toggle.textContent = "•";
      }

      return node;
    }

    function renderTree() {
      rebuildEdges(document.getElementById("softRefs").checked);
      const dir = document.querySelector("input[name='direction']:checked").value;
      const view = document.querySelector("input[name='view']:checked").value;
      const isDep = dir === "deps";
      const isAll = view === "all";
      const roots = isDep
        ? (isAll ? allRoots : consumerRoots)
        : (isAll ? allRoots : foundationRoots);
      const buildFn = isDep ? buildNode : buildNodeReverse;

      const filteredRoots = activeCategories.size === allCatKeys.size
        ? roots
        : roots.filter(r => activeCategories.has(r.category));

      treeEl.innerHTML = "";
      const frag = document.createDocumentFragment();
      filteredRoots.forEach(r => frag.appendChild(buildFn(r, new Set())));
      treeEl.appendChild(frag);
      const readyCount = BuilderTools.filter(t => readinessOf(t).rank === 3).length;
      const readyWhat = readinessSource === "intersect"
        ? `Dijkstra-ready on ${NETWORK_LABELS[readinessNet]}`
        : "Conway-ready";
      toolCountEl.innerHTML =
        `<strong>${BuilderTools.length}</strong> tools total · <strong>${filteredRoots.length}</strong> shown at root · <strong>${readyCount}</strong> ${readyWhat}`;
      if (viewSub) viewSub.textContent = VIEW_SUBS[`${dir}_${view}`];
      if (treeTitleEl) treeTitleEl.textContent = TREE_TITLES[dir];
      markSelectionInTree();
      renderMatrix();
    }

    // ---- trait matrix ----------------------------------------------------
    // Rows: the selected tool (or it and its branch), else the tools in the
    // active categories.  Columns answer the Ms3 questions: what changed in
    // what I depend on, who depends on me, and the tool's traits.
    const DAY = 864e5;
    const RECENT_DAYS = 90;
    const STALE_DAYS = 365;
    const now = Date.now();
    const daysSince = iso => (iso ? (now - new Date(iso).getTime()) / DAY : null);
    const fmtDate = iso => (iso ? iso.slice(0, 10) : "");

    // CIPs grouped into the capabilities a builder looks for
    const CAPABILITIES = [
      { key: "wallet",     label: "Wallet connection", cips: ["cip30", "cip45", "cip95"] },
      { key: "tokens",     label: "Token metadata",    cips: ["cip14", "cip25", "cip26", "cip27", "cip67", "cip68"] },
      { key: "governance", label: "Governance",        cips: ["cip95", "cip100", "cip105", "cip108", "cip119", "cip129", "cip1694"] },
      { key: "blueprint",  label: "Blueprints",        cips: ["cip57"] },
      { key: "signing",    label: "Message signing",   cips: ["cip8"] },
    ];
    const capabilitiesOf = t => {
      const traits = new Set(latestOf(t).traits || []);
      return CAPABILITIES
        .map(c => ({ ...c, via: c.cips.filter(x => traits.has(x)) }))
        .filter(c => c.via.length);
    };

    // ---- trait kinds -----------------------------------------------------
    // The Traits column mixes three sources (see README.CBIA.md): only
    // "cap" comes from the detected traits (releases[].traits); "lang" and
    // "iface" are the catalog's curated properties, and "license" is GitHub
    // repository metadata.  Each kind's key is also its URL parameter.
    const licenseOf = t => {
      const l = latestOf(t).license;
      if (!t.repository) return { key: "no-repo", label: "no public repo" };
      if (!l) return { key: "none", label: "no license detected" };
      if (l === "NOASSERTION") return { key: "unknown", label: "unknown license" };
      return { key: l, label: l };
    };
    const propsOf = (t, facet) =>
      (t.properties || []).filter(p => facet[p]).map(p => ({ key: p, label: facet[p].label }));
    const TRAIT_KINDS = [
      { key: "lang", label: "Language", source: "from the builder tools catalog",
        of: t => propsOf(t, LanguageProperties) },
      { key: "iface", label: "Interface", source: "from the builder tools catalog",
        of: t => propsOf(t, InterfaceProperties) },
      { key: "license", label: "License", source: "from the GitHub repository",
        of: t => [licenseOf(t)] },
      { key: "cap", label: "Cardano capability", source: "detected from the latest release",
        of: t => capabilitiesOf(t).map(c => ({ key: c.key, label: c.label, note: c.via.map(x => x.replace("cip", "CIP-")).join(", ") })) },
    ];
    const KIND = Object.fromEntries(TRAIT_KINDS.map(k => [k.key, k]));
    const DEFAULT_KINDS = ["lang", "cap"];
    let visibleKinds = new Set(DEFAULT_KINDS);

    const healthOf = t => {
      const l = latestOf(t);
      const tags = [];
      if (l.archived) tags.push({ cls: "bad", text: "archived", tip: "Archived on GitHub" });
      const age = daysSince(l.lastCommitDate);
      if (age !== null && age > STALE_DAYS)
        tags.push({ cls: "warn", text: "stale", tip: `No commits since ${fmtDate(l.lastCommitDate)}` });
      if (l.prerelease) tags.push({ cls: "warn", text: "pre-release", tip: "Latest is a pre-release: none of the last 10 releases is stable" });
      if (!tags.length && age !== null)
        tags.push({ cls: "ok", text: "active", tip: `Last commit ${fmtDate(l.lastCommitDate)}` });
      return tags;
    };
    const healthRank = t => {
      const tags = healthOf(t).map(h => h.text);
      return tags.includes("archived") ? 3 : tags.includes("stale") ? 2 : tags.includes("pre-release") ? 1 : tags.length ? 0 : 4;
    };

    const releaseDate = t => { const l = latestOf(t); return l.publishedAt || l.lastCommitDate || null; };
    const versionOf = t => latestOf(t).version || null;

    // Everything reachable from `title` in the tree's current direction, as
    // title -> steps from `title` along the shortest path (the tree's
    // shallowest occurrence)
    function branchOf(title) {
      const isDep = document.querySelector("input[name='direction']:checked").value === "deps";
      const next = isDep
        ? t => depsOf(byTitle.get(t) || {}).filter(d => byTitle.has(d))
        : t => [...(reverseDeps.get(t) ?? [])].map(x => x.title);
      const depth = new Map([[title, 0]]);
      const queue = [title];
      for (let i = 0; i < queue.length; i++) {
        const d = depth.get(queue[i]) + 1;
        for (const n of next(queue[i])) if (!depth.has(n)) { depth.set(n, d); queue.push(n); }
      }
      return depth;
    }

    // The matrix filter: a tool (alone or with its branch), or traits (at
    // most one per kind, all of which a tool must have)
    const noSelection = () => ({ tool: null, branch: false, traits: {} });
    let selection = noSelection();
    const traitFilters = () => Object.entries(selection.traits);
    const hasTraits = t => traitFilters().every(([kind, key]) => KIND[kind].of(t).some(x => x.key === key));
    const traitLabel = (kind, key) => {
      for (const t of BuilderTools) {
        const x = KIND[kind].of(t).find(y => y.key === key);
        if (x) return x.label;
      }
      return key;
    };
    let matrixSearch = "";
    let matrixSort = { key: "tool", dir: 1 };
    // Steps from the selected tool for each tool in its branch (empty
    // without a branch selection); set by matrixRows()
    let branchDepth = new Map();
    // The dependency last peeked at from the matrix, and which occurrence
    let peek = { title: null, i: 0 };

    // Peek at a tool in the tree, without selecting it; peeking at the same
    // one again moves on to its next occurrence
    function peekInTree(title) {
      if (wrapEl.classList.contains("tree-collapsed")) {
        setTreeOpen(true);
        if (isPhone()) setMatrixOpen(false);
      }
      peek = { title, i: peek.title === title ? peek.i + 1 : 0 };
      revealInTree(title, true, "peek", peek.i);
    }

    // A new selection picks its sort: branch order for a branch, and back
    // to A–Z from branch order otherwise
    function sortForSelection() {
      if (selection.branch) matrixSort = { key: "branch", dir: 1 };
      else if (matrixSort.key === "branch") matrixSort = { key: "tool", dir: 1 };
    }

    const wrapEl = document.getElementById("btt-wrap");
    const matrixEl = document.getElementById("matrix");
    const matrixCountEl = document.getElementById("matrixCount");
    const selChipEl = document.getElementById("selChip");
    const sortSel = document.getElementById("matrixSort");

    const SORTS = {
      tool:       t => t.title.toLowerCase(),
      branch:     t => branchDepth.get(t.title) ?? Infinity,
      latest:     t => -(new Date(releaseDate(t) || 0).getTime()),
      dependents: t => -((reverseDeps.get(t.title)?.size) || 0),
      readiness:  t => { const r = readinessOf(t).rank; return r === null ? 9 : 3 - r; },
      health:     t => healthRank(t),
    };

    function matrixRows() {
      let rows;
      branchDepth = selection.branch && byTitle.has(selection.tool) ? branchOf(selection.tool) : new Map();
      if (traitFilters().length) {
        rows = sorted.filter(hasTraits);
      } else if (selection.tool && byTitle.has(selection.tool)) {
        const titles = selection.branch ? branchDepth : new Set([selection.tool]);
        rows = sorted.filter(t => titles.has(t.title));
      } else {
        rows = activeCategories.size === allCatKeys.size
          ? sorted
          : sorted.filter(t => activeCategories.has(t.category));
      }
      const q = matrixSearch.trim().toLowerCase();
      if (q) rows = rows.filter(t => t.title.toLowerCase().includes(q));
      const key = SORTS[matrixSort.key];
      return [...rows].sort((a, b) => {
        const ka = key(a), kb = key(b);
        if (ka < kb) return -matrixSort.dir;
        if (ka > kb) return matrixSort.dir;
        return a.title.localeCompare(b.title);
      });
    }

    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };

    function depCell(t) {
      const cell = el("td", "m-deps");
      cell.dataset.label = "Depends on";
      const hard = new Set(hardDepsOf(t));
      const deps = depsOf(t).map(d => byTitle.get(d)).filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title));
      if (!deps.length) { cell.appendChild(el("span", "m-none", "—")); return cell; }
      for (const d of deps) {
        const date = releaseDate(d);
        const age = daysSince(date);
        const chip = el("button", "dep-chip");
        chip.type = "button";
        chip.addEventListener("click", e => {
          e.stopPropagation();
          peekInTree(d.title);
        });
        if (!hard.has(d.title)) chip.classList.add("soft");
        if (branchDepth.has(d.title)) chip.classList.add("in-branch");
        const isTip = versionOf(d) === "tip";
        if (!isTip && age !== null && age <= RECENT_DAYS) chip.classList.add("recent");
        chip.appendChild(el("span", "dep-name", d.title));
        const v = versionOf(d);
        if (v) chip.appendChild(el("span", "dep-ver", v));
        chip.title = [
          `${d.title}${v ? " " + v : ""}`,
          !date ? "no release data"
            : isTip ? `no releases; last commit ${fmtDate(date)}`
            : `released ${fmtDate(date)}${age <= RECENT_DAYS ? ` (${Math.round(age)} days ago)` : ""}`,
          hard.has(d.title) ? "dependency" : "soft reference (documented integration)",
        ].join("\n");
        cell.appendChild(chip);
      }
      return cell;
    }

    function renderMatrix() {
      if (!matrixEl) return;
      const rows = matrixRows();
      const filters = traitFilters();
      const selected = !!filters.length || (selection.tool && byTitle.has(selection.tool));

      // selection chip
      selChipEl.innerHTML = "";
      selChipEl.hidden = !selected;
      if (selected) {
        selChipEl.appendChild(el("span", "", filters.length
          ? filters.map(([kind, key]) => `${KIND[kind].label}: ${traitLabel(kind, key)}`).join(" · ")
          : `${selection.branch ? "Branch" : "Tool"}: ${selection.tool}`));
        const x = el("button", "chip-x", "×");
        x.type = "button";
        x.title = "Clear filter";
        x.addEventListener("click", () => selectTool(null));
        selChipEl.appendChild(x);
      }
      matrixCountEl.textContent = `${rows.length} of ${BuilderTools.length} tools`;

      const table = el("table", "matrix-table");
      const thead = el("thead");
      const hr = el("tr");
      const COLS = [
        ["tool", "Tool"], ["latest", "Latest release"], [null, "Depends on (latest releases)"],
        ["dependents", "Depended\non by"],
        ["readiness", "Readiness"],
        [null, "Traits"], ["health", "Health"],
      ];
      for (const [key, label] of COLS) {
        const th = el("th", key ? "sortable" : "", label);
        if (key) {
          if (matrixSort.key === key) th.dataset.dir = matrixSort.dir > 0 ? "asc" : "desc";
          // With a branch selected, Tool cycles branch order -> A–Z -> Z–A
          const branchCycle = key === "tool" && selection.branch;
          if (branchCycle && matrixSort.key === "branch") {
            th.dataset.dir = "branch";
            th.title = `Branch order: ${selection.tool}, then the tools one step away, then two…`;
          }
          th.addEventListener("click", () => {
            if (branchCycle && matrixSort.key === "branch") matrixSort = { key: "tool", dir: 1 };
            else if (branchCycle && matrixSort.key === "tool" && matrixSort.dir < 0) matrixSort = { key: "branch", dir: 1 };
            else matrixSort = matrixSort.key === key ? { key, dir: -matrixSort.dir } : { key, dir: 1 };
            renderMatrix();
          });
        }
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      table.appendChild(thead);
      const branchOpt = sortSel.querySelector("option[value='branch:1']");
      branchOpt.hidden = branchOpt.disabled = !selection.branch;
      sortSel.value = `${matrixSort.key}:${matrixSort.dir}`;

      const tbody = el("tbody");
      for (const t of rows) {
        const tr = el("tr");
        if (t.title === selection.tool) tr.classList.add("is-selected");
        // A quiet shortcut (no pointer cursor): clicking a row peeks at its
        // tool in the tree, unless the click hit a control or selected text.
        // Not on phones, where it would swap the matrix for the tree.
        tr.addEventListener("click", e => {
          if (isPhone()) return;
          if (e.target.closest("button, a, input, select")) return;
          if (String(window.getSelection())) return;
          peekInTree(t.title);
        });

        const tdTool = el("td", "m-tool");
        const dot = el("span", "dot");
        dot.style.background = colorFor(t.category);
        dot.title = t.category;
        const name = el("span", "label", t.title);
        // In a branch: indent by level in branch order, and show the level
        const depth = branchDepth.get(t.title);
        if (depth && matrixSort.key === "branch")
          tdTool.appendChild(el("span", "m-indent")).style.width = `${Math.min(depth, 6) * 0.9}em`;
        if (depth) {
          const lvl = el("span", "m-depth", String(depth));
          lvl.title = `${depth} step${depth > 1 ? "s" : ""} from ${selection.tool}`;
          tdTool.appendChild(lvl);
        }
        tdTool.append(dot, name, makeToolActions(t));
        attachTooltip(tdTool, t);
        tr.appendChild(tdTool);

        const date = releaseDate(t);
        const tdLatest = el("td", "m-latest");
        tdLatest.dataset.label = "Latest";
        if (versionOf(t) || date) {
          const ver = tdLatest.appendChild(el("span", "m-ver", versionOf(t) || ""));
          if (versionOf(t)) ver.title = versionOf(t);
          if (date) {
            const d = el("span", "m-date", fmtDate(date));
            if (versionOf(t) !== "tip" && daysSince(date) <= RECENT_DAYS) d.classList.add("recent");
            if (versionOf(t) === "tip") d.title = "No releases; date of the last commit";
            tdLatest.appendChild(d);
          }
        } else tdLatest.appendChild(el("span", "m-none", "no repository data"));
        tr.appendChild(tdLatest);

        tr.appendChild(depCell(t));

        const users = [...(reverseDeps.get(t.title) ?? [])].map(x => x.title).sort();
        const tdUsers = el("td", "m-users", users.length ? String(users.length) : "—");
        tdUsers.dataset.label = "Used by";
        if (users.length) tdUsers.title = users.join(", ");
        tr.appendChild(tdUsers);

        const r = readinessOf(t);
        const tdReady = el("td", "m-ready");
        tdReady.dataset.label = "Readiness";
        const mark = el("span", `rd-mark rd-${r.cls}`, r.text || "—");
        mark.title = r.tip;
        if (r.curated) mark.classList.add("curated");
        tdReady.appendChild(mark);
        const { blockers, unknown } = blockersOf(t);
        if (blockers.length) {
          const b = el("div", "rd-blockers", "blocked by ");
          blockers.forEach((x, i) => {
            const n = el("span", `rd-dep rd-${x.cls}`, x.title);
            n.title = `${x.title}: ${x.text}`;
            b.appendChild(n);
            if (i < blockers.length - 1) b.appendChild(document.createTextNode(", "));
          });
          tdReady.appendChild(b);
        }
        if (unknown.length) {
          const u = el("div", "rd-unknown", `${unknown.length} dep${unknown.length > 1 ? "s" : ""} no info`);
          u.title = unknown.join(", ");
          tdReady.appendChild(u);
        }
        tr.appendChild(tdReady);

        const tdTraits = el("td", "m-traits");
        tdTraits.dataset.label = "Traits";
        for (const kind of TRAIT_KINDS) {
          if (!visibleKinds.has(kind.key)) continue;
          for (const x of kind.of(t)) {
            const tag = el("button", `trait-tag k-${kind.key}`, x.label);
            tag.type = "button";
            if (selection.traits[kind.key] === x.key) tag.classList.add("active");
            tag.title = `${kind.label}${x.note ? ` (${x.note})` : ""}, ${kind.source}`;
            tag.addEventListener("click", () => toggleTrait(kind.key, x.key));
            tdTraits.appendChild(tag);
          }
        }
        if (!tdTraits.childNodes.length) tdTraits.appendChild(el("span", "m-none", "—"));
        tr.appendChild(tdTraits);

        const tdHealth = el("td", "m-health");
        for (const h of healthOf(t)) {
          const tag = el("span", `health-tag ${h.cls}`, h.text);
          tag.title = h.tip;
          tdHealth.appendChild(tag);
        }
        tr.appendChild(tdHealth);

        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      matrixEl.innerHTML = "";
      if (rows.length) matrixEl.appendChild(table);
      else matrixEl.appendChild(el("div", "m-empty", "No tools match."));
      updateMatrixScroll();
    }

    // Too wide for the page (but not a phone, where rows are cards): the
    // matrix becomes a panel two thirds of the viewport under the pinned stack
    // and scrolls both ways, with the tool column pinned on the left.
    function updateMatrixScroll() {
      const table = matrixEl.querySelector("table");
      const on = wrapEl.classList.contains("matrix-open") && !isPhone()
        && !!table && table.offsetWidth > matrixEl.clientWidth;
      wrapEl.classList.toggle("matrix-scroll", on);
    }

    // ---- selection, matrix open state, URL --------------------------------
    function markSelectionInTree() {
      const branch = traitFilters().length
        ? new Set(sorted.filter(hasTraits).map(t => t.title))
        : selection.tool && selection.branch ? branchOf(selection.tool) : null;
      treeEl.querySelectorAll(".node-row").forEach(r => {
        const t = r.dataset.title;
        r.classList.toggle("is-selected", t === selection.tool);
        r.classList.toggle("in-branch", !!branch && t !== selection.tool && branch.has(t));
      });
    }

    function writeUrl() {
      const url = new URL(window.location.href);
      const p = url.searchParams;
      if (selection.tool) p.set("tool", selection.tool); else p.delete("tool");
      if (selection.tool && selection.branch) p.set("branch", "1"); else p.delete("branch");
      for (const kind of TRAIT_KINDS) {
        if (selection.traits[kind.key]) p.set(kind.key, selection.traits[kind.key]); else p.delete(kind.key);
      }
      const kinds = TRAIT_KINDS.map(k => k.key).filter(k => visibleKinds.has(k));
      if (kinds.join() !== TRAIT_KINDS.map(k => k.key).filter(k => DEFAULT_KINDS.includes(k)).join()) p.set("kinds", kinds.join());
      else p.delete("kinds");
      if (wrapEl.classList.contains("matrix-open")) p.set("matrix", "1"); else p.delete("matrix");
      if (wrapEl.classList.contains("tree-collapsed")) p.set("tree", "0"); else p.delete("tree");
      if (readinessSource !== "repos") p.set("source", readinessSource); else p.delete("source");
      if (readinessSource === "intersect" && readinessNet !== "mainnet") p.set("net", readinessNet); else p.delete("net");
      window.history.replaceState(window.history.state, "", url.toString());
    }

    // Phones show one panel at a time: opening the tree or the matrix
    // collapses the other
    function isPhone() { return window.matchMedia("(max-width: 700px)").matches; }

    function setMatrixOpen(open, scroll = true) {
      wrapEl.classList.toggle("matrix-open", open);
      if (open && isPhone()) setTreeOpen(false);
      updateMatrixScroll();
      document.getElementById("matrixToggle").setAttribute("aria-expanded", String(open));
      if (open && scroll) {
        const nav = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--ifm-navbar-height")) || 60;
        window.scrollTo({ top: wrapEl.getBoundingClientRect().top + window.scrollY - nav, behavior: "smooth" });
      }
      writeUrl();
    }

    function selectTool(title, branch = false) {
      selection = { ...noSelection(), tool: title, branch: !!(title && branch) };
      sortForSelection();
      const opening = title && !wrapEl.classList.contains("matrix-open");
      if (opening) setMatrixOpen(true);
      markSelectionInTree();
      renderMatrix();
      writeUrl();
      if (title) revealInTree(title, !opening);
    }

    // Bring the selected tool's row into view in the tree: its shallowest
    // occurrence (a tool can appear under several parents), expanding any
    // collapsed ancestors, and scrolling the tree panel, plus the page when
    // the panel itself is out of sight under the pinned controls.
    // `mark` is the class that briefly highlights the row: "flash" for a
    // selection, "peek" for a look that leaves the selection alone.
    // `occurrence` picks another occurrence instead (shallowest first, then
    // deeper ones in tree order), wrapping around.
    function revealInTree(title, scrollPage, mark = "flash", occurrence = 0) {
      if (wrapEl.classList.contains("tree-collapsed")) return;
      const depth = r => { let d = 0; for (let n = r.parentElement; n && n !== treeEl; n = n.parentElement) if (n.classList.contains("node")) d++; return d; };
      const rows = [...treeEl.querySelectorAll(".node-row")]
        .filter(r => r.dataset.title === title)
        .map(r => ({ r, d: depth(r) }))
        .sort((a, b) => a.d - b.d)
        .map(x => x.r);
      if (!rows.length) return;
      const row = rows[occurrence % rows.length];

      for (let n = row.parentElement.parentElement; n && n !== treeEl; n = n.parentElement)
        if (n.classList.contains("node")) n.classList.remove("collapsed");

      const panel = document.getElementById("tree-panel");
      const pinnedBottom = headerEl.getBoundingClientRect().bottom;
      const pr = panel.getBoundingClientRect();
      if (scrollPage && (pr.top < pinnedBottom || pr.top > window.innerHeight - 80)) {
        const nav = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--ifm-navbar-height")) || 60;
        window.scrollTo({ top: wrapEl.getBoundingClientRect().top + window.scrollY - nav, behavior: "smooth" });
      }
      // Wait for the expand transition before measuring the row's position
      setTimeout(() => {
        if (wrapEl.classList.contains("matrix-open")) {
          const top = row.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
          if (top < panel.scrollTop || top > panel.scrollTop + panel.clientHeight - row.offsetHeight)
            panel.scrollTo({ top: Math.max(0, top - panel.clientHeight / 3), behavior: "smooth" });
        } else {
          row.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        row.classList.remove("flash", "peek");
        void row.offsetWidth;
        row.classList.add(mark);
      }, 280);
    }

    // Clicking a trait adds it to the filter, replacing another of its kind;
    // clicking an active one removes it.  A tool selection is dropped.
    function toggleTrait(kind, key) {
      const traits = selection.tool ? {} : { ...selection.traits };
      if (traits[kind] === key) delete traits[kind]; else traits[kind] = key;
      selection = { ...noSelection(), traits };
      sortForSelection();
      markSelectionInTree();
      renderMatrix();
      writeUrl();
    }

    // Tree panel toggle (the "Dependency / Dependents tree" title)
    const treeToggle = document.getElementById("treeToggle");
    function setTreeOpen(open) {
      wrapEl.classList.toggle("tree-collapsed", !open);
      treeToggle.setAttribute("aria-expanded", String(open));
      writeUrl();
    }
    treeToggle.addEventListener("click", () => {
      const open = wrapEl.classList.contains("tree-collapsed");
      setTreeOpen(open);
      if (open && isPhone() && wrapEl.classList.contains("matrix-open")) setMatrixOpen(false);
    });

    // Pinned stack while the matrix is open: the header sticks under the
    // navbar, the footer (labels + matrix bar) under the header, and the
    // matrix's column headings under both.  Their offsets follow the header
    // and footer heights, which change as controls wrap.
    const headerEl = wrapEl.querySelector(".btt-header");
    const footerEl = wrapEl.querySelector(".btt-footer");
    const setPinOffsets = () => {
      wrapEl.style.setProperty("--btt-header-h", `${headerEl.offsetHeight}px`);
      wrapEl.style.setProperty("--btt-footer-h", `${footerEl.offsetHeight}px`);
    };
    setPinOffsets();
    if (typeof ResizeObserver !== "undefined") {
      // A frame later: in scroll mode the offsets resize the matrix, which
      // is observed too and must not change inside this callback
      const ro = new ResizeObserver(() => requestAnimationFrame(setPinOffsets));
      ro.observe(headerEl);
      ro.observe(footerEl);
      // Width changes only, a frame later: toggling the class resizes the
      // matrix, which must not re-enter this observer in the same frame
      let matrixW = 0;
      new ResizeObserver(([e]) => {
        const w = e.contentRect.width;
        if (w === matrixW) return;
        matrixW = w;
        requestAnimationFrame(updateMatrixScroll);
      }).observe(matrixEl);
    }

    document.getElementById("matrixToggle").addEventListener("click", () =>
      setMatrixOpen(!wrapEl.classList.contains("matrix-open")));
    // Phones hide the column headings; this picks the sort instead
    sortSel.addEventListener("change", () => {
      const [key, dir] = sortSel.value.split(":");
      matrixSort = { key, dir: Number(dir) };
      renderMatrix();
    });
    document.getElementById("matrixSearch").addEventListener("input", e => {
      matrixSearch = e.target.value;
      renderMatrix();
    });

    // Readiness source + network: re-render tree marks and the matrix
    const sourceSel = document.getElementById("readinessSource");
    const netSel = document.getElementById("readinessNet");
    const sourceLink = document.getElementById("readinessLink");
    function syncReadinessControls() {
      sourceSel.value = readinessSource;
      netSel.value = readinessNet;
      const isInt = readinessSource === "intersect";
      netSel.hidden = !isInt;
      sourceLink.hidden = !isInt;
      if (isInt) {
        sourceLink.href = IntersectReadiness.source.sheetUrl;
        sourceLink.textContent = "Tracker ↗";
        sourceLink.title = `Synced ${IntersectReadiness.source.syncedAt.slice(0, 10)}`;
      }
    }
    sourceSel.addEventListener("change", () => {
      readinessSource = sourceSel.value;
      syncReadinessControls();
      renderTree();
      writeUrl();
    });
    netSel.addEventListener("change", () => {
      readinessNet = netSel.value;
      renderTree();
      writeUrl();
    });

    // Trait kinds: a popup of checkboxes choosing which kinds the Traits
    // column shows; it closes on a click outside or Escape
    const kindsWrap = document.getElementById("kindsWrap");
    const kindsBtn = document.getElementById("kindsBtn");
    const kindsPop = document.getElementById("kindsPop");
    for (const kind of TRAIT_KINDS) {
      const label = el("label", "soft-toggle");
      label.title = `Shown as traits, ${kind.source}`;
      const box = el("input");
      box.type = "checkbox";
      box.value = kind.key;
      box.addEventListener("change", () => {
        if (box.checked) visibleKinds.add(kind.key); else visibleKinds.delete(kind.key);
        renderMatrix();
        writeUrl();
      });
      label.append(box, document.createTextNode(kind.label));
      kindsPop.appendChild(label);
    }
    function syncKindsPop() {
      kindsPop.querySelectorAll("input").forEach(b => { b.checked = visibleKinds.has(b.value); });
    }
    function setKindsOpen(open) {
      kindsPop.hidden = !open;
      kindsBtn.setAttribute("aria-expanded", String(open));
    }
    kindsBtn.addEventListener("click", () => setKindsOpen(kindsPop.hidden));
    document.addEventListener("click", e => { if (!kindsWrap.contains(e.target)) setKindsOpen(false); });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !kindsPop.hidden) { setKindsOpen(false); kindsBtn.focus(); }
    });

    // Initial state from the URL (?tool=Ogmios&branch=1&matrix=1)
    {
      const p = new URLSearchParams(window.location.search);
      if (READINESS_SOURCES[p.get("source")]) readinessSource = p.get("source");
      if (NETWORK_LABELS[p.get("net")]) readinessNet = p.get("net");
      syncReadinessControls();
      const t = p.get("tool");
      // Trait kinds shown, and trait filters: a filtered kind is always shown
      const kinds = p.get("kinds");
      if (kinds !== null) visibleKinds = new Set(kinds.split(",").filter(k => KIND[k]));
      const traits = {};
      for (const kind of TRAIT_KINDS) {
        const v = p.get(kind.key);
        if (v && BuilderTools.some(x => kind.of(x).some(y => y.key === v))) {
          traits[kind.key] = v;
          visibleKinds.add(kind.key);
        }
      }
      if (Object.keys(traits).length) selection = { ...noSelection(), traits };
      else if (t && byTitle.has(t)) selection = { ...noSelection(), tool: t, branch: p.get("branch") === "1" };
      sortForSelection();
      syncKindsPop();
      if (p.get("matrix") === "1" || selection.tool || traitFilters().length) setMatrixOpen(true, false);
      if (p.get("tree") === "0") setTreeOpen(false);
    }

    renderTree();

    // ---- view/direction/soft-refs toggles --------------------------------
    document.querySelectorAll("input[name='view'], input[name='direction']").forEach(radio =>
      radio.addEventListener("change", renderTree));
    document.getElementById("softRefs").addEventListener("change", renderTree);

    // ---- global controls -------------------------------------------------
    const allNodesWithChildren = () =>
      treeEl.querySelectorAll(".node:has(> .children)");

    allNodesWithChildren().forEach(n => n.classList.add("collapsed"));

    document.getElementById("expandAll").addEventListener("click", () =>
      allNodesWithChildren().forEach(n => n.classList.remove("collapsed")));

    document.getElementById("collapseAll").addEventListener("click", () =>
      allNodesWithChildren().forEach(n => n.classList.add("collapsed")));

    // ---- legend ----------------------------------------------------------
    const legend = document.getElementById("legend");

    function updateLegendVisuals() {
      const allActive = activeCategories.size === allCatKeys.size;
      legend.querySelectorAll(".legend-item[data-cat]").forEach(item => {
        item.classList.toggle("dimmed", !allActive && !activeCategories.has(item.dataset.cat));
      });
    }

    function buildLegendRow(groupLabel, cats) {
      const row = document.createElement("div");
      row.className = "legend-row";

      const lbl = document.createElement("span");
      lbl.className = "legend-group-label";
      lbl.textContent = groupLabel;
      row.appendChild(lbl);

      cats.forEach(({ key, label }) => {
        const item = document.createElement("div");
        item.className = "legend-item";
        item.dataset.cat = key;

        const d = document.createElement("span");
        d.className = "dot";
        d.style.background = colorFor(key);

        const t = document.createElement("span");
        t.textContent = label;

        item.append(d, t);

        item.addEventListener("click", e => {
          if (e.ctrlKey || e.metaKey) {
            if (activeCategories.has(key)) {
              activeCategories.delete(key);
              if (activeCategories.size === 0) activeCategories = new Set(allCatKeys);
            } else {
              activeCategories.add(key);
            }
          } else {
            if (activeCategories.size === 1 && activeCategories.has(key)) {
              activeCategories = new Set(allCatKeys);
            } else {
              activeCategories = new Set([key]);
            }
          }
          updateLegendVisuals();
          if (selection.tool || traitFilters().length) { selection = noSelection(); sortForSelection(); writeUrl(); }
          renderTree();
        });

        row.appendChild(item);
      });

      return row;
    }

    legend.appendChild(buildLegendRow("Builder Tools:", BUILDER_TOOLS_CATS));
    legend.appendChild(buildLegendRow("Utilities & more:", UTILITIES_CATS));
  }, []);

  if (!ExecutionEnvironment.canUseDOM) return null;

  return (
    <div className="btt-wrap" id="btt-wrap">
      <div id="tool-tooltip"></div>

      <div className="btt-header">
        <div className="brand">
          <button type="button" className="ctl panel-toggle" id="treeToggle" aria-expanded="true" aria-controls="tree-panel">
            <span className="caret" aria-hidden>▸</span> <span id="treeTitle">Dependents tree</span>
          </button>
          <span className="sub" id="viewSub"></span>
        </div>

        <div className="view-toggle">
          <input type="radio" name="direction" id="dirDeps" value="deps" />
          <label htmlFor="dirDeps">Dependencies</label>
          <input type="radio" name="direction" id="dirDependents" value="dependents" defaultChecked />
          <label htmlFor="dirDependents">Dependents</label>
        </div>

        <div className="view-toggle">
          <input type="radio" name="view" id="viewConsumers" value="consumers" defaultChecked />
          <label htmlFor="viewConsumers">Top-level</label>
          <input type="radio" name="view" id="viewAll" value="all" />
          <label htmlFor="viewAll">All tools</label>
        </div>

        <label className="soft-toggle" title="Include soft references (integrations, optional companions) as dependency edges">
          <input type="checkbox" id="softRefs" defaultChecked />
          Soft refs
        </label>

        <div className="controls">
          <button className="ctl" id="expandAll">Expand all</button>
          <button className="ctl" id="collapseAll">Collapse all</button>
        </div>

        <span className="tool-count" id="toolCount"></span>
      </div>

      <div className="btt-main" id="tree-panel">
        <div id="tree"></div>
      </div>

      <div className="btt-footer">
        <div id="legend" className="btt-legend"></div>

        <div className="btt-matrix-bar">
          <button type="button" className="ctl panel-toggle matrix-toggle" id="matrixToggle" aria-expanded="false" aria-controls="matrix">
            <span className="caret" aria-hidden>▸</span> Trait matrix
          </button>
          <span className="sel-chip" id="selChip" hidden></span>
          <label className="rd-control">
            Readiness
            <select id="readinessSource" defaultValue="repos" aria-label="Readiness source">
              <option value="repos">Repos · Conway (detected)</option>
              <option value="intersect">Intersect tracker · Dijkstra (PV12)</option>
            </select>
            <select id="readinessNet" defaultValue="mainnet" aria-label="Network" hidden>
              <option value="musashi">Musashi</option>
              <option value="dijkstranet">DijkstraNet</option>
              <option value="preview">Preview</option>
              <option value="preprod">PreProd</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </label>
          <a className="rd-link" id="readinessLink" target="_blank" rel="noopener noreferrer" hidden></a>
          <input type="search" className="matrix-search" id="matrixSearch" placeholder="Filter tools…" aria-label="Filter the trait matrix by tool name" />
          <select className="matrix-sort" id="matrixSort" defaultValue="tool:1" aria-label="Sort the trait matrix">
            <option value="branch:1" hidden disabled>Branch order</option>
            <option value="tool:1">Name A–Z</option>
            <option value="tool:-1">Name Z–A</option>
            <option value="latest:1">Newest release</option>
            <option value="latest:-1">Oldest release</option>
            <option value="dependents:1">Most depended on</option>
            <option value="dependents:-1">Least depended on</option>
            <option value="readiness:1">Most ready</option>
            <option value="readiness:-1">Least ready</option>
            <option value="health:1">Healthiest</option>
            <option value="health:-1">Least healthy</option>
          </select>
          <span className="tool-count" id="matrixCount"></span>
          <span className="kinds-wrap" id="kindsWrap">
            <button type="button" className="kinds-btn" id="kindsBtn" aria-expanded="false" aria-controls="kindsPop" aria-haspopup="true">Trait kinds</button>
            <div className="kinds-pop" id="kindsPop" role="group" aria-label="Trait kinds shown in the matrix" hidden></div>
          </span>
        </div>
      </div>

      <div className="btt-matrix" id="matrix"></div>
    </div>
  );
}
