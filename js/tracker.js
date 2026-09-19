(function () {
  const tbody = document.getElementById("tracker-tbody");
  const table = document.getElementById("tracker-table");
  const emptyState = document.getElementById("tracker-empty");
  const summaryEl = document.getElementById("tracker-summary");
  const addBtn = document.getElementById("add-school-btn");
  const addPanel = document.getElementById("add-school-panel");
  const addSearch = document.getElementById("add-school-search");
  const addResults = document.getElementById("add-school-results");
  const printBtn = document.getElementById("print-btn");
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFile = document.getElementById("import-file");

  function rowHtml(entry) {
    const statusOptions = STATUS_OPTIONS.map(
      (s) => `<option value="${s.value}" ${s.value === entry.status ? "selected" : ""}>${s.label}</option>`
    ).join("");
    const typeOptions = APP_TYPES.map(
      (t) => `<option value="${t}" ${t === entry.appType ? "selected" : ""}>${t || "— Select —"}</option>`
    ).join("");
    const meta = statusMeta(entry.status);
    return `
      <tr data-id="${entry.id}">
        <td>
          <a href="school.html?id=${entry.id}" style="font-weight:700;">${escapeHtml(entry.name)}</a><br>
          <span style="color:var(--muted); font-size:0.8rem;">${escapeHtml(entry.city)}, ${escapeHtml(entry.state)}</span>
        </td>
        <td><select class="f-apptype" data-field="appType">${typeOptions}</select></td>
        <td><input type="date" class="f-deadline" data-field="deadline" value="${entry.deadline || ""}"></td>
        <td><select class="f-status status-select-${meta.color}" data-field="status">${statusOptions}</select></td>
        <td><textarea class="f-notes" data-field="notes" placeholder="Essay status, portal login hints, interview notes…">${escapeHtml(entry.notes || "")}</textarea></td>
        <td><button class="remove-btn" title="Remove from tracker" aria-label="Remove">&times;</button></td>
      </tr>`;
  }

  function render() {
    const t = getTracker();
    const entries = Object.values(t.schools).sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));

    if (!entries.length) {
      table.hidden = true;
      emptyState.style.display = "block";
      summaryEl.innerHTML = "";
      return;
    }
    table.hidden = false;
    emptyState.style.display = "none";
    tbody.innerHTML = entries.map(rowHtml).join("");

    const counts = {};
    for (const e of entries) counts[e.status] = (counts[e.status] || 0) + 1;
    summaryEl.innerHTML =
      `<div class="chip"><strong>${entries.length}</strong>Total Schools</div>` +
      STATUS_OPTIONS.filter((s) => counts[s.value])
        .map((s) => `<div class="chip"><strong>${counts[s.value]}</strong>${s.label}</div>`)
        .join("");
  }

  tbody.addEventListener("change", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const id = row.dataset.id;
    const field = e.target.dataset.field;
    if (!field) return;
    updateTrackerEntry(id, { [field]: e.target.value });
    if (field === "status") {
      const meta = statusMeta(e.target.value);
      e.target.className = "f-status status-select-" + meta.color;
      const chip = summaryEl;
      render();
    }
  });

  tbody.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-btn")) {
      const row = e.target.closest("tr");
      if (confirm("Remove this school from your tracker? This can't be undone.")) {
        removeFromTracker(row.dataset.id);
        render();
      }
    }
  });

  addBtn.addEventListener("click", () => {
    addPanel.style.display = addPanel.style.display === "none" ? "block" : "none";
    if (addPanel.style.display === "block") addSearch.focus();
  });

  let allSchools = null;
  let debounceTimer;
  addSearch.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runAddSearch, 150);
  });

  async function runAddSearch() {
    if (!allSchools) allSchools = await fetchSchools();
    const q = addSearch.value.trim().toLowerCase();
    if (!q) {
      addResults.innerHTML = "";
      return;
    }
    const matches = allSchools
      .filter((s) => `${s.name} ${s.city} ${s.state}`.toLowerCase().includes(q))
      .slice(0, 20);
    const tracker = getTracker();
    addResults.innerHTML = matches
      .map((s) => {
        const added = !!tracker.schools[s.id];
        return `<div class="add-result-row">
          <span>${escapeHtml(s.name)} <span style="color:var(--muted);">— ${escapeHtml(s.city)}, ${escapeHtml(s.state)}</span></span>
          <button data-id="${s.id}" ${added ? "disabled" : ""}>${added ? "Added" : "Add"}</button>
        </div>`;
      })
      .join("") || `<p style="color:var(--muted); font-size:0.85rem;">No matches.</p>`;
  }

  addResults.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON" && !e.target.disabled) {
      const id = Number(e.target.dataset.id);
      const school = allSchools.find((s) => s.id === id);
      if (school) {
        addToTracker(school);
        render();
        runAddSearch();
      }
    }
  });

  printBtn.addEventListener("click", () => window.print());

  exportBtn.addEventListener("click", () => {
    const data = getTracker();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `college-tracker-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object" || !data.schools) throw new Error("bad format");
        const existing = getTracker();
        const existingCount = Object.keys(existing.schools).length;
        if (existingCount > 0) {
          if (!confirm(`This will replace your current tracker (${existingCount} schools) with the backup file (${Object.keys(data.schools).length} schools). Continue?`)) {
            importFile.value = "";
            return;
          }
        }
        saveTracker(data);
        render();
        alert("Tracker restored successfully.");
      } catch (e) {
        alert("That file doesn't look like a valid College Compass backup.");
      }
      importFile.value = "";
    };
    reader.readAsText(file);
  });

  render();
})();
