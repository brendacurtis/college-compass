(function () {
  // Official 2018 ACT/College Board concordance (ACT composite -> SAT total).
  const ACT_TO_SAT = {
    36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370, 29: 1340, 28: 1310, 27: 1280,
    26: 1240, 25: 1210, 24: 1180, 23: 1140, 22: 1110, 21: 1080, 20: 1040, 19: 1010, 18: 970, 17: 930,
    16: 890, 15: 850, 14: 800, 13: 760, 12: 710, 11: 670, 10: 630, 9: 590,
  };
  const actToSat = (a) => ACT_TO_SAT[Math.round(Math.min(36, Math.max(9, a)))];

  // Model constants (documented on the About page).
  const COEF = 0.6;          // log-odds change per standard deviation above/below the school's admitted midpoint
  const CAP_BELOW = 25;      // schools under this admit rate (%) ...
  const CAP_MULT = 2;        // ... can't exceed this multiple of their admit rate
  const SIGMA = 0.7;         // shared "applicant quality" strength for the realistic odds matrix

  // Category cutoffs on estimated chance.
  const REACH_BELOW = 0.15, HIGH_BELOW = 0.40, TARGET_BELOW = 0.75, SAFETY_MIN_ADMIT = 50;

  // Service academies need a nomination and a service commitment, so they aren't suggested as ordinary schools.
  const SERVICE_ACADEMY = /^United States (Military|Naval|Air Force|Coast Guard|Merchant Marine) /;

  const CATS = [
    { key: "reach", label: "Reach", cls: "reach", desc: "Estimated chance under 15%, or a school that admits under 15% of applicants" },
    { key: "high", label: "High Target", cls: "high", desc: "Estimated chance 15% to 39%: a realistic stretch" },
    { key: "target", label: "Target (Match)", cls: "match", desc: "Estimated chance 40% to 74%, or higher at a school that admits under half of applicants" },
    { key: "safety", label: "Safety", cls: "safety", desc: "Estimated chance 75% or more at a school admitting at least half of applicants" },
  ];

  function gpaMultiplier(g) {
    if (g >= 3.9) return 1.25;
    if (g >= 3.7) return 1.1;
    if (g >= 3.5) return 1.0;
    if (g >= 3.3) return 0.85;
    if (g >= 3.0) return 0.7;
    if (g >= 2.5) return 0.5;
    return 0.3;
  }

  function satRange(s) {
    if (s.sat25 != null && s.sat75 != null) return { lo: s.sat25, hi: s.sat75, src: "SAT" };
    if (s.act25 != null && s.act75 != null) return { lo: actToSat(s.act25), hi: actToSat(s.act75), src: "ACT, converted to SAT" };
    return null;
  }

  function estimate(s, sat, gpa) {
    if (s.admit_rate === null || s.admit_rate === undefined) return null;
    const rng = satRange(s);
    let z = 0;
    if (sat !== null && rng) {
      const sd = Math.max(40, (rng.hi - rng.lo) / 1.349);
      z = Math.max(-3, Math.min(3, (sat - (rng.lo + rng.hi) / 2) / sd));
    }
    const r = Math.max(0.005, Math.min(0.995, s.admit_rate / 100));
    const odds = (r / (1 - r)) * Math.exp(COEF * z) * gpaMultiplier(gpa);
    let p = odds / (1 + odds);
    if (s.admit_rate < CAP_BELOW) p = Math.min(p, (CAP_MULT * s.admit_rate) / 100);
    return { p, z, rng, hasTest: sat !== null && !!rng };
  }

  function categorize(s, p) {
    if (s.admit_rate < 15 || p < REACH_BELOW) return "reach";
    if (p < HIGH_BELOW) return "high";
    if (p < TARGET_BELOW || s.admit_rate < SAFETY_MIN_ADMIT) return "target";
    return "safety";
  }

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
  (async () => {
    schools = await fetchSchools();
    for (const st of [...new Set(schools.map((s) => s.state).filter(Boolean))].sort()) {
      const o = document.createElement("option");
      o.value = st; o.textContent = st;
      $("p-state").appendChild(o);
    }
  })();

  let currentPicks = [];

  function fmtPctChance(p) {
    if (p < 0.005) return "<1%";
    if (p > 0.995) return ">99%";
    return Math.round(p * 100) + "%";
  }

  function cardHtml(item) {
    const s = item.school;
    const added = isInTracker(s.id);
    const rng = item.est.rng;
    let fit;
    if (item.est.hasTest) fit = `Your score vs. this school's middle 50%: ${rng.lo}–${rng.hi} (${rng.src})`;
    else if (rng) fit = `Middle 50% of admitted students: ${rng.lo}–${rng.hi} (${rng.src})`;
    else fit = "No test scores reported; rated on acceptance rate only";
    return `
      <div class="chance-card" data-id="${s.id}">
        <div class="name"><a href="school.html?id=${s.id}">${escapeHtml(s.name)}</a>
          <span class="index-pill">Est. ${fmtPctChance(item.est.p)}</span></div>
        <div class="loc">${escapeHtml(s.city)}, ${escapeHtml(s.state)} · ${escapeHtml(s.control || "")} · ${s.size !== null ? Number(s.size).toLocaleString() + " undergrads" : "size N/R"}</div>
        <div class="reason">${s.admit_rate}% admit rate · ${s.grad_rate !== null ? s.grad_rate + "% graduate in 6 yrs" : "grad rate N/R"}${s.net_price !== null ? " · avg net price $" + Number(s.net_price).toLocaleString() : ""}</div>
        <div class="reason muted-line">${escapeHtml(fit)}</div>
        <div class="row-actions">
          <button class="add-mini ${added ? "added" : ""}" data-id="${s.id}">${added ? "✓ In Tracker" : "+ Tracker"}</button>
        </div>
      </div>`;
  }

  function build() {
    if (!schools.length) return;
    if (!updateSum()) { $("sum-line").scrollIntoView({ block: "center" }); return; }
    const gpa = Number($("gpa-input").value);
    let sat = null;
    if (mode !== "none") {
      const raw = Number(scoreInput.value);
      if (!raw) { scoreInput.focus(); return; }
      sat = mode === "act" ? actToSat(raw) : raw;
    }
    const counts = readCounts();
    const N = counts.reach + counts.high + counts.target + counts.safety;

    const state = $("p-state").value, locale = $("p-locale").value, size = $("p-size").value, control = $("p-control").value;
    const maxPrice = $("p-price").value ? Number($("p-price").value) : null;
    const minGrad = Number($("p-grad").value) || 0;
    const minSize = Number($("p-minsize").value) || 0;
    const allowNoTest = $("p-notest").checked;
    const sortMode = $("p-sort").value;

    const buckets = { reach: [], high: [], target: [], safety: [] };
    for (const s of schools) {
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
      const est = estimate(s, sat, gpa);
      if (!est) continue;
      if (!allowNoTest && sat !== null && !est.rng) continue;
      buckets[categorize(s, est.p)].push({ school: s, est });
    }

    const cmp = {
      chance: (a, b) => b.est.p - a.est.p || (b.school.grad_rate ?? -1) - (a.school.grad_rate ?? -1),
      grad: (a, b) => (b.school.grad_rate ?? -1) - (a.school.grad_rate ?? -1) || b.est.p - a.est.p,
      price: (a, b) => (a.school.net_price ?? 1e9) - (b.school.net_price ?? 1e9) || b.est.p - a.est.p,
    }[sortMode];

    const picks = {};
    const short = [];
    for (const c of CATS) {
      buckets[c.key].sort(cmp);
      picks[c.key] = buckets[c.key].slice(0, counts[c.key]);
      if (picks[c.key].length < counts[c.key]) {
        short.push(`${c.label}: only ${picks[c.key].length} of the ${counts[c.key]} you asked for match your preferences`);
      }
    }
    currentPicks = CATS.flatMap((c) => picks[c.key]);
    render(picks, counts, short, N);
  }

  function render(picks, counts, short, N) {
    const all = currentPicks.map((i) => i.est.p);
    const total = all.length;
    const realistic = !$("m-independent").checked;
    const alAll = atLeast(all, realistic ? SIGMA : 0);
    $("results-summary").textContent = total
      ? `${total} school${total === 1 ? "" : "s"} on your list. Expected acceptances: ${all.reduce((a, b) => a + b, 0).toFixed(1)}. Chance of at least one: ${fmtPctChance(alAll[1] ?? 0)}.`
      : "No schools match your preferences. Try loosening them.";
    const sf = $("shortfall");
    sf.hidden = !short.length;
    sf.innerHTML = short.length
      ? "<strong>Not enough schools:</strong> " + short.map(escapeHtml).join("; ") + ". Try relaxing your preferences (state, size, price, graduation rate) or lowering that category's count."
      : "";

    let html = "";
    for (const c of CATS) {
      const items = picks[c.key];
      if (!counts[c.key]) continue;
      html += `<div class="builder-section">
        <div class="chance-header ${c.cls}"><span class="count">${items.length}</span><span>${c.label}</span><span class="desc">${c.desc}</span></div>
        <div class="card-grid">${items.length ? items.map(cardHtml).join("") : '<div class="chance-column-empty">No matching schools.</div>'}</div>
      </div>`;
    }
    $("list-area").innerHTML = html;
    renderMatrix(picks, realistic);
    $("results").hidden = false;
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderMatrix(picks, realistic) {
    const sigma = realistic ? SIGMA : 0;
    const cols = [{ label: "All schools", ps: currentPicks.map((i) => i.est.p) }];
    for (const c of CATS) if (picks[c.key].length) cols.push({ label: c.label, ps: picks[c.key].map((i) => i.est.p) });
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

  form.addEventListener("submit", (e) => { e.preventDefault(); build(); });
  $("m-independent").addEventListener("change", () => {
    if (!currentPicks.length) return;
    const picks = {};
    for (const c of CATS) picks[c.key] = currentPicks.filter((i) => categorize(i.school, i.est.p) === c.key);
    renderMatrix(picks, !$("m-independent").checked);
  });

  $("list-area").addEventListener("click", (e) => {
    if (!e.target.classList.contains("add-mini")) return;
    const id = Number(e.target.dataset.id);
    const school = schools.find((s) => s.id === id);
    if (!school) return;
    if (isInTracker(id)) { removeFromTracker(id); e.target.classList.remove("added"); e.target.textContent = "+ Tracker"; }
    else { addToTracker(school); e.target.classList.add("added"); e.target.textContent = "✓ In Tracker"; }
  });
  $("add-all-btn").addEventListener("click", () => {
    for (const i of currentPicks) addToTracker(i.school);
    document.querySelectorAll("#list-area .add-mini").forEach((b) => { b.classList.add("added"); b.textContent = "✓ In Tracker"; });
    $("add-all-btn").textContent = "Added to My Tracker";
  });
  $("print-btn").addEventListener("click", () => window.print());
})();
