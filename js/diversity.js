(function () {
  const NATIONAL_AVG = { black: 11, hispanic: 19, asian: 6, two_or_more: 4 };

  const RACE_LABELS = {
    white: "White", black: "Black", hispanic: "Hispanic/Latino", asian: "Asian",
    aian: "AIAN", nhpi: "NHPI", two_or_more: "Two or More Races", nonresident_alien: "International",
  };

  const form = document.getElementById("diversity-form");
  const minInputs = [...document.querySelectorAll(".min-input")];
  const stateInput = document.getElementById("state-input");
  const localeInput = document.getElementById("locale-input");
  const sortInput = document.getElementById("sort-input");
  const fillNationalBtn = document.getElementById("fill-national");
  const clearBtn = document.getElementById("clear-fields");
  const resultsArea = document.getElementById("results-area");
  const resultsList = document.getElementById("results-list");
  const resultsCount = document.getElementById("results-count");
  const noResults = document.getElementById("no-results");

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

  fillNationalBtn.addEventListener("click", () => {
    for (const input of minInputs) {
      const key = input.dataset.key;
      input.value = NATIONAL_AVG[key] !== undefined ? NATIONAL_AVG[key] : "";
    }
  });
  clearBtn.addEventListener("click", () => {
    for (const input of minInputs) input.value = "";
    stateInput.value = "";
    localeInput.value = "";
  });

  function breakdownLine(school, activeMins) {
    const diversity = school.diversity || {};
    const entries = Object.entries(diversity)
      .filter(([k, v]) => k !== "unknown" && v !== null && v > 0)
      .sort((a, b) => b[1] - a[1]);
    return entries
      .map(([k, v]) => {
        const label = RACE_LABELS[k] || k;
        const met = activeMins[k] !== undefined && v >= activeMins[k];
        return met
          ? `<span class="met">${escapeHtml(label)} ${v}%</span>`
          : `<span class="grp">${escapeHtml(label)} ${v}%</span>`;
      })
      .join(" · ");
  }

  function cardHtml(school, activeMins) {
    const added = isInTracker(school.id);
    const badges = (school.designations || []).slice(0, 3)
      .map((t) => `<span class="badge gold">${escapeHtml(t)}</span>`).join("");
    return `
      <div class="chance-card diversity-card" data-id="${school.id}">
        <div class="name">
          <a href="school.html?id=${school.id}">${escapeHtml(school.name)}</a>
          ${school.diversity_index !== null ? `<span class="index-pill">Diversity Index ${school.diversity_index}</span>` : ""}
        </div>
        <div class="loc">${escapeHtml(school.city)}, ${escapeHtml(school.state)} · ${escapeHtml(school.control || "")}</div>
        ${badges ? `<div class="badges">${badges}</div>` : ""}
        <div class="breakdown-line">${breakdownLine(school, activeMins)}</div>
        <div class="row-actions">
          <button class="add-mini ${added ? "added" : ""}" data-id="${school.id}">${added ? "✓ In Tracker" : "+ Tracker"}</button>
        </div>
      </div>`;
  }

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

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const activeMins = {};
    for (const input of minInputs) {
      if (input.value !== "") activeMins[input.dataset.key] = Number(input.value);
    }

    let pool = schools;
    if (stateInput.value) pool = pool.filter((s) => s.state === stateInput.value);
    if (localeInput.value) pool = pool.filter((s) => s.locale_bucket === localeInput.value);
    pool = pool.filter((s) => {
      const diversity = s.diversity || {};
      return Object.entries(activeMins).every(([key, min]) => (diversity[key] || 0) >= min);
    });

    const sortKey = sortInput.value;
    const byNullLast = (a, b, key, dir) => {
      if (a[key] === null && b[key] === null) return 0;
      if (a[key] === null || a[key] === undefined) return 1;
      if (b[key] === null || b[key] === undefined) return -1;
      return (a[key] - b[key]) * dir;
    };
    const DIVERSITY_KEYS = ["black", "hispanic", "asian", "two_or_more", "white"];
    if (sortKey === "name") {
      pool = [...pool].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortKey === "diversity_index") {
      pool = [...pool].sort((a, b) => (b.diversity_index ?? -1) - (a.diversity_index ?? -1));
    } else if (DIVERSITY_KEYS.includes(sortKey)) {
      pool = [...pool].sort((a, b) => ((b.diversity || {})[sortKey] ?? -1) - ((a.diversity || {})[sortKey] ?? -1));
    } else if (sortKey === "admit_rate_asc") {
      pool = [...pool].sort((a, b) => byNullLast(a, b, "admit_rate", 1));
    } else if (sortKey === "admit_rate_desc") {
      pool = [...pool].sort((a, b) => byNullLast(a, b, "admit_rate", -1));
    } else if (sortKey === "net_price_asc") {
      pool = [...pool].sort((a, b) => byNullLast(a, b, "net_price", 1));
    } else if (sortKey === "size_desc") {
      pool = [...pool].sort((a, b) => byNullLast(a, b, "size", -1));
    } else if (sortKey === "grad_rate_desc") {
      pool = [...pool].sort((a, b) => byNullLast(a, b, "grad_rate", -1));
    }

    resultsCount.textContent = `${pool.length.toLocaleString()} school${pool.length === 1 ? "" : "s"} match`;
    renderPaged(resultsList, pool, (s) => cardHtml(s, activeMins), "No schools match these filters. Try lowering a threshold or clearing the campus setting/state filter.");

    resultsArea.hidden = false;
    noResults.hidden = true;
  });

  resultsArea.addEventListener("click", (e) => {
    if (e.target.classList.contains("chance-show-more")) {
      resultsList._visible += PAGE_SIZE;
      drawPaged(resultsList);
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
