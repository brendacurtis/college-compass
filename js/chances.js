(function () {
  const { actToSat, CATS, SERVICE_ACADEMY, estimate, categorize, personalize, loadResidency, fmtPctChance } = window.CC;
  const $ = (id) => document.getElementById(id);
  const PAGE_SIZE = 24;

  let testType = "sat";
  function setTestType(t) {
    testType = t;
    $("toggle-sat").classList.toggle("active", t === "sat");
    $("toggle-act").classList.toggle("active", t === "act");
    const input = $("score-input");
    if (t === "sat") {
      $("score-label").textContent = "SAT Score (400–1600)";
      input.min = 400; input.max = 1600; input.step = 10; input.placeholder = "e.g. 1350";
    } else {
      $("score-label").textContent = "ACT Score (1–36)";
      input.min = 1; input.max = 36; input.step = 1; input.placeholder = "e.g. 28";
    }
    input.value = "";
  }
  $("toggle-sat").addEventListener("click", () => setTestType("sat"));
  $("toggle-act").addEventListener("click", () => setTestType("act"));

  let schools = [];
  let residency = {};
  (async () => {
    schools = await fetchSchools();
    for (const st of [...new Set(schools.map((s) => s.state).filter(Boolean))].sort()) {
      for (const id of ["state-input", "home-input"]) {
        const o = document.createElement("option");
        o.value = st; o.textContent = st;
        $(id).appendChild(o);
      }
    }
    residency = await loadResidency();
  })();

  function cardHtml(item) {
    const s = item.school, est = item.est, rng = est.rng;
    const added = isInTracker(s.id);
    let fit;
    if (est.hasTest) fit = `Your score vs. this school's middle 50%: ${rng.lo}–${rng.hi} (${rng.src})`;
    else if (rng) fit = `Middle 50% of admitted students: ${rng.lo}–${rng.hi} (${rng.src})`;
    else fit = "No test scores reported; rated on acceptance rate only";
    return `
      <div class="chance-card" data-id="${s.id}">
        <div class="name"><a href="school.html?id=${s.id}">${escapeHtml(s.name)}</a>
          <span class="index-pill">Est. ${fmtPctChance(est.p)}</span>${s._status ? ' <span class="badge">' + s._status + "</span>" : ""}</div>
        <div class="loc">${escapeHtml(s.city)}, ${escapeHtml(s.state)} · ${s.admit_rate}% admit rate${s._admitNote ? " (" + s._admitNote + ")" : ""}</div>
        <div class="reason">${escapeHtml(fit)}</div>
        ${s._resNote ? '<div class="reason muted-line">' + escapeHtml(s._resNote) + "</div>" : ""}
        <div class="row-actions">
          <button class="add-mini ${added ? "added" : ""}" data-id="${s.id}">${added ? "✓ In Tracker" : "+ Tracker"}</button>
        </div>
      </div>`;
  }

  function renderPaged(container) {
    const { _items: items, _visible: visible } = container;
    if (!items.length) {
      container.innerHTML = '<div class="chance-column-empty">No schools in this category with the current filters.</div>';
      return;
    }
    let html = items.slice(0, visible).map(cardHtml).join("");
    if (visible < items.length) {
      html += `<button type="button" class="chance-show-more">Show ${Math.min(PAGE_SIZE, items.length - visible)} more (${items.length - visible} left)</button>`;
    }
    container.innerHTML = html;
  }

  $("chances-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = Number($("score-input").value);
    if (!raw) return;
    const sat = testType === "act" ? actToSat(raw) : raw;
    const gpa = $("gpa-input").value === "" ? null : Number($("gpa-input").value);
    const home = $("home-input").value;

    let pool = schools.filter((s) => s.control !== "Private for-profit" && !SERVICE_ACADEMY.test(s.name));
    if ($("state-input").value) pool = pool.filter((s) => s.state === $("state-input").value);
    pool = pool.map((s) => personalize(s, home, residency));
    if ($("price-input").value) {
      const max = Number($("price-input").value);
      pool = pool.filter((s) => s.net_price !== null && s.net_price <= max);
    }

    const buckets = { reach: [], high: [], target: [], safety: [] };
    let unrated = 0;
    for (const s of pool) {
      const est = estimate(s, sat, gpa);
      if (!est) { unrated++; continue; }
      buckets[categorize(s, est)].push({ school: s, est });
    }

    $("board").innerHTML = CATS.map((c) => `
      <div class="chance-column ${c.key}-col">
        <div class="chance-header ${c.cls}"><span class="count">${buckets[c.key].length}</span><span>${c.label}</span><span class="desc">${c.desc}</span></div>
        <div id="list-${c.key}" class="chance-list"></div>
      </div>`).join("");
    for (const c of CATS) {
      const list = $("list-" + c.key);
      list._items = buckets[c.key].sort((a, b) => (b.est.rng ? 1 : 0) - (a.est.rng ? 1 : 0) || b.est.p - a.est.p || a.school.name.localeCompare(b.school.name));
      list._visible = PAGE_SIZE;
      renderPaged(list);
    }
    $("unclassified-note").textContent = unrated
      ? `${unrated.toLocaleString()} school${unrated === 1 ? "" : "s"} matching your filters report no acceptance rate and couldn't be rated.`
      : "";
    $("results-area").hidden = false;
    $("no-results").hidden = true;
  });

  $("results-area").addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("chance-show-more")) {
      const list = t.closest(".chance-list");
      list._visible += PAGE_SIZE;
      renderPaged(list);
      return;
    }
    if (t.classList.contains("add-mini")) {
      const id = Number(t.dataset.id);
      const school = schools.find((s) => s.id === id);
      if (!school) return;
      if (isInTracker(id)) { removeFromTracker(id); t.classList.remove("added"); t.textContent = "+ Tracker"; }
      else { addToTracker(school); t.classList.add("added"); t.textContent = "✓ In Tracker"; }
    }
  });
})();
