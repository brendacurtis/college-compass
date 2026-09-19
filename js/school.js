(async function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const loading = document.getElementById("loading");
  const notFound = document.getElementById("not-found");
  const content = document.getElementById("school-content");

  if (!id) {
    loading.hidden = true;
    notFound.hidden = false;
    return;
  }

  let d;
  try {
    const res = await fetch(`data/details/${id}.json`);
    if (!res.ok) throw new Error("not found");
    d = await res.json();
  } catch (e) {
    loading.hidden = true;
    notFound.hidden = false;
    return;
  }

  loading.hidden = true;
  content.hidden = false;

  document.getElementById("page-title").textContent = `${d.name} — College Compass`;
  document.getElementById("crumb-name").textContent = d.name;
  document.getElementById("school-name").textContent = d.name;
  document.getElementById("school-loc").textContent = [d.city, d.state].filter(Boolean).join(", ") +
    (d.control ? " · " + d.control : "") + (d.locale ? " · " + d.locale : "");
  document.getElementById("school-badges").innerHTML = (d.designations || [])
    .map((t) => `<span class="badge gold">${escapeHtml(t)}</span>`).join("");

  document.getElementById("pdf-link").href = `pdfs/${d.id}.pdf`;
  const websiteLink = document.getElementById("website-link");
  if (d.url) {
    websiteLink.href = d.url.startsWith("http") ? d.url : "https://" + d.url;
  } else {
    websiteLink.hidden = true;
  }

  const trackerBtn = document.getElementById("tracker-btn");
  function refreshTrackerBtn() {
    if (isInTracker(d.id)) {
      trackerBtn.textContent = "✓ In My Tracker";
      trackerBtn.classList.add("btn-added");
    } else {
      trackerBtn.textContent = "+ Add to My Tracker";
      trackerBtn.classList.remove("btn-added");
    }
  }
  trackerBtn.addEventListener("click", () => {
    if (isInTracker(d.id)) {
      removeFromTracker(d.id);
    } else {
      addToTracker(d);
    }
    refreshTrackerBtn();
  });
  refreshTrackerBtn();

  // Tiles
  const tiles = [
    ["Admit Rate", d.admit_rate !== null ? d.admit_rate + "%" : "N/R"],
    ["Undergrads", fmtNum(d.size)],
    ["Avg Net Price", fmtMoney(d.net_price)],
    ["Grad Rate", d.grad_rate !== null ? d.grad_rate + "%" : "N/R"],
  ];
  document.getElementById("tile-strip").innerHTML = tiles
    .map(([l, v]) => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div></div>`)
    .join("");

  // Admissions
  const sat = d.sat || {};
  const act = d.act || {};
  document.getElementById("admissions-body").innerHTML = kv([
    ["Selectivity", d.selectivity],
    ["SAT EBRW (25th–75th pctile)", sat.ebrw_25 ? `${sat.ebrw_25}–${sat.ebrw_75}` : "Not reported"],
    ["SAT Math (25th–75th pctile)", sat.math_25 ? `${sat.math_25}–${sat.math_75}` : "Not reported"],
    ["SAT Average", sat.avg ? sat.avg : "Not reported"],
    ["ACT Composite (25th–75th pctile)", act.composite_25 ? `${act.composite_25}–${act.composite_75}` : "Not reported"],
  ]);

  // Cost
  let costHtml = kv([
    ["Tuition & fees (in-state)", fmtMoney(d.tuition_in)],
    ["Tuition & fees (out-of-state)", fmtMoney(d.tuition_out)],
    ["Total cost of attendance", fmtMoney(d.cost_of_attendance)],
    ["Average net price (after aid)", fmtMoney(d.net_price)],
    ["Students receiving Pell Grants", fmtPct(d.pell_pct)],
    ["Students taking federal loans", fmtPct(d.loan_pct)],
    ["Median federal debt at graduation", fmtMoney(d.debt_median)],
  ]);
  if (d.npc_url) {
    costHtml += `<p style="margin-top:12px;font-size:0.85rem;"><a href="${d.npc_url.startsWith("http") ? d.npc_url : "https://" + d.npc_url}" target="_blank" rel="noopener">Use this school's official Net Price Calculator →</a></p>`;
  }
  if (d.net_price_by_income) {
    const tiers = [
      ["Family income $0–$30k", d.net_price_by_income["0_30k"]],
      ["Family income $30k–$48k", d.net_price_by_income["30_48k"]],
      ["Family income $48k–$75k", d.net_price_by_income["48_75k"]],
      ["Family income $75k–$110k", d.net_price_by_income["75_110k"]],
      ["Family income $110k+", d.net_price_by_income["110k_plus"]],
    ].filter(([, v]) => v !== null && v !== undefined);
    if (tiers.length) {
      costHtml += `<h3 style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;color:#6b6b6b;margin:16px 0 8px;">Net Price by Family Income</h3>` +
        kv(tiers.map(([l, v]) => [l, fmtMoney(v)]));
    }
  }
  document.getElementById("cost-body").innerHTML = costHtml;

  // Diversity
  const RACE_LABELS = {
    white: "White", black: "Black / African American", hispanic: "Hispanic / Latino",
    asian: "Asian", aian: "American Indian / Alaska Native", nhpi: "Native Hawaiian / Pacific Islander",
    two_or_more: "Two or more races", nonresident_alien: "International students", unknown: "Not reported",
  };
  const RACE_COLORS = {
    white: "#8fa6c9", black: "#c8952c", hispanic: "#b4694e", asian: "#4c7a5e",
    aian: "#a67cb5", nhpi: "#4c9aa6", two_or_more: "#d9b36c", nonresident_alien: "#7c7c7c", unknown: "#c9c4b8",
  };
  const diversity = d.diversity || {};
  const entries = Object.entries(diversity).filter(([, v]) => v !== null && v > 0).sort((a, b) => b[1] - a[1]);
  let divHtml = entries.map(([k, v]) => bar(RACE_LABELS[k] || k, v, RACE_COLORS[k] || "#1b2a4a")).join("");
  const gender = d.gender || {};
  if (gender.women !== null && gender.women !== undefined) {
    divHtml += `<h3 style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;color:#6b6b6b;margin:16px 0 8px;">Gender</h3>`;
    divHtml += bar("Women", gender.women, "#b4694e") + bar("Men", gender.men, "#8fa6c9");
  }
  document.getElementById("diversity-body").innerHTML = divHtml || "<p>Diversity data not reported for this school.</p>";

  // Outcomes
  document.getElementById("outcomes-body").innerHTML = kv([
    ["First-year retention rate", fmtPct(d.retention_rate)],
    ["6-year graduation rate", fmtPct(d.grad_rate)],
    ["Median earnings, 6 yrs after entry", fmtMoney(d.earnings_6yr)],
    ["Median earnings, 10 yrs after entry", fmtMoney(d.earnings_10yr)],
  ]);

  // Majors
  if (d.top_majors && d.top_majors.length) {
    document.getElementById("majors-panel").hidden = false;
    document.getElementById("majors-body").innerHTML =
      `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px,1fr));gap:10px;">` +
      d.top_majors.map((m) => bar(m.field, m.pct, "#1b2a4a")).join("") +
      `</div>`;
  }

  function kv(rows) {
    return rows
      .map(([k, v]) => `<div class="kv-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`)
      .join("");
  }
  function bar(label, pct, color) {
    return `<div class="bar-item">
      <div class="bar-label"><span>${escapeHtml(label)}</span><strong>${pct}%</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, pct)}%;background:${color}"></div></div>
    </div>`;
  }
})();
