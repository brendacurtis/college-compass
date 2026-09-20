(async function () {
  const grid = document.getElementById("card-grid");
  const resultsCount = document.getElementById("results-count");
  const emptyState = document.getElementById("empty-state");
  const loadMoreBtn = document.getElementById("load-more");
  const searchInput = document.getElementById("search-input");
  const searchForm = document.getElementById("search-form");
  const stateSelect = document.getElementById("f-state");
  const sizeSelect = document.getElementById("f-size");
  const selectivitySelect = document.getElementById("f-selectivity");
  const localeSelect = document.getElementById("f-locale");
  const priceInput = document.getElementById("f-price");
  const sortSelect = document.getElementById("sort-select");
  const resetBtn = document.getElementById("reset-filters");

  const PAGE_SIZE = 30;
  let visibleCount = PAGE_SIZE;
  let schools = [];
  let filtered = [];

  try {
    schools = await fetchSchools();
  } catch (e) {
    resultsCount.textContent = "Could not load school data.";
    return;
  }

  document.getElementById("stat-total").textContent = schools.length.toLocaleString();
  const states = [...new Set(schools.map((s) => s.state).filter(Boolean))].sort();
  document.getElementById("stat-states").textContent = states.length;
  for (const st of states) {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    stateSelect.appendChild(opt);
  }

  function getCheckedValues(selector) {
    return [...document.querySelectorAll(selector + ":checked")].map((el) => el.value);
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const state = stateSelect.value;
    const controls = getCheckedValues(".f-control");
    const size = sizeSelect.value;
    const selectivity = selectivitySelect.value;
    const locale = localeSelect.value;
    const maxPrice = priceInput.value ? Number(priceInput.value) : null;
    const tags = getCheckedValues(".f-tag");

    filtered = schools.filter((s) => {
      if (q) {
        const hay = `${s.name} ${s.city} ${s.state}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (state && s.state !== state) return false;
      if (controls.length && !controls.includes(s.control)) return false;
      if (size && s.size_bucket !== size) return false;
      if (selectivity && s.selectivity !== selectivity) return false;
      if (locale && s.locale_bucket !== locale) return false;
      if (maxPrice !== null && (s.net_price === null || s.net_price > maxPrice)) return false;
      if (tags.length && !tags.every((t) => (s.designations || []).includes(t))) return false;
      return true;
    });

    sortResults();
    visibleCount = PAGE_SIZE;
    render();
  }

  function sortResults() {
    const mode = sortSelect.value;
    const byNullLast = (a, b, key, dir) => {
      if (a[key] === null && b[key] === null) return 0;
      if (a[key] === null) return 1;
      if (b[key] === null) return -1;
      return (a[key] - b[key]) * dir;
    };
    switch (mode) {
      case "admit_rate_asc":
        filtered.sort((a, b) => byNullLast(a, b, "admit_rate", 1));
        break;
      case "admit_rate_desc":
        filtered.sort((a, b) => byNullLast(a, b, "admit_rate", -1));
        break;
      case "net_price_asc":
        filtered.sort((a, b) => byNullLast(a, b, "net_price", 1));
        break;
      case "size_desc":
        filtered.sort((a, b) => byNullLast(a, b, "size", -1));
        break;
      case "grad_rate_desc":
        filtered.sort((a, b) => byNullLast(a, b, "grad_rate", -1));
        break;
      default:
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  function badgeHtml(s) {
    let html = "";
    if (s.selectivity && s.selectivity !== "Not reported") {
      html += `<span class="badge">${escapeHtml(s.selectivity.replace(/\s*\(.*?\)/, ""))}</span>`;
    }
    for (const tag of (s.designations || []).slice(0, 3)) {
      html += `<span class="badge gold">${escapeHtml(tag)}</span>`;
    }
    return html;
  }

  function cardHtml(s) {
    return `
      <a class="school-card" href="school.html?id=${s.id}">
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="loc">${escapeHtml(s.city)}, ${escapeHtml(s.state)} · ${escapeHtml(s.control || "")}</div>
        <div class="badges">${badgeHtml(s)}</div>
        <div class="metrics">
          <div class="metric"><div class="v">${s.admit_rate !== null ? s.admit_rate + "%" : "N/R"}</div><div class="l">Admit Rate</div></div>
          <div class="metric"><div class="v">${s.net_price !== null ? "$" + Math.round(s.net_price / 1000) + "k" : "N/R"}</div><div class="l">Net Price</div></div>
          <div class="metric"><div class="v">${s.grad_rate !== null ? s.grad_rate + "%" : "N/R"}</div><div class="l">Grad Rate</div></div>
        </div>
      </a>`;
  }

  function render() {
    if (!filtered.length) {
      grid.innerHTML = "";
      emptyState.hidden = false;
      loadMoreBtn.hidden = true;
      resultsCount.textContent = "0 schools found";
      return;
    }
    emptyState.hidden = true;
    const slice = filtered.slice(0, visibleCount);
    grid.innerHTML = slice.map(cardHtml).join("");
    resultsCount.textContent = `${filtered.length.toLocaleString()} school${filtered.length === 1 ? "" : "s"} found`;
    loadMoreBtn.hidden = visibleCount >= filtered.length;
  }

  let debounceTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 180);
  });
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFilters();
  });
  [stateSelect, sizeSelect, selectivitySelect, localeSelect, sortSelect].forEach((el) =>
    el.addEventListener("change", applyFilters)
  );
  priceInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 250);
  });
  document.querySelectorAll(".f-control, .f-tag").forEach((el) => el.addEventListener("change", applyFilters));
  loadMoreBtn.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    render();
  });
  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    stateSelect.value = "";
    sizeSelect.value = "";
    selectivitySelect.value = "";
    localeSelect.value = "";
    priceInput.value = "";
    sortSelect.value = "name";
    document.querySelectorAll(".f-control, .f-tag").forEach((el) => (el.checked = false));
    applyFilters();
  });

  applyFilters();
})();
