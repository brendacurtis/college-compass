(function () {
  const { actToSat, SERVICE_ACADEMY, CATS, estimate, categorize } = window.CC;
  const SIGMA = 0.7;         // shared "applicant quality" strength for the realistic odds matrix

  /* ---- odds of at least k acceptances ---- */
  const XS = [], WS = [];
  (function () {
    const n = 41;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = -4 + (8 * i) / (n - 1);
      XS.push(x);
      const w = Math.exp(-0.5 * x * x);
      WS.push(w);
      sum += w;
    }
    for (let i = 0; i < n; i++) WS[i] /= sum;
  })();
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const logit = (p) => Math.log(p / (1 - p));
  function shiftFor(p, sigma) {
    if (sigma === 0) return logit(p);
    let lo = -20, hi = 12;
    for (let i = 0; i < 70; i++) {
      const a = (lo + hi) / 2;
      let m = 0;
      for (let j = 0; j < XS.length; j++) m += WS[j] * sigmoid(a + sigma * XS[j]);
      if (m < p) lo = a; else hi = a;
    }
    return (lo + hi) / 2;
  }
  function exactDist(ps) {
    let d = [1];
    for (const p of ps) {
      const nd = new Array(d.length + 1).fill(0);
      for (let k = 0; k < d.length; k++) {
        nd[k] += d[k] * (1 - p);
        nd[k + 1] += d[k] * p;
      }
      d = nd;
    }
    return d;
  }
  function atLeast(ps, sigma) {
    const n = ps.length;
    let d;
    if (sigma === 0) {
      d = exactDist(ps);
    } else {
      const a = ps.map((p) => shiftFor(p, sigma));
      d = new Array(n + 1).fill(0);
      for (let j = 0; j < XS.length; j++) {
        const dd = exactDist(a.map((ai) => sigmoid(ai + sigma * XS[j])));
        for (let k = 0; k <= n; k++) d[k] += WS[j] * dd[k];
      }
    }
    const out = new Array(n + 1);
    let tail = 0;
    for (let k = n; k >= 0; k--) { tail += d[k]; out[k] = tail; }
    return out;
  }

  /* ---- DOM ---- */
  const $ = (id) => document.getElementById(id);
  const form = $("builder-form");
  let mode = "sat";
  const scoreInput = $("score-input");

  function setMode(m) {
    mode = m;
    $("toggle-sat").classList.toggle("active", m === "sat");
    $("toggle-act").classList.toggle("active", m === "act");
    $("toggle-none").classList.toggle("active", m === "none");
    $("score-field").style.display = m === "none" ? "none" : "";
    if (m === "sat") {
      $("score-label").textContent = "SAT Score (400–1600)";
      scoreInput.min = 400; scoreInput.max = 1600; scoreInput.step = 10; scoreInput.placeholder = "e.g. 1350";
    } else if (m === "act") {
      $("score-label").textContent = "ACT Score (1–36)";
      scoreInput.min = 1; scoreInput.max = 36; scoreInput.step = 1; scoreInput.placeholder = "e.g. 28";
    }
    scoreInput.value = "";
  }
  $("toggle-sat").addEventListener("click", () => setMode("sat"));
  $("toggle-act").addEventListener("click", () => setMode("act"));
  $("toggle-none").addEventListener("click", () => setMode("none"));

  /* ---- build vs. check mode ---- */
  let listMode = "build";
  const BUILD_TEXT = ["Build My College List", "Enter your GPA and test score, how many schools you can apply to, and how many you want in each category. We'll pick a balanced list that favors the schools you're most likely to get into, and show your odds of getting at least 1, 2, 3 or more acceptances."];
  const CHECK_TEXT = ["Check My College List", "Already have a list? Enter your GPA and test score, add each school below, and we'll estimate your chance at every one, sort them into reach, high target, target and safety, and show your odds of at least 1, 2, 3 or more acceptances."];
  function setListMode(m) {
    listMode = m;
    const check = m === "check";
    $("mode-build").classList.toggle("active", !check);
    $("mode-check").classList.toggle("active", check);
    $("page-h1").textContent = (check ? CHECK_TEXT : BUILD_TEXT)[0];
    $("page-p").textContent = (check ? CHECK_TEXT : BUILD_TEXT)[1];
    $("total-field").style.display = check ? "none" : "";
    $("counts-block").style.display = check ? "none" : "";
    $("prefs-panel").style.display = check ? "none" : "";
    $("find-schools-btn").textContent = check ? "Check My List" : "Build My List";
    $("special-summary").textContent = check ? "Your schools: add each one, with your legacy status and application round" : "Legacy, early action / early decision, and must-have schools (optional)";
    $("special-note").textContent = check
      ? "Search for each school you're applying to and add it. For each, say whether you're a legacy there and whether you'll apply regular decision, early action, or binding early decision. You can change these again after checking."
      : "Legacy status and early rounds only help at specific schools, so add the schools you're a legacy at or are sure you want, and choose how you'll apply to each. You can also change these on any school after your list is built.";
    $("special-panel").open = check;
    $("results").hidden = true;
  }
  $("mode-build").addEventListener("click", () => setListMode("build"));
  $("mode-check").addEventListener("click", () => setListMode("check"));

  const countIds = { reach: "n-reach", high: "n-high", target: "n-target", safety: "n-safety" };
  function defaultCounts(N) {
    let reach = N >= 15 ? 3 : N >= 4 ? 2 : 1;
    let safety = N >= 14 ? 3 : N >= 5 ? 2 : 1;
    let high = Math.round(N * 0.22);
    let target = N - reach - safety - high;
    while (target < 1 && high > 0) { high--; target++; }
    while (target < 1 && reach > 1) { reach--; target++; }
    return { reach, high, target: Math.max(0, target), safety };
  }
  function readCounts() {
    const c = {};
    for (const k in countIds) c[k] = Math.max(0, Math.floor(Number($(countIds[k]).value) || 0));
    return c;
  }
  function updateSum() {
    const N = Math.floor(Number($("total-input").value) || 0);
    const c = readCounts();
    const sum = c.reach + c.high + c.target + c.safety;
    const line = $("sum-line");
    if (sum === N) {
      line.textContent = `${sum} of ${N} schools assigned.`;
      line.className = "sum-line ok";
    } else {
      line.textContent = `${sum} assigned, but your total is ${N}. Adjust the counts so they add up to ${N}.`;
      line.className = "sum-line bad";
    }
    return sum === N;
  }
  function applyDefaults() {
    const N = Math.floor(Number($("total-input").value) || 0);
    const c = defaultCounts(N);
    for (const k in countIds) $(countIds[k]).value = c[k];
    updateSum();
  }
  $("total-input").addEventListener("input", applyDefaults);
  Object.values(countIds).forEach((id) => $(id).addEventListener("input", updateSum));
  applyDefaults();

  let schools = [];
  let residency = {};
  (async () => {
    schools = await fetchSchools();
    for (const st of [...new Set(schools.map((s) => s.state).filter(Boolean))].sort()) {
      for (const id of ["p-state", "home-state"]) {
        const o = document.createElement("option");
        o.value = st; o.textContent = st;
        $(id).appendChild(o);
      }
    }
    residency = await window.CC.loadResidency();
  })();

  const personalize = (s, home) => window.CC.personalize(s, home, residency);

  /* ---- must-have schools (legacy / early settings set before building) ---- */
  const forced = new Map(); // id -> { legacy, round }
  const LEGACY_OPTS = [["none", "Not a legacy"], ["parent_ug", "Parent attended as undergrad"], ["parent_grad", "Parent attended grad school"], ["sibling", "Sibling / other relative"]];
  const ROUND_OPTS = [["rd", "Regular decision"], ["ea", "Early action (non-binding)"], ["ed", "Early decision (binding)"]];
  const optHtml = (opts, sel) => opts.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l}</option>`).join("");

  $("forced-search").addEventListener("input", () => {
    const q = $("forced-search").value.trim().toLowerCase();
    if (!q) { $("forced-results").innerHTML = ""; return; }
    const matches = schools
      .filter((s) => s.admit_rate !== null && s.control !== "Private for-profit" && !SERVICE_ACADEMY.test(s.name) && `${s.name} ${s.city} ${s.state}`.toLowerCase().includes(q))
      .sort((a, b) => (b.name.toLowerCase().startsWith(q) ? 1 : 0) - (a.name.toLowerCase().startsWith(q) ? 1 : 0) || a.name.length - b.name.length)
      .slice(0, 8);
    $("forced-results").innerHTML = matches.length
      ? matches.map((s) => `<div class="add-result-row"><span>${escapeHtml(s.name)} <span style="color:var(--muted)">— ${escapeHtml(s.city)}, ${escapeHtml(s.state)}</span></span>
          <button type="button" data-id="${s.id}" ${forced.has(s.id) ? "disabled" : ""}>${forced.has(s.id) ? "Added" : "Add"}</button></div>`).join("")
      : '<p style="color:var(--muted);font-size:0.85rem">No matches (schools without a reported acceptance rate can\'t be rated).</p>';
  });
  $("forced-results").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON" || e.target.disabled) return;
    forced.set(Number(e.target.dataset.id), { legacy: "none", round: "rd" });
    e.target.disabled = true; e.target.textContent = "Added";
    renderChips();
  });
  function renderChips() {
    $("forced-chips").innerHTML = [...forced.entries()].map(([id, adj]) => {
      const s = schools.find((x) => x.id === id);
      return `<div class="forced-chip" data-id="${id}"><strong>${escapeHtml(s.name)}</strong>
        <select class="chip-legacy">${optHtml(LEGACY_OPTS, adj.legacy)}</select>
        <select class="chip-round">${optHtml(ROUND_OPTS, adj.round)}</select>
        <button type="button" class="chip-remove" title="Remove">&times;</button></div>`;
    }).join("");
  }
  $("forced-chips").addEventListener("change", (e) => {
    const chip = e.target.closest(".forced-chip");
    if (!chip) return;
    const id = Number(chip.dataset.id);
    const adj = forced.get(id);
    if (e.target.classList.contains("chip-legacy")) adj.legacy = e.target.value;
    if (e.target.classList.contains("chip-round")) adj.round = e.target.value;
    const item = items.find((i) => i.school.id === id);
    if (item) { item.adj = { ...adj }; recompute(); renderAll(false); }
  });
  $("forced-chips").addEventListener("click", (e) => {
    if (!e.target.classList.contains("chip-remove")) return;
    forced.delete(Number(e.target.closest(".forced-chip").dataset.id));
    renderChips();
    $("forced-search").dispatchEvent(new Event("input"));
  });

  /* ---- build + render ---- */
  let items = [];     // { school, adj, est, cat }
  let inputs = null;  // { sat, gpa, sortMode }
  let requestedCounts = { reach: 0, high: 0, target: 0, safety: 0 };
  let candidates = { reach: [], high: [], target: [], safety: [] }; // every eligible school, ranked
  let removedItems = [];
  const OTHERS_SHOWN = 6;
  const onList = (id) => items.some((i) => i.school.id === id);
  const isRemoved = (id) => removedItems.some((i) => i.school.id === id);

  const fmtPctChance = (p) => (p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : Math.round(p * 100) + "%");
  const sorters = {
    chance: (a, b) => b.est.p - a.est.p || (b.school.grad_rate ?? -1) - (a.school.grad_rate ?? -1),
    selective: (a, b) => (a.school.admit_rate ?? 101) - (b.school.admit_rate ?? 101) || b.est.p - a.est.p,
    grad: (a, b) => (b.school.grad_rate ?? -1) - (a.school.grad_rate ?? -1) || b.est.p - a.est.p,
    price: (a, b) => (a.school.net_price ?? 1e9) - (b.school.net_price ?? 1e9) || b.est.p - a.est.p,
  };

  function recompute() {
    for (const it of items) {
      it.est = estimate(it.school, inputs.sat, inputs.gpa, it.adj);
      it.cat = categorize(it.school, it.est);
    }
  }

  function cardHtml(item) {
    const s = item.school, est = item.est;
    const added = isInTracker(s.id);
    const rng = est.rng;
    let fit;
    if (est.hasTest) fit = `Your score vs. this school's middle 50%: ${rng.lo}–${rng.hi} (${rng.src})`;
    else if (rng) fit = `Middle 50% of admitted students: ${rng.lo}–${rng.hi} (${rng.src})`;
    else fit = "No test scores reported; rated on acceptance rate only";
    const note = est.boosted ? ' <span class="badge gold">boosted</span>' : "";
    return `
      <div class="chance-card" data-id="${s.id}">
        <button type="button" class="remove-mini" data-id="${s.id}" title="Remove from my list (the next best school takes its place)" aria-label="Remove ${escapeHtml(s.name)}">&times;</button>
        <div class="name"><a href="school.html?id=${s.id}">${escapeHtml(s.name)}</a>
          <span class="index-pill">Est. ${fmtPctChance(est.p)}</span>${note}${s._status ? ' <span class="badge">' + s._status + "</span>" : ""}</div>
        <div class="loc">${escapeHtml(s.city)}, ${escapeHtml(s.state)} · ${escapeHtml(s.control || "")} · ${s.size !== null ? Number(s.size).toLocaleString() + " undergrads" : "size N/R"}</div>
        <div class="reason">${s.admit_rate}% admit rate${s._admitNote ? " (" + s._admitNote + ")" : ""} · ${s.grad_rate !== null ? s.grad_rate + "% graduate in 6 yrs" : "grad rate N/R"}${s.net_price !== null ? " · " + (s._priceNote ? "est. net price for you $" : "avg net price $") + Number(s.net_price).toLocaleString() : ""}</div>
        <div class="reason muted-line">${escapeHtml(fit)}</div>${s._resNote ? '<div class="reason muted-line">' + escapeHtml(s._resNote) + "</div>" : ""}
        <div class="adj-row">
          <label>Round <select class="adj-round" data-id="${s.id}">${optHtml(ROUND_OPTS, item.adj.round)}</select></label>
          <label>Legacy <select class="adj-legacy" data-id="${s.id}">${optHtml(LEGACY_OPTS, item.adj.legacy)}</select></label>
        </div>
        <div class="row-actions">
          <button class="add-mini ${added ? "added" : ""}" data-id="${s.id}">${added ? "✓ In Tracker" : "+ Tracker"}</button>
        </div>
      </div>`;
  }

  function otherCardHtml(c, catKey) {
    const s = c.school;
    return `<div class="chance-card other-card" data-id="${s.id}">
        <div class="name"><a href="school.html?id=${s.id}">${escapeHtml(s.name)}</a> <span class="index-pill">Est. ${fmtPctChance(c.est.p)}</span></div>
        <div class="loc">${escapeHtml(s.city)}, ${escapeHtml(s.state)} · ${s.admit_rate}% admit rate${s._admitNote ? " (" + s._admitNote + ")" : ""}${s.grad_rate !== null ? " · " + s.grad_rate + "% grad rate" : ""}</div>
        <div class="row-actions"><button type="button" class="add-other" data-id="${s.id}" data-cat="${catKey}">+ Add to my list</button></div>
      </div>`;
  }

  function renderAll(scroll) {
    const byCat = {};
    for (const c of CATS) byCat[c.key] = items.filter((i) => i.cat === c.key).sort(sorters[inputs.sortMode]);
    const all = items.map((i) => i.est.p);
    const realistic = !$("m-independent").checked;
    const alAll = atLeast(all, realistic ? SIGMA : 0);
    $("results-summary").textContent = items.length
      ? `${items.length} school${items.length === 1 ? "" : "s"} on your list. Expected acceptances: ${all.reduce((a, b) => a + b, 0).toFixed(1)}. Chance of at least one: ${fmtPctChance(alAll[1] ?? 0)}.`
      : "No schools match your preferences. Try loosening them.";

    const g = $("guidance");
    if (listMode === "check" && items.length) {
      const n = (k) => byCat[k].length;
      const tips = [];
      if (n("safety") < 2) tips.push(n("safety") ? "only 1 safety school" : "no safety school");
      if (n("reach") > 4) tips.push(n("reach") + " reach schools is a lot");
      if (n("target") + n("high") < 3) tips.push("few target or high target schools");
      g.hidden = false;
      g.innerHTML = `<strong>Your list:</strong> ${n("reach")} reach, ${n("high")} high target, ${n("target")} target, ${n("safety")} safety. A balanced list usually has 2-3 reach, 3-5 target (including high target), and 2-3 safety schools.` +
        (tips.length ? ` <strong>Worth a look:</strong> ${tips.join("; ")}. Switch to <em>Build a list for me</em> to fill the gaps; the schools you added here carry over.` : " That looks balanced.");
    } else if (listMode === "check") {
      g.hidden = false; g.textContent = "Add at least one school to your list.";
    } else {
      g.hidden = true;
    }

    const edCount = items.filter((i) => i.adj.round === "ed").length;
    const w = $("adj-warning");
    w.hidden = edCount < 2;
    w.innerHTML = edCount >= 2 ? "<strong>Early decision is binding</strong> and schools normally allow it at only one school. You've chosen it for " + edCount + "; switch the extras to early action or regular decision." : "";

    let html = "";
    for (const c of CATS) {
      const list = byCat[c.key];
      if (!list.length && !requestedCounts[c.key]) continue;
      const others = candidates[c.key].filter((x) => !onList(x.school.id) && !isRemoved(x.school.id)).slice(0, OTHERS_SHOWN);
      html += `<div class="builder-section">
        <div class="chance-header ${c.cls}"><span class="count">${list.length}</span><span>${c.label}</span><span class="desc">${c.desc}</span></div>
        <div class="card-grid">${list.length ? list.map(cardHtml).join("") : '<div class="chance-column-empty">No matching schools.</div>'}</div>
        ${others.length ? `<div class="others-label">Next best ${c.label} options. Remove a school above and the first one below takes its place, or add one yourself.</div>
        <div class="card-grid">${others.map((o) => otherCardHtml(o, c.key)).join("")}</div>` : ""}
      </div>`;
    }
    $("list-area").innerHTML = html;
    $("removed-area").innerHTML = removedItems.length
      ? "<strong>Removed:</strong> " + removedItems.map((i) => `${escapeHtml(i.school.name)} <button type="button" class="restore-btn" data-id="${i.school.id}">Restore</button>`).join(" · ")
      : "";
    renderMatrix(byCat, realistic);
    $("results").hidden = false;
    if (scroll) $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderMatrix(byCat, realistic) {
    const sigma = realistic ? SIGMA : 0;
    const cols = [{ label: "All schools", ps: items.map((i) => i.est.p) }];
    for (const c of CATS) if (byCat[c.key].length) cols.push({ label: c.label, ps: byCat[c.key].map((i) => i.est.p) });
    for (const col of cols) col.al = atLeast(col.ps, sigma);
    const maxN = cols[0].ps.length;
    const cell = (col, k) => (k > col.ps.length ? '<td class="dim">—</td>' : `<td>${fmtPctChance(col.al[k])}</td>`);
    let h = "<thead><tr><th>At least…</th>" + cols.map((c) => `<th>${escapeHtml(c.label)} (${c.ps.length})</th>`).join("") + "</tr></thead><tbody>";
    for (let k = 1; k <= maxN; k++) {
      h += `<tr><td><strong>${k} acceptance${k > 1 ? "s" : ""}</strong></td>` + cols.map((c) => cell(c, k)).join("") + "</tr>";
    }
    $("matrix").innerHTML = h + "</tbody>";
    $("matrix-note").textContent = realistic
      ? "Schools judge the same application, so results tend to move together; these figures allow for that. The estimates behind them are rough, so treat the matrix as a guide, not a forecast."
      : "This treats each school as an independent coin flip, which is a little optimistic about getting at least one acceptance.";
  }

  function build() {
    if (!schools.length) return;
    if (listMode === "build" && !updateSum()) { $("sum-line").scrollIntoView({ block: "center" }); return; }
    if (listMode === "check" && !forced.size) {
      $("special-panel").open = true;
      $("forced-search").focus();
      $("guidance").hidden = false;
      $("guidance").textContent = "Add at least one school to your list first.";
      $("results").hidden = false;
      return;
    }
    const gpa = Number($("gpa-input").value);
    let sat = null;
    if (mode !== "none") {
      const raw = Number(scoreInput.value);
      if (!raw) { scoreInput.focus(); return; }
      sat = mode === "act" ? actToSat(raw) : raw;
    }
    const counts = listMode === "check" ? { reach: 0, high: 0, target: 0, safety: 0 } : readCounts();
    requestedCounts = { ...counts };
    inputs = { sat, gpa, sortMode: listMode === "check" ? "chance" : $("p-sort").value };

    const state = $("p-state").value, locale = $("p-locale").value, size = $("p-size").value, control = $("p-control").value;
    const maxPrice = $("p-price").value ? Number($("p-price").value) : null;
    const minGrad = Number($("p-grad").value) || 0;
    const minSize = Number($("p-minsize").value) || 0;
    const allowNoTest = $("p-notest").checked;

    const home = $("home-state").value;
    const pool = schools.map((s) => personalize(s, home));

    // Must-have schools go in first, in whatever category their adjusted chance lands them.
    items = [];
    const forcedCat = { reach: 0, high: 0, target: 0, safety: 0 };
    for (const [id, adj] of forced) {
      const s = pool.find((x) => x.id === id);
      const est = estimate(s, sat, gpa, adj);
      if (!est) continue;
      const cat = categorize(s, est);
      forcedCat[cat]++;
      items.push({ school: s, adj: { ...adj }, est, cat });
    }

    const buckets = { reach: [], high: [], target: [], safety: [] };
    for (const s of pool) {
      if (listMode === "check") break;
      if (forced.has(s.id)) continue;
      if (s.control === "Private for-profit") continue;
      if (SERVICE_ACADEMY.test(s.name)) continue;
      if ((s.designations || []).includes("Online-only")) continue;
      if (state && s.state !== state) continue;
      if (locale && s.locale_bucket !== locale) continue;
      if (size && s.size_bucket !== size) continue;
      if (control && s.control !== control) continue;
      if (maxPrice !== null && (s.net_price === null || s.net_price > maxPrice)) continue;
      if (minGrad > 0 && (s.grad_rate === null || s.grad_rate < minGrad)) continue;
      if (minSize > 0 && (s.size === null || s.size < minSize)) continue;
      const adj = { legacy: "none", round: "rd" };
      const est = estimate(s, sat, gpa, adj);
      if (!est) continue;
      if (!allowNoTest && sat !== null && !est.rng) continue;
      buckets[categorize(s, est)].push({ school: s, adj, est });
    }

    const short = [];
    removedItems = [];
    candidates = { reach: [], high: [], target: [], safety: [] };
    for (const c of CATS) {
      buckets[c.key].sort(sorters[inputs.sortMode]);
      candidates[c.key] = buckets[c.key];
      const need = Math.max(0, counts[c.key] - forcedCat[c.key]);
      const got = buckets[c.key].slice(0, need);
      for (const g of got) items.push({ ...g, cat: c.key });
      if (got.length < need) short.push(`${c.label}: only ${got.length + forcedCat[c.key]} of the ${counts[c.key]} you asked for match your preferences`);
    }
    const sf = $("shortfall");
    sf.hidden = !short.length;
    sf.innerHTML = short.length
      ? "<strong>Not enough schools:</strong> " + short.map(escapeHtml).join("; ") + ". Try relaxing your preferences (state, size, price, graduation rate) or lowering that category's count."
      : "";
    renderAll(true);
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); build(); });
  $("m-independent").addEventListener("change", () => { if (items.length) renderAll(false); });

  $("list-area").addEventListener("change", (e) => {
    const id = Number(e.target.dataset.id);
    const it = items.find((i) => i.school.id === id);
    if (!it) return;
    if (e.target.classList.contains("adj-round")) it.adj.round = e.target.value;
    else if (e.target.classList.contains("adj-legacy")) it.adj.legacy = e.target.value;
    else return;
    if (forced.has(id)) { forced.set(id, { ...it.adj }); renderChips(); }
    recompute();
    renderAll(false);
  });
  function removeSchool(id) {
    const idx = items.findIndex((i) => i.school.id === id);
    if (idx < 0) return;
    const [it] = items.splice(idx, 1);
    removedItems.push(it);
    if (forced.has(id)) { forced.delete(id); renderChips(); }
    const next = candidates[it.cat].find((c) => !onList(c.school.id) && !isRemoved(c.school.id));
    if (next) items.push({ ...next, cat: it.cat });
    renderAll(false);
  }
  $("list-area").addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("remove-mini")) { removeSchool(Number(t.dataset.id)); return; }
    if (t.classList.contains("add-other")) {
      const id = Number(t.dataset.id);
      const c = candidates[t.dataset.cat].find((x) => x.school.id === id);
      if (c && !onList(id)) { items.push({ ...c, cat: t.dataset.cat }); renderAll(false); }
      return;
    }
    if (!e.target.classList.contains("add-mini")) return;
    const id = Number(e.target.dataset.id);
    const school = schools.find((s) => s.id === id);
    if (!school) return;
    if (isInTracker(id)) { removeFromTracker(id); e.target.classList.remove("added"); e.target.textContent = "+ Tracker"; }
    else { addToTracker(school); e.target.classList.add("added"); e.target.textContent = "✓ In Tracker"; }
  });
  $("removed-area").addEventListener("click", (e) => {
    if (!e.target.classList.contains("restore-btn")) return;
    const id = Number(e.target.dataset.id);
    const idx = removedItems.findIndex((i) => i.school.id === id);
    if (idx < 0) return;
    const [it] = removedItems.splice(idx, 1);
    items.push(it);
    renderAll(false);
  });
  $("add-all-btn").addEventListener("click", () => {
    for (const i of items) addToTracker(i.school);
    document.querySelectorAll("#list-area .add-mini").forEach((b) => { b.classList.add("added"); b.textContent = "✓ In Tracker"; });
    $("add-all-btn").textContent = "Added to My Tracker";
  });
  $("print-btn").addEventListener("click", () => window.print());
})();
