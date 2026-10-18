/* Shared admission-chance model and categories, used by Build My List and Find My Schools. */
window.CC = (function () {
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
  const CAP_MULT = 2;        // ... can't exceed this multiple of their admit rate (times any legacy/early boost)

  // Category cutoffs on estimated chance.
  const REACH_BELOW = 0.15, HIGH_BELOW = 0.40, TARGET_BELOW = 0.75, SAFETY_MIN_ADMIT = 50;

  // Legacy and early-round odds multipliers by school selectivity: [under 25% admit, 25-50%, 50%+].
  const LEGACY = { none: [1, 1, 1], parent_ug: [3, 1.5, 1], parent_grad: [1.5, 1.2, 1], sibling: [1.15, 1.1, 1] };
  const ROUND = { rd: [1, 1, 1], ea: [2, 1.4, 1], ed: [2.5, 1.8, 1.2] };
  const tier = (s) => (s.admit_rate < 25 ? 0 : s.admit_rate < 50 ? 1 : 2);
  const NO_ADJ = { legacy: "none", round: "rd" };
  const adjMult = (s, adj) => LEGACY[adj.legacy][tier(s)] * ROUND[adj.round][tier(s)];

  // Service academies need a nomination and a service commitment, so they aren't suggested as ordinary schools.
  const SERVICE_ACADEMY = /^United States (Military|Naval|Air Force|Coast Guard|Merchant Marine) /;

  const CATS = [
    { key: "reach", label: "Reach", cls: "reach", desc: "Estimated chance under 15%, or a school that admits under 15% of applicants" },
    { key: "high", label: "High Target", cls: "high", desc: "Estimated chance 15% to 39%: a realistic stretch" },
    { key: "target", label: "Target (Match)", cls: "match", desc: "Estimated chance 40% to 74%, or higher at a school that admits under half of applicants" },
    { key: "safety", label: "Safety", cls: "safety", desc: "Estimated chance 75% or more at a school admitting at least half of applicants" },
  ];

  function gpaMultiplier(g) {
    if (g === null || g === undefined || Number.isNaN(g)) return 1.0; // no GPA given: neutral
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

  // sat: SAT-equivalent score or null; gpa: unweighted 4.0 or null; adj: { legacy, round }.
  function estimate(s, sat, gpa, adj) {
    if (s.admit_rate === null || s.admit_rate === undefined) return null;
    adj = adj || NO_ADJ;
    const rng = satRange(s);
    let z = 0;
    if (sat !== null && rng) {
      const sd = Math.max(40, (rng.hi - rng.lo) / 1.349);
      z = Math.max(-3, Math.min(3, (sat - (rng.lo + rng.hi) / 2) / sd));
    }
    const m = adjMult(s, adj);
    const r = Math.max(0.005, Math.min(0.995, s.admit_rate / 100));
    const odds = (r / (1 - r)) * Math.exp(COEF * z) * gpaMultiplier(gpa) * m;
    let p = odds / (1 + odds);
    if (s.admit_rate < CAP_BELOW) p = Math.min(p, (CAP_MULT * m * s.admit_rate) / 100);
    return { p: Math.min(p, 0.995), z, rng, hasTest: sat !== null && !!rng, boosted: m > 1 };
  }

  function categorize(s, est) {
    const p = est.p;
    if ((s.admit_rate < 15 && !est.boosted) || p < REACH_BELOW) return "reach";
    if (p < HIGH_BELOW) return "high";
    if (p < TARGET_BELOW || s.admit_rate < SAFETY_MIN_ADMIT) return "target";
    return "safety";
  }

  let residencyCache = null;
  async function loadResidency() {
    if (residencyCache) return residencyCache;
    try { residencyCache = await (await fetch("data/residency.json")).json(); } catch (e) { residencyCache = {}; }
    return residencyCache;
  }

  // Adjust a school for the student's home state: in-state vs out-of-state admit rate (only where published
  // figures show a large gap), and an out-of-state price estimate at public schools.
  function personalize(s, home, residency) {
    if (!home) return s;
    residency = residency || {};
    const inState = s.state === home;
    const r = residency[s.id];
    const out = { ...s };
    if (s.control === "Public") out._status = inState ? "In-state" : "Out-of-state";
    if (r && r.apply) {
      out.admit_rate = inState ? r.in : r.out;
      out._admitNote = (inState ? "in-state" : "out-of-state") + " rate" + (r.estimate ? ", estimated" : "");
      out._status = out._status || (inState ? "In-state" : "Out-of-state");
    } else if (r) {
      out._resNote = "No clear in-state advantage found here (" + r.cycle + ")";
    }
    if (s.control === "Public" && !inState && s.net_price !== null && s.tuition_in != null && s.tuition_out != null) {
      out.net_price = s.net_price + Math.max(0, s.tuition_out - s.tuition_in);
      out._priceNote = true;
    }
    return out;
  }

  const fmtPctChance = (p) => (p < 0.005 ? "<1%" : p > 0.995 ? ">99%" : Math.round(p * 100) + "%");

  return { ACT_TO_SAT, actToSat, CATS, SERVICE_ACADEMY, NO_ADJ, gpaMultiplier, satRange, estimate, categorize, loadResidency, personalize, fmtPctChance };
})();
