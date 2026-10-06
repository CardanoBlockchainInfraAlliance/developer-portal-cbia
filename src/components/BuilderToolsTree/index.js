import React, { useEffect, useRef } from "react";
import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import { BuilderTools } from "@site/src/data/builder-tools/enriched-tools.js";
import "./tree.css";

export default function BuilderToolsTree() {
  const initialized = useRef(false);

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
    };
    const colorFor = c => CATEGORY_COLORS[c] || "#8b98ad";

    // ---- tool tooltip ----------------------------------------------------
    const toolTip = document.getElementById("tool-tooltip");
    let tipTouchTimer = null;
    let tipHoverTimer = null;

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
      if (!maker && !desc) return;
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
      const r = row.getBoundingClientRect();
      const tipW = 340;
      let left = r.left;
      if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
      toolTip.style.left = Math.max(8, left) + "px";
      toolTip.style.top  = Math.min(r.bottom + 6, window.innerHeight - 80) + "px";
      toolTip.classList.add("visible");
    }

    function hideToolTip() {
      toolTip.classList.remove("visible");
      clearTimeout(tipTouchTimer);
      clearTimeout(tipHoverTimer);
    }

    function attachTooltip(row, tool) {
      row.addEventListener("mouseenter", () => {
        clearTimeout(tipHoverTimer);
        tipHoverTimer = setTimeout(() => showToolTip(row, tool), 1500);
      });
      row.addEventListener("mouseleave", hideToolTip);
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

    // ---- era compatibility -----------------------------------------------
    const effectiveEra = t => {
      const era = latestOf(t).cardanoEra;
      return (era && era !== "unknown") ? era : null;
    };

    // ---- compat popover --------------------------------------------------
    const popover = document.getElementById("compat-popover");

    function showCompatPopover(badge, parentName, parentEra, childName, childEra) {
      const ok = parentEra === childEra;
      popover.innerHTML = `
        <div class="pop-title">era compatibility</div>
        <div class="pop-row"><span class="pop-tool">${parentName}</span><span class="pop-era">${parentEra}</span></div>
        <hr class="pop-divider">
        <div class="pop-row"><span class="pop-tool">${childName}</span><span class="pop-era">${ok ? childEra : '<span style="color:#ff7b72">' + childEra + "</span>"}</span></div>
      `;
      const r = badge.getBoundingClientRect();
      const pw = popover.offsetWidth || 240;
      let left = r.right + 8;
      if (left + pw > window.innerWidth - 8) left = r.left - pw - 8;
      popover.style.left = Math.max(8, left) + "px";
      popover.style.top  = Math.max(8, r.top - 4) + "px";
      popover.classList.add("visible");
    }

    document.addEventListener("click", e => {
      if (!e.target.classList.contains("compat-badge")) {
        popover.classList.remove("visible");
      }
    });

    function makeCompatBadge(parentEra, childEra, parentName, childName) {
      if (!parentEra || !childEra) return null;
      const ok = parentEra === childEra;
      const badge = document.createElement("span");
      badge.className = `compat-badge ${ok ? "compat-ok" : "compat-not"}`;
      badge.textContent = ok ? "OK" : "≠";
      badge.addEventListener("click", e => {
        e.stopPropagation();
        showCompatPopover(badge, parentName, parentEra, childName, childEra);
      });
      return badge;
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
    ];
    const ALL_LEGEND_CATS = [...BUILDER_TOOLS_CATS, ...UTILITIES_CATS];
    const allCatKeys = new Set(ALL_LEGEND_CATS.map(c => c.key));
    let activeCategories = new Set(allCatKeys);

    // ---- render ----------------------------------------------------------
    const treeEl = document.getElementById("tree");
    const toolCountEl = document.getElementById("toolCount");
    const viewSub = document.getElementById("viewSub");
    const VIEW_SUBS = {
      deps_consumers:       "Dependency tree [what each depends on] · tools nothing else depends on",
      deps_all:             "Dependency tree [what each depends on] · all tools",
      dependents_consumers: "Dependents tree [what depends on each] · foundation tools",
      dependents_all:       "Dependents tree [what depends on each] · all tools",
    };

    function buildNode(tool, ancestors, parentEra = null, parentName = null) {
      const node = document.createElement("div");
      node.className = "node";

      const row = document.createElement("div");
      row.className = "node-row";

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

      const badge = makeCompatBadge(parentEra, effectiveEra(tool), parentName, tool.title);
      if (badge) row.appendChild(badge);

      attachTooltip(row, tool);
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

      if (childTitles.length) {
        toggle.textContent = "▾";
        row.classList.add("interactive");

        const childrenWrap = document.createElement("div");
        childrenWrap.className = "children";
        const inner = document.createElement("div");
        inner.className = "inner";
        childrenWrap.appendChild(inner);

        const nextAncestors = new Set(ancestors).add(tool.title);
        const toolEra = effectiveEra(tool);
        childTitles
          .sort((a, b) => a.title.localeCompare(b.title))
          .forEach(child => inner.appendChild(buildNode(child, nextAncestors, toolEra, tool.title)));

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

    function buildNodeReverse(tool, ancestors, parentEra = null, parentName = null) {
      const node = document.createElement("div");
      node.className = "node";

      const row = document.createElement("div");
      row.className = "node-row";

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

      const badge = makeCompatBadge(parentEra, effectiveEra(tool), parentName, tool.title);
      if (badge) row.appendChild(badge);

      attachTooltip(row, tool);
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

      if (childTools.length) {
        toggle.textContent = "▾";
        row.classList.add("interactive");

        const childrenWrap = document.createElement("div");
        childrenWrap.className = "children";
        const inner = document.createElement("div");
        inner.className = "inner";
        childrenWrap.appendChild(inner);

        const nextAncestors = new Set(ancestors).add(tool.title);
        const toolEra = effectiveEra(tool);
        childTools
          .sort((a, b) => a.title.localeCompare(b.title))
          .forEach(child => inner.appendChild(buildNodeReverse(child, nextAncestors, toolEra, tool.title)));

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
      const knownEraCount = BuilderTools.filter(t => effectiveEra(t)).length;
      toolCountEl.innerHTML =
        `<strong>${BuilderTools.length}</strong> tools total · <strong>${filteredRoots.length}</strong> shown at root · <strong>${knownEraCount}</strong> known era`;
      if (viewSub) viewSub.textContent = VIEW_SUBS[`${dir}_${view}`];
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
    <div className="btt-wrap">
      <div id="compat-popover"></div>
      <div id="tool-tooltip"></div>

      <div className="btt-header">
        <div className="brand">
<span className="sub" id="viewSub">dependency tree · titles only · tools that nobody else depends on</span>
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

      <div className="btt-main">
        <div id="tree"></div>
      </div>

      <div id="legend" className="btt-legend"></div>
    </div>
  );
}
