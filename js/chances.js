(function () {
  // Official 2018 ACT/SAT Concordance (Table A2: ACT Composite -> SAT Total, single-point values).
  // Source: ACT & College Board joint concordance tables.
  const ACT_TO_SAT = {
    36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370,
    29: 1340, 28: 1310, 27: 1280, 26: 1240, 25: 1210, 24: 1180, 23: 1140,
    22: 1110, 21: 1080, 20: 1040, 19: 1010, 18: 970, 17: 930, 16: 890,
    15: 850, 14: 800, 13: 760, 12: 710, 11: 670, 10: 630, 9: 590,
  };

  function actToSat(act) {
    if (act == null) return null;
    const a = Math.round(Math.min(36, Math.max(9, act)));
    return ACT_TO_SAT[a];
  }

  function satToAct(sat) {
    if (sat == null) return null;
    let best = 9, bestDiff = Infinity;
    for (const [act, satVal] of Object.entries(ACT_TO_SAT)) {
      const diff = Math.abs(satVal - sat);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = Number(act);
      }
    }
    return best;
  }

  const form = document.getElementById("chances-form");
  const toggleSat = document.getElementById("toggle-sat");
  const toggleAct = document.getElementById("toggle-act");
  const scoreLabel = document.getElementById("score-label");
  const scoreInput = document.getElementById("score-input");
  const gpaInput = document.getElementById("gpa-input");
  const stateInput = document.getElementById("state-input");
  const priceInput = document.getElementById("price-input");
  const resultsArea = document.getElementById("results-area");
  const noResults = document.getElementById("no-results");

  let testType = "sat";
  toggleSat.addEventListener("click", () => setTestType("sat"));
  toggleAct.addEventListener("click", () => setTestType("act"));
  function setTestType(t) {
    testType = t;
    toggleSat.classList.toggle("active", t === "sat");
    toggleAct.classList.toggle("active", t === "act");
    if (t === "sat") {
      scoreLabel.textContent = "SAT Score (400–1600)";
      scoreInput.min = 400; scoreInput.max = 1600; scoreInput.step = 10;
      scoreInput.placeholder = "e.g. 1350";
    } else {
      scoreLabel.textContent = "ACT Score (1–36)";
      scoreInput.min = 1; scoreInput.max = 36; scoreInput.step = 1;
      scoreInput.placeholder = "e.g. 28";
    }
    scoreInput.value = "";
  }

  let schools = [];
  (async () => {
    schools = await fetchSchools();
    const states = [...new Set(schools.map((s) => s.state).filter(Boolean))].sort();
    for (const st of states) {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      stateInput.appendChild(opt);
    }
  })();

  function classify(school, score) {
    let lo = null, hi = null, metricLabel = "";
    if (testType === "sat") {
      if (school.sat25 != null && school.sat75 != null) {
        lo = school.sat25; hi = school.sat75; metricLabel = "SAT";
      } else if (school.act25 != null && school.act75 != null) {
        lo = actToSat(school.act25); hi = actToSat(school.act75); metricLabel = "SAT, estimated from this school's ACT range";
      }
    } else {
      if (school.act25 != null && school.act75 != null) {
        lo = school.act25; hi = school.act75; metricLabel = "ACT";
      } else if (school.sat25 != null && school.sat75 != null) {
        lo = satToAct(school.sat25); hi = satToAct(school.sat75); metricLabel = "ACT, estimated from this school's SAT range";
      }
    }

    if (lo === null || hi === null) {
      return { bucket: "unknown", reason: "No test score range reported for this school." };
    }

    if (score >= hi) {
      return { bucket: "safety", reason: `Your ${metricLabel} score (${score}) is at or above this school's 75th percentile (${hi}).` };
    }
    if (score >= lo) {
      return { bucket: "match", reason: `Your ${metricLabel} score (${score}) falls within this school's middle 50% range (${lo}–${hi}).` };
    }
    return { bucket: "reach", reason: `Your ${metricLabel} score (${score}) is below this school's 25th percentile (${lo}).` };
  }

  const BUCKET_LABELS = { reach: "Reach", match: "Match", safety: "Safety" };

  function cardHtml(school, reason) {
    const added = isInTracker(school.id);
    return `
      <div class="chance-card" data-id="${school.id}">
        <div class="name"><a href="school.html?id=${school.id}">${escapeHtml(school.name)}</a></div>
        <div class="loc">${escapeHtml(school.city)}, ${escapeHtml(school.state)} · ${school.admit_rate !== null ? school.admit_rate + "% admit rate" : "Admit rate N/R"}</div>
        <div class="reason">${escapeHtml(reason)}</div>
        <div class="row-actions">
          <button class="add-mini ${added ? "added" : ""}" data-id="${school.id}">${added ? "✓ In Tracker" : "+ Tracker"}</button>
        </div>
      </div>`;
  }

  function lowAcceptCardHtml(school, bucket, reason) {
    const added = isInTracker(school.id);
    const bucketNote = bucket && bucket !== "unknown"
      ? `Academically for your score: <strong>${BUCKET_LABELS[bucket]}</strong> — ${reason}`
      : "No test score range reported for this school.";
    return `
      <div class="chance-card" data-id="${school.id}">
        <div class="name"><a href="school.html?id=${school.id}">${escapeHtml(school.name)}</a></div>
        <div class="loc">${escapeHtml(school.city)}, ${escapeHtml(school.state)} · ${school.admit_rate}% admit rate</div>
        <div class="reason">${bucketNote}</div>
        <div class="row-actions">
          <button class="add-mini ${added ? "added" : ""}" data-id="${school.id}">${added ? "✓ In Tracker" : "+ Tracker"}</button>
        </div>
      </div>`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const score = Number(scoreInput.value);
    if (!score) return;

    let pool = schools;
    if (stateInput.value) pool = pool.filter((s) => s.state === stateInput.value);
    if (priceInput.value) {
      const max = Number(priceInput.value);
      pool = pool.filter((s) => s.net_price !== null && s.net_price <= max);
    }

    const buckets = { reach: [], match: [], safety: [], unknown: [] };
    for (const school of pool) {
      const result = classify(school, score);
      buckets[result.bucket].push({ school, reason: result.reason });
    }

    for (const key of ["reach", "match", "safety"]) {
      buckets[key].sort((a, b) => a.school.name.localeCompare(b.school.name));
      document.getElementById(`${key}-count`).textContent = buckets[key].length;
      const listEl = document.getElementById(`${key}-list`);
      renderPaged(listEl, buckets[key], (r) => cardHtml(r.school, r.reason), "No schools in this category with the current filters.");
    }

    const note = document.getElementById("unclassified-note");
    note.textContent = buckets.unknown.length
      ? `${buckets.unknown.length} school${buckets.unknown.length === 1 ? "" : "s"} matching your filters had no test score data and couldn't be placed in Reach, Match, or Safety.`
      : "";

    const lowAccept = pool
      .filter((s) => s.admit_rate !== null && s.admit_rate < 15)
      .map((s) => ({ school: s, ...classify(s, score) }))
      .sort((a, b) => a.school.admit_rate - b.school.admit_rate);
    document.getElementById("lowaccept-count").textContent = lowAccept.length;
    const lowAcceptList = document.getElementById("lowaccept-list");
    renderPaged(lowAcceptList, lowAccept, (r) => lowAcceptCardHtml(r.school, r.bucket, r.reason), "No schools under 15% acceptance with the current filters.");

    resultsArea.hidden = false;
    noResults.hidden = true;
  });

  const PAGE_SIZE = 24;
  function renderPaged(container, items, cardFn, emptyMsg) {
    container._items = items;
    container._cardFn = cardFn;
    container._emptyMsg = emptyMsg;
    container._visible = PAGE_SIZE;
    drawPaged(container);
  }
  function drawPaged(container) {
    const { _items: items, _cardFn: cardFn, _emptyMsg: emptyMsg, _visible: visible } = container;
    if (!items.length) {
      container.innerHTML = `<div class="chance-column-empty">${emptyMsg}</div>`;
      return;
    }
    let html = items.slice(0, visible).map(cardFn).join("");
    if (visible < items.length) {
      html += `<button type="button" class="chance-show-more">Show ${Math.min(PAGE_SIZE, items.length - visible)} more (${items.length - visible} left)</button>`;
    }
    container.innerHTML = html;
  }

  resultsArea.addEventListener("click", (e) => {
    if (e.target.classList.contains("chance-show-more")) {
      const container = e.target.closest(".chance-list");
      if (container) {
        container._visible += PAGE_SIZE;
        drawPaged(container);
      }
      return;
    }
    if (e.target.classList.contains("add-mini")) {
      const id = Number(e.target.dataset.id);
      const school = schools.find((s) => s.id === id);
      if (!school) return;
      if (isInTracker(id)) {
        removeFromTracker(id);
        e.target.classList.remove("added");
        e.target.textContent = "+ Tracker";
      } else {
        addToTracker(school);
        e.target.classList.add("added");
        e.target.textContent = "✓ In Tracker";
      }
    }
  });
})();
