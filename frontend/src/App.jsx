// Frontend Dashboard for Climate Risk Calculator
// Updated: Exposure now includes Total_Population, Age, exposure_indicator_3–10 (10 indicators)
//          Vulnerability now includes Labour Force Participation Rate, Unemployment, Piped Water x2, vulnerability_indicator_5–10 (10 indicators)
//          Male/Female columns removed. All indicator names sourced dynamically from /api/current-risk.
//          Adaptation tab: exposure & vulnerability now have growth multiplier sliders.
//          Future Risk tab: exposure & vulnerability now also have growth multiplier sliders.
import { useState, useEffect, useRef } from "react";

const API = "http://127.0.0.1:8000/api";

// ── Professional colour palette ──────────────────────────────────────────────
const C = {
  pageBg:      "#F4F6F9",
  surface:     "#FFFFFF",
  surfaceAlt:  "#F8FAFC",
  border:      "#DDE3EC",
  borderLight: "#EDF0F5",
  textPrimary:   "#1A2332",
  textSecondary: "#4A5568",
  textMuted:     "#8A96A8",
  navy:        "#1E3A5F",
  navyLight:   "#2C4F7C",
  hazard:        { bg: "#FDF4EE", border: "#C8885A", text: "#7A4520", accent: "#9A5530", dot: "#C8885A", header: "#8B4513" },
  exposure:      { bg: "#EEF3FA", border: "#5C85C0", text: "#1E3F6E", accent: "#2E5FA0", dot: "#5C85C0", header: "#1E3F6E" },
  vulnerability: { bg: "#EEF7F2", border: "#4E9E6E", text: "#1E5535", accent: "#2E7A4E", dot: "#4E9E6E", header: "#1E5535" },
  levelLow:      { color: "#1E5535", bg: "#D8EFE2" },
  levelModerate: { color: "#7A5C00", bg: "#F5E8C0" },
  levelHigh:     { color: "#8B2C2C", bg: "#F5D8D8" },
  levelVeryHigh: { color: "#4A2080", bg: "#E0D5F5" },
  levelExtreme:  { color: "#5C1A1A", bg: "#F5D0D0" },
  stageCurrentBorder:  "#5C85C0",
  stageFutureBorder:   "#C8885A",
  stageProjectBorder:  "#4E9E6E",
  recalcBg:     "#FFFBEB",
  recalcBorder: "#D97706",
  recalcText:   "#92400E",
  recalcBtn:    "#D97706",
};

const COLORS = {
  hazard:        C.hazard,
  exposure:      C.exposure,
  vulnerability: C.vulnerability,
};

const LEVEL_STYLE = {
  Low:         C.levelLow,
  Moderate:    C.levelModerate,
  High:        C.levelHigh,
  "Very High": C.levelVeryHigh,
  Extreme:     C.levelExtreme,
};

function levelFromScore(s) {
  if (s < 0.20) return "Low";
  if (s < 0.40) return "Moderate";
  if (s < 0.60) return "High";
  if (s < 0.80) return "Very High";
  return "Extreme";
}

const MIN_W = 0.05;
const STEP  = 0.05;

function autoBalance(weights, changedKey, newVal) {
  const keys = Object.keys(weights);
  if (keys.length === 1) return { [changedKey]: 1.0 };
  const others = keys.filter(k => k !== changedKey);
  const clamped = Math.min(1 - others.length * MIN_W, Math.max(MIN_W, newVal));
  const remaining = Math.round((1.0 - clamped) * 100) / 100;
  const oldTotal = others.reduce((s, k) => s + weights[k], 0);
  const next = { ...weights, [changedKey]: clamped };
  let assigned = 0;
  others.forEach((k, i) => {
    if (i === others.length - 1) {
      next[k] = Math.max(MIN_W, parseFloat((remaining - assigned).toFixed(2)));
    } else {
      const share = oldTotal > 0
        ? parseFloat(((weights[k] / oldTotal) * remaining).toFixed(2))
        : parseFloat((remaining / others.length).toFixed(2));
      next[k] = Math.max(MIN_W, share);
      assigned += next[k];
    }
  });
  return next;
}

function initEqual(keys) {
  if (!keys.length) return {};
  const base = parseFloat((1 / keys.length).toFixed(2));
  const w = {};
  keys.forEach((k, i) => { w[k] = i === keys.length - 1 ? parseFloat((1 - base * (keys.length - 1)).toFixed(2)) : base; });
  return w;
}

function buildSectionResult(items, outerWeight) {
  const score = items.reduce((sum, item) => sum + (item.value || 0) * (item.weight || 0), 0);
  return {
    score: parseFloat(score.toFixed(6)),
    outerWeight,
    contribution: parseFloat((score * outerWeight).toFixed(6)),
    items: items.map(item => ({ ...item })),
  };
}

function buildCurrentRiskResult(outer, hazardCfg, expCfg, vulnCfg) {
  const hazardItems = Object.entries(hazardCfg).map(([name, item]) => ({
    name,
    value: item.value,
    weight: item.weight,
    isCustom: item.isCustom || false,
  }));
  const exposureItems = Object.entries(expCfg)
    .filter(([, item]) => item.enabled !== false)
    .map(([name, item]) => ({
      name,
      value: item.value,
      weight: item.weight,
      isCustom: item.isCustom || false,
    }));
  const vulnerabilityItems = Object.entries(vulnCfg)
    .filter(([, item]) => item.enabled !== false)
    .map(([name, item]) => ({
      name,
      value: item.value,
      weight: item.weight,
      isCustom: item.isCustom || false,
    }));

  const hazard = buildSectionResult(hazardItems, outer.hazard);
  const exposure = buildSectionResult(exposureItems, outer.exposure);
  const vulnerability = buildSectionResult(vulnerabilityItems, outer.vulnerability);
  const riskScore = parseFloat((hazard.contribution + exposure.contribution + vulnerability.contribution).toFixed(6));

  return {
    province: null,
    riskScore,
    level: levelFromScore(riskScore),
    breakdown: { hazard, exposure, vulnerability },
  };
}

function buildConfigFromItems(items) {
  const normalized = {};
  const baseWeights = initEqual(items.map(item => item.name));
  items.forEach(item => {
    let displayName = item.name;
    if (displayName === "LFPR_Overall") {
      displayName = "Labour Force Participation Rate";
    }
    normalized[displayName] = {
      value: item.value ?? 0,
      baseValue: item.value ?? 0,
      weight: typeof item.weight === "number" ? item.weight : baseWeights[item.name],
      multiplier: item.multiplier ?? 1,
      isCustom: item.isCustom || false,
      enabled: true,
    };
  });
  return normalized;
}

function buildHazardConfigFromItems(items, withYears = false) {
  const normalized = {};
  const baseWeights = initEqual(items.map(item => item.name));
  items.forEach(item => {
    const isBuiltin = item.name === "Hazard 1" || item.name === "Hazard 2";
    normalized[item.name] = {
      enabled: true,
      weight: typeof item.weight === "number" ? item.weight : baseWeights[item.name],
      value: item.value ?? 0,
      year: withYears && isBuiltin ? 2025 : null,
      isCustom: item.isCustom || !isBuiltin,
    };
  });
  return normalized;
}

// ── Sync adapt cfg from current cfg ──────────────────────────────────────────
function syncAdaptCfgFromCurrent(currentCfg, prevAdaptCfg) {
  const next = {};
  Object.entries(currentCfg).forEach(([name, cur]) => {
    if (cur.enabled === false) return;
    const prev = prevAdaptCfg[name];
    next[name] = {
      enabled: true,
      weight: cur.weight,
      baseValue: cur.value ?? cur.baseValue ?? 0,
      multiplier: prev?.multiplier ?? 1,
      isCustom: cur.isCustom || false,
    };
  });
  return next;
}

// ── Shared UI primitives ─────────────────────────────────────────────────────

function Dropdown({ label, options, selected, setSelected }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ width: "100%", position: "relative" }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, marginBottom: 7 }}>{label}</label>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.navy, color: "white", fontSize: 14, fontWeight: 500, padding: "11px 15px", borderRadius: 10, border: `1px solid ${C.navyLight}`, cursor: "pointer" }}>
        <span>{selected || "Select"}</span>
        <svg style={{ width: 16, height: 16, flexShrink: 0, color: "#8AAFD0", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 150, width: "100%", marginTop: 6, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,0.10)" }}>
          {options.map(s => (
            <button key={s} onClick={() => { setSelected(s); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 15px", fontSize: 14, textAlign: "left", cursor: "pointer", border: "none", borderBottom: `1px solid ${C.borderLight}`, background: selected === s ? "#EBF2FA" : C.surface, color: selected === s ? C.navyLight : C.textPrimary, fontWeight: selected === s ? 700 : 400 }}>
              {s}
              {selected === s && <svg style={{ width: 15, height: 15 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, color, children }) {
  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
      <div style={{ background: color.bg, padding: "8px 13px", borderBottom: `1px solid ${color.border}` }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: color.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</span>
      </div>
      <div style={{ padding: "12px" }}>{children}</div>
    </div>
  );
}

function WSlider({ value, onChange, color, disabled }) {
  const safeValue = typeof value === "number" && !isNaN(value) ? value : MIN_W;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="range" min={MIN_W} max={1} step={STEP} value={safeValue} disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: color, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }} />
      <span style={{ minWidth: 36, fontSize: 12, fontWeight: 700, color: disabled ? C.textMuted : color, textAlign: "right" }}>{safeValue.toFixed(2)}</span>
    </div>
  );
}

function MultSlider({ value, onChange, color, allowDecrease = false }) {
  const min = allowDecrease ? 0.0 : 0.1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="range" min={min} max={5} step={0.05} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: color, cursor: "pointer" }} />
      <span style={{ minWidth: 44, fontSize: 12, fontWeight: 700, color: value < 1 ? "#8B2C2C" : value > 1 ? color : C.textMuted, textAlign: "right" }}>{value.toFixed(2)}×</span>
    </div>
  );
}

function LevelBadge({ level }) {
  const ls = LEVEL_STYLE[level] || LEVEL_STYLE.Moderate;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: ls.color, background: ls.bg, padding: "3px 10px", borderRadius: 99, display: "inline-block" }}>{level}</span>
  );
}

function OuterWeightBar({ outer, setOuter }) {
  function change(key, val) { setOuter(prev => autoBalance(prev, key, val)); }
  const total = Object.values(outer).reduce((s, v) => s + v, 0);
  const ok = Math.abs(total - 1.0) < 0.02;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Outer Weights</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: ok ? C.vulnerability.accent : "#8B2C2C" }}>Σ = {total.toFixed(2)} {ok ? "✓" : "⚠"}</span>
      </div>
      {[["hazard","Hazard"],["exposure","Exposure"],["vulnerability","Vulnerability"]].map(([key, label]) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 99, background: COLORS[key].dot }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS[key].text }}>{label}</span>
          </div>
          <WSlider value={outer[key]} onChange={v => change(key, v)} color={COLORS[key].accent} />
        </div>
      ))}
      <div style={{ display: "flex", height: 5, borderRadius: 99, overflow: "hidden", gap: 2, marginTop: 8 }}>
        {["hazard","exposure","vulnerability"].map(k => (
          <div key={k} style={{ flex: outer[k] * 100, background: COLORS[k].dot, borderRadius: 99, transition: "flex 0.3s" }} />
        ))}
      </div>
    </div>
  );
}

// ── Recalculate Banner ────────────────────────────────────────────────────────

function RecalculateBanner({ onRecalculate }) {
  return (
    <div style={{
      marginBottom: 16,
      padding: "13px 18px",
      borderRadius: 12,
      background: C.recalcBg,
      border: `1.5px solid ${C.recalcBorder}`,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.recalcText }}>
            New indicator added — baseline not yet updated
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.recalcText, opacity: 0.8 }}>
            Click Recalculate to lock in the new score as the baseline for Future Risk and Adaptation tabs.
          </p>
        </div>
      </div>
      <button
        onClick={onRecalculate}
        style={{
          flexShrink: 0,
          padding: "10px 20px",
          borderRadius: 9,
          border: "none",
          background: C.recalcBtn,
          color: "white",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "0.03em",
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(217,119,6,0.25)",
        }}
      >
        ⟳ Recalculate Current Risk
      </button>
    </div>
  );
}

// ── CurrentRiskIndicatorSection ───────────────────────────────────────────────

function CurrentRiskIndicatorSection({ type, title, cfg, setCfg, onToggle }) {
  const c = COLORS[type];

  const allEntries   = Object.entries(cfg);
  const enabledNames = allEntries.filter(([, v]) => v.enabled !== false).map(([k]) => k);
  const enabledCount = enabledNames.length;

  function toggle(name) {
    onToggle?.();
    setCfg(prev => {
      const wasEnabled = prev[name]?.enabled !== false;
      const draft = { ...prev };
      draft[name] = { ...prev[name], enabled: !wasEnabled };

      const nowEnabled = Object.keys(draft).filter(k => draft[k]?.enabled !== false);
      if (nowEnabled.length > 0) {
        const w = initEqual(nowEnabled);
        nowEnabled.forEach(k => { draft[k] = { ...draft[k], weight: w[k] }; });
      }
      Object.keys(draft).forEach(k => {
        if (draft[k]?.enabled === false) draft[k] = { ...draft[k], weight: 0 };
      });
      return draft;
    });
  }

  function changeWeight(name, val) {
    setCfg(prev => {
      const enabled = Object.keys(prev).filter(k => prev[k]?.enabled !== false);
      const cur = Object.fromEntries(enabled.map(k => [k, prev[k].weight]));
      const balanced = autoBalance(cur, name, val);
      const draft = { ...prev };
      enabled.forEach(k => { draft[k] = { ...draft[k], weight: balanced[k] }; });
      return draft;
    });
  }

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>{enabledCount} / {allEntries.length} selected → flows to Future & Adaptation</span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>
        {allEntries.map(([name, ind]) => {
          const isEnabled = ind.enabled !== false;
          return (
            <div key={name} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.borderLight}`, opacity: isEnabled ? 1 : 0.4, transition: "opacity 0.2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isEnabled ? 6 : 0 }}>
                <div
                  onClick={() => toggle(name)}
                  style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: "pointer",
                    border: `2px solid ${isEnabled ? c.accent : "#CBD5E1"}`,
                    background: isEnabled ? c.accent : "#F8FAFC",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s", boxShadow: isEnabled ? `0 0 0 3px ${c.accent}22` : "none"
                  }}
                >
                  {isEnabled && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: isEnabled ? 700 : 400, color: isEnabled ? c.text : "#94A3B8", flex: 1, userSelect: "none" }}>
                  {name}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isEnabled ? c.accent : "#94A3B8",
                  background: isEnabled ? c.bg : "#F1F5F9",
                  border: `1px solid ${isEnabled ? c.border : "#E2E8F0"}`,
                  borderRadius: 6, padding: "2px 8px"
                }}>
                  {typeof ind.value === "number" ? ind.value.toFixed(3) : "—"}
                </span>
              </div>
              {isEnabled && (
                <div style={{ paddingLeft: 26 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Weight</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.accent }}>{ind.weight.toFixed(2)}</span>
                  </div>
                  <WSlider value={ind.weight} onChange={v => changeWeight(name, v)} color={c.accent} disabled={enabledCount < 2} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CurrentRiskSummaryPanel ───────────────────────────────────────────────────

function CurrentRiskSummaryPanel({ result, isDirty }) {
  const level = result ? result.level : null;
  const lstyle = level ? LEVEL_STYLE[level] : null;

  return (
    <div style={{ position: "sticky", top: 180 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Current Risk Summary</h3>

      {isDirty && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, background: C.recalcBg, border: `1px solid ${C.recalcBorder}`, fontSize: 11, color: C.recalcText, fontWeight: 600 }}>
          ⏳ Score preview — click Recalculate to confirm as baseline
        </div>
      )}

      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${isDirty ? C.recalcBorder : lstyle ? lstyle.bg : C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "28px 20px 20px", background: lstyle ? lstyle.bg : C.surfaceAlt, display: "flex", flexDirection: "column", alignItems: "center", minHeight: 150, transition: "background 0.4s" }}>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, marginBottom: 8, color: lstyle ? lstyle.color : C.border, opacity: isDirty ? 0.7 : 1 }}>{result ? result.riskScore.toFixed(3) : "—"}</div>
          {result && <div style={{ fontSize: 10, fontWeight: 600, color: lstyle ? lstyle.color : C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, opacity: 0.7 }}>Risk Index (0–1){isDirty ? " · pending" : ""}</div>}
          <div style={{ padding: "5px 18px", borderRadius: 99, background: lstyle ? lstyle.color : C.border, color: "white", fontWeight: 700, fontSize: 13, transition: "all 0.4s", opacity: isDirty ? 0.75 : 1 }}>{level || "Not calculated"}</div>
          {result && (
            <div style={{ width: "100%", maxWidth: 180, marginTop: 16 }}>
              <div style={{ height: 5, borderRadius: 99, background: "#E2E8F0", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${result.riskScore * 100}%`, background: `linear-gradient(90deg,${C.vulnerability.accent},${C.hazard.accent})`, borderRadius: 99, transition: "width 0.6s ease" }} />
              </div>
            </div>
          )}
        </div>
        {result && (
          <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "13px 16px", background: C.surfaceAlt }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 9px" }}>Component Contributions</p>
            {[['hazard','Hazard'],['exposure','Exposure'],['vulnerability','Vulnerability']].map(([key, lbl]) => {
              const cc = COLORS[key];
              const comp = result.breakdown[key];
              return (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 99, background: cc.dot }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: cc.text }}>{lbl}</span>
                      <span style={{ fontSize: 10, color: C.textMuted }}>× {comp.outerWeight.toFixed(2)}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cc.accent }}>{comp.contribution.toFixed(4)}</span>
                  </div>
                  {comp.items.map((item, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", paddingLeft: 11, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: C.textSecondary }}>{item.name}</span>
                      <span style={{ fontSize: 11, color: C.textPrimary, fontWeight: 600 }}>{item.value.toFixed(3)} × {item.weight.toFixed(2)} = {(item.value * item.weight).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>Formula</p>
              <p style={{ fontSize: 11, color: C.textSecondary, margin: 0, lineHeight: 1.7, fontFamily: "monospace" }}>
                Risk = (H×{result.breakdown.hazard?.outerWeight.toFixed(2)}) + (E×{result.breakdown.exposure?.outerWeight.toFixed(2)}) + (V×{result.breakdown.vulnerability?.outerWeight.toFixed(2)})<br />
                &nbsp;&nbsp;&nbsp;&nbsp; = {result.breakdown.hazard?.contribution.toFixed(4)} + {result.breakdown.exposure?.contribution.toFixed(4)} + {result.breakdown.vulnerability?.contribution.toFixed(4)}<br />
                &nbsp;&nbsp;&nbsp;&nbsp; = <b>{result.riskScore.toFixed(4)}</b>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CurrentRiskTab ────────────────────────────────────────────────────────────

function CurrentRiskTab({
  province, sector, currentData, error,
  outer, setOuter,
  hazardCfg, setHazardCfg,
  expCfg, setExpCfg,
  vulnCfg, setVulnCfg,
  isDirty, setIsDirty,
  onBaselineConfirmed,
}) {
  if (!currentData) return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      {error && <div style={{ margin: "0 auto 14px", maxWidth: 720, padding: "10px 13px", borderRadius: 9, background: "#FDF2F2", border: `1px solid #E8C0C0`, fontSize: 13, color: "#8B2C2C", fontWeight: 500, textAlign: "left" }}>⚠ {error}</div>}
      <p style={{ fontSize: 14, fontWeight: 700, color: C.hazard.text }}>⚠ Load Current Risk first</p>
    </div>
  );

  const result = buildCurrentRiskResult(outer, hazardCfg, expCfg, vulnCfg);

  function handleRecalculate() {
    setIsDirty(false);
    onBaselineConfirmed(result.riskScore);
  }

  return (
    <div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 15px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Current Risk View — 2026</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary }}>Sector: {sector}</span>
      </div>

      {isDirty && <RecalculateBanner onRecalculate={handleRecalculate} />}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1.15fr 0.85fr", alignItems: "start" }}>
        <div>
          <OuterWeightBar outer={outer} setOuter={setOuter} />
          <h3 style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Adjust Current Risk</h3>
          <CurrentRiskIndicatorSection type="hazard"        title="Hazard"        cfg={hazardCfg} setCfg={setHazardCfg} onToggle={() => setIsDirty(true)} />
          <CurrentRiskIndicatorSection type="exposure"      title="Exposure"      cfg={expCfg}    setCfg={setExpCfg}    onToggle={() => setIsDirty(true)} />
          <CurrentRiskIndicatorSection type="vulnerability" title="Vulnerability" cfg={vulnCfg}   setCfg={setVulnCfg}   onToggle={() => setIsDirty(true)} />
        </div>
        <CurrentRiskSummaryPanel result={result} isDirty={isDirty} />
      </div>
    </div>
  );
}

// ── HazardSection (Future tab) ────────────────────────────────────────────────

function HazardSection({ hazardCfg, setHazardCfg, currentHazardCfg, disableWeights = false, readOnly = false }) {
  const BUILTINS = ["Hazard 1", "Hazard 2"];
  const [yearData, setYearData] = useState({});
  const [allYears, setAllYears] = useState([]);
  const [loading, setLoading]   = useState(true);

  const enabledInCurrent = BUILTINS.filter(h => currentHazardCfg?.[h]?.enabled !== false);

  function getBandForYear(year) {
    const bandStart = 2026 + Math.floor((year - 2026) / 11) * 11;
    const bandEnd = bandStart + 10;
    return { bandStart, bandEnd, bandLabel: `${bandStart}–${bandEnd}` };
  }

  useEffect(() => {
    async function fetchHazardData() {
      setLoading(true);
      try {
        const [r1, r2] = await Promise.all([
          fetch(`${API}/future-risk/years?hazard=Hazard+1`),
          fetch(`${API}/future-risk/years?hazard=Hazard+2`),
        ]);
        const d1 = await r1.json();
        const d2 = await r2.json();
        const years1 = d1.years || [];
        const years2 = d2.years || [];
        const yearValues = {};
        for (const year of years1) {
          try {
            const res = await fetch(`${API}/future-risk/value?hazard=Hazard+1&year=${year}`);
            const data = await res.json();
            if (!yearValues[year]) yearValues[year] = {};
            yearValues[year].h1Value = data.value || 0;
          } catch {}
        }
        for (const year of years2) {
          try {
            const res = await fetch(`${API}/future-risk/value?hazard=Hazard+2&year=${year}`);
            const data = await res.json();
            if (!yearValues[year]) yearValues[year] = {};
            yearValues[year].h2Value = data.value || 0;
          } catch {}
        }
        const allYearSet = new Set([...years1, ...years2]);
        const sortedYears = Array.from(allYearSet).filter(y => y >= 2026).sort((a, b) => a - b);
        const bandMap = {};
        const yearDataMap = {};
        for (const year of sortedYears) {
          const band = getBandForYear(year);
          const key = `${band.bandStart}-${band.bandEnd}`;
          if (!bandMap[key]) {
            bandMap[key] = { bandStart: band.bandStart, bandEnd: band.bandEnd, years: [], h1Sum: 0, h2Sum: 0, h1Count: 0, h2Count: 0 };
          }
          bandMap[key].years.push(year);
          if (yearValues[year]?.h1Value !== undefined) { bandMap[key].h1Sum += yearValues[year].h1Value; bandMap[key].h1Count++; }
          if (yearValues[year]?.h2Value !== undefined) { bandMap[key].h2Sum += yearValues[year].h2Value; bandMap[key].h2Count++; }
        }
        for (const [, band] of Object.entries(bandMap)) {
          const h1Avg = band.h1Count > 0 ? band.h1Sum / band.h1Count : 0;
          const h2Avg = band.h2Count > 0 ? band.h2Sum / band.h2Count : 0;
          for (const year of band.years) {
            yearDataMap[year] = { h1Value: h1Avg, h2Value: h2Avg, bandStart: band.bandStart, bandEnd: band.bandEnd, bandLabel: `${band.bandStart}–${band.bandEnd}` };
          }
        }
        setYearData(yearDataMap);
        setAllYears(sortedYears);
        const defaultYear = sortedYears[0] || 2026;
        const existingYear = hazardCfg["Hazard 1"]?.year || hazardCfg["Hazard 2"]?.year || null;
        const validYear = existingYear && yearDataMap[existingYear] ? existingYear : defaultYear;
        if (validYear && yearDataMap[validYear]) {
          const entry = yearDataMap[validYear];
          setHazardCfg(prev => {
            const next = { ...prev };
            BUILTINS.forEach(h => {
              if (next[h]) {
                next[h] = { ...next[h], year: validYear, bandStart: entry.bandStart, bandEnd: entry.bandEnd, bandLabel: entry.bandLabel, value: h === "Hazard 1" ? entry.h1Value : entry.h2Value };
              }
            });
            return next;
          });
        }
      } catch (e) { console.error("Failed to fetch hazard data", e); }
      setLoading(false);
    }
    fetchHazardData();
  }, []);

  if (enabledInCurrent.length === 0) {
    return (
      <div style={{ border: `1px solid ${COLORS.hazard.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ background: COLORS.hazard.bg, padding: "9px 13px", borderBottom: `1px solid ${COLORS.hazard.border}` }}>
          <span style={{ fontWeight: 700, fontSize: 11, color: COLORS.hazard.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>Hazard</span>
        </div>
        <div style={{ padding: "16px 13px", background: C.surface, textAlign: "center" }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>No hazards selected — go to <b>Current Risk</b> tab to select hazard indicators.</span>
        </div>
      </div>
    );
  }

  function selectYear(year) {
    const entry = yearData[year];
    if (!entry) return;
    setHazardCfg(prev => {
      const next = { ...prev };
      BUILTINS.forEach(h => {
        if (next[h] && enabledInCurrent.includes(h)) {
          next[h] = { ...next[h], year, bandStart: entry.bandStart, bandEnd: entry.bandEnd, bandLabel: entry.bandLabel, value: h === "Hazard 1" ? entry.h1Value : entry.h2Value, enabled: true };
        }
      });
      return next;
    });
  }

  const sharedYear = hazardCfg["Hazard 1"]?.year || hazardCfg["Hazard 2"]?.year || null;
  const selectedEntry = sharedYear ? yearData[sharedYear] : null;

  function toggleHazard(h) {
    if (readOnly) return;
    if (!enabledInCurrent.includes(h)) return;
    setHazardCfg(prev => {
      const next = { ...prev };
      if (next[h]) next[h] = { ...next[h], enabled: !prev[h]?.enabled };
      const enabled = BUILTINS.filter(k => next[k]?.enabled && enabledInCurrent.includes(k));
      const w = initEqual(enabled);
      BUILTINS.forEach(k => { if (next[k]) next[k] = { ...next[k], weight: enabled.includes(k) ? w[k] : 0 }; });
      return next;
    });
  }

  function changeWeight(h, val) {
    if (disableWeights || readOnly) return;
    setHazardCfg(prev => {
      const enabled = BUILTINS.filter(k => prev[k]?.enabled && enabledInCurrent.includes(k));
      const cur = {};
      enabled.forEach(k => { cur[k] = prev[k].weight; });
      const bal = autoBalance(cur, h, val);
      const next = { ...prev };
      enabled.forEach(k => { next[k] = { ...next[k], weight: bal[k] }; });
      return next;
    });
  }

  const enabledCount = BUILTINS.filter(h => hazardCfg[h]?.enabled && enabledInCurrent.includes(h)).length;
  const c = COLORS.hazard;

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>Hazard</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>
          {enabledCount} selected · 10-year band averages
          {enabledInCurrent.length < BUILTINS.length && ` (${enabledInCurrent.length} available from Current tab)`}
          {readOnly && " · read-only"}
        </span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>
        {loading && <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 10px", textAlign: "center" }}>Loading hazard data…</p>}
        {!loading && allYears.length > 0 && (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 9, background: c.bg, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: selectedEntry ? 8 : 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.header, minWidth: 32 }}>Year</span>
              <select
                value={sharedYear || ""}
                onChange={e => selectYear(parseInt(e.target.value))}
                style={{ flex: 1, fontSize: 13, fontWeight: 600, border: `1px solid ${c.border}`, borderRadius: 7, padding: "5px 10px", background: C.surface, color: c.text, cursor: "pointer" }}
              >
                {allYears.map(y => (<option key={y} value={y}>{y}</option>))}
              </select>
            </div>
            {selectedEntry && (
              <div style={{ fontSize: 11, color: c.text, background: C.surface, borderRadius: 7, padding: "5px 9px", border: `1px solid ${c.border}` }}>
                Year <b>{sharedYear}</b> falls in the <b>{selectedEntry.bandLabel}</b> band →
                using the 10-year average for that period for both hazards.
              </div>
            )}
          </div>
        )}
        {BUILTINS.map(h => {
          const cfg = hazardCfg[h] || { enabled: false, weight: 0, value: 0, year: null };
          const isAvailable = enabledInCurrent.includes(h);
          const isEnabled = cfg.enabled && isAvailable;
          return (
            <div key={h} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.borderLight}`, opacity: isAvailable ? (isEnabled ? 1 : 0.45) : 0.25, transition: "opacity 0.2s", pointerEvents: isAvailable ? "auto" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div onClick={() => isAvailable && toggleHazard(h)} style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: readOnly ? "default" : (isAvailable ? "pointer" : "default"), border: `2px solid ${isEnabled ? c.accent : "#CBD5E1"}`, background: isEnabled ? c.accent : "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", boxShadow: isEnabled ? `0 0 0 3px ${c.accent}22` : "none", opacity: readOnly ? 0.7 : 1 }}>
                  {isEnabled && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span style={{ fontSize: 13, fontWeight: isEnabled ? 700 : 400, color: isEnabled ? c.text : isAvailable ? "#94A3B8" : "#CBD5E1", flex: 1, userSelect: "none" }}>
                  {h === "Hazard 1" ? "Hazard 1 — Max Temperature (TXX)" : "Hazard 2 — Max 1-Day Precipitation (RX1Day)"}
                  {!isAvailable && <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}>(not selected in Current tab)</span>}
                  {readOnly && isAvailable && <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}>(read-only)</span>}
                </span>
                {isEnabled && typeof cfg.value === "number" && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.accent, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: "2px 8px" }}>{cfg.value.toFixed(3)}</span>
                )}
              </div>
              {isEnabled && (
                <div style={{ paddingLeft: 26, marginTop: 8, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, color: C.textMuted }}>
                    Current baseline (2015–2025 avg): <b style={{ color: c.accent }}>{(currentHazardCfg?.[h]?.value ?? 0).toFixed(3)}</b>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Weight</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c.accent }}>{cfg.weight.toFixed(2)}</span>
                    </div>
                    <WSlider value={cfg.weight} onChange={v => changeWeight(h, v)} color={c.accent} disabled={enabledCount < 2 || disableWeights || readOnly} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {enabledCount === 0 && !loading && (
          <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0", textAlign: "center" }}>
            No hazards enabled. Enable them in the <b>Current Risk</b> tab first.
          </p>
        )}
      </div>
    </div>
  );
}

// ── IndicatorSection (Future tab) ─────────────────────────────────────────────

function IndicatorSection({ type, indicators, cfg, setCfg, disableWeights = false }) {
  const c = COLORS[type];
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const enabledKeys = indicators.filter(i => cfg[i.name]?.enabled).map(i => i.name);

  function toggle(name) {
    setCfg(prev => {
      const next = { ...prev, [name]: { ...prev[name], enabled: !prev[name]?.enabled } };
      const nowEnabled = indicators.filter(i => next[i.name]?.enabled).map(i => i.name);
      const w = initEqual(nowEnabled);
      nowEnabled.forEach(k => { next[k] = { ...next[k], weight: w[k] }; });
      indicators.filter(i => !next[i.name]?.enabled).forEach(i => { next[i.name] = { ...next[i.name], weight: 0 }; });
      return next;
    });
  }

  function changeWeight(name, val) {
    if (disableWeights) return;
    setCfg(prev => {
      const cur = {}; enabledKeys.forEach(k => { cur[k] = prev[k].weight; });
      const bal = autoBalance(cur, name, val);
      const next = { ...prev };
      enabledKeys.forEach(k => { next[k] = { ...next[k], weight: bal[k] }; });
      return next;
    });
  }

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>{enabledKeys.length} selected</span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>
        {indicators.map(ind => {
          const indCfg = cfg[ind.name] || { enabled: false, weight: 0, value: 0 };
          return (
            <div key={ind.name} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: indCfg.enabled ? 7 : 0 }}>
                <div onClick={() => toggle(ind.name)} style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: `2px solid ${indCfg.enabled ? c.accent : C.border}`, background: indCfg.enabled ? c.accent : C.surface, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                  {indCfg.enabled && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span style={{ fontSize: 13, fontWeight: indCfg.enabled ? 700 : 400, color: indCfg.enabled ? c.text : C.textSecondary, flex: 1 }}>{ind.name}</span>
                {indCfg.enabled && <span style={{ fontSize: 11, fontWeight: 700, color: c.accent, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: "2px 7px" }}>{typeof indCfg.value === "number" ? indCfg.value.toFixed(3) : "—"}</span>}
              </div>
              {indCfg.enabled && (
                <div style={{ paddingLeft: 25 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Inner weight</span>
                  <WSlider value={indCfg.weight} onChange={v => changeWeight(ind.name, v)} color={c.accent} disabled={enabledKeys.length < 2 || disableWeights} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ResultPanel ───────────────────────────────────────────────────────────────

function ResultPanel({ result, currentRiskIndex, calculating, error, onCalculate, btnLabel = "Calculate →", children }) {
  const level  = result ? levelFromScore(result.riskScore) : null;
  const lstyle = level ? LEVEL_STYLE[level] : null;
  const delta  = result && currentRiskIndex != null ? result.riskScore - currentRiskIndex : null;
  return (
    <div style={{ position: "sticky", top: 180 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Projected Risk</h3>
      {delta !== null && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12, padding: "9px 14px", borderRadius: 10, background: delta > 0.001 ? "#FDF2F2" : delta < -0.001 ? "#F0F7F3" : C.surfaceAlt, border: `1px solid ${delta > 0.001 ? "#E8C0C0" : delta < -0.001 ? "#A8D4B8" : C.border}` }}>
          <span style={{ fontSize: 12, color: C.textSecondary }}>Baseline: <b>{currentRiskIndex?.toFixed(3)}</b></span>
          <span style={{ fontSize: 14, color: C.border }}>→</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: delta > 0.001 ? "#8B2C2C" : delta < -0.001 ? "#1E5535" : C.textMuted }}>
            {delta > 0.001 ? "▲" : delta < -0.001 ? "▼" : "="} {Math.abs(delta).toFixed(3)} {delta > 0.001 ? "increase" : delta < -0.001 ? "decrease" : "no change"}
          </span>
        </div>
      )}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${lstyle ? lstyle.bg : C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "28px 20px 20px", background: lstyle ? lstyle.bg : C.surfaceAlt, display: "flex", flexDirection: "column", alignItems: "center", minHeight: 150, transition: "background 0.4s" }}>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, marginBottom: 8, color: lstyle ? lstyle.color : C.border }}>{result ? result.riskScore.toFixed(3) : "—"}</div>
          {result && <div style={{ fontSize: 10, fontWeight: 600, color: lstyle ? lstyle.color : C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, opacity: 0.7 }}>Risk Index (0–1)</div>}
          <div style={{ padding: "5px 18px", borderRadius: 99, background: lstyle ? lstyle.color : C.border, color: "white", fontWeight: 700, fontSize: 13, transition: "all 0.4s" }}>{level || "Not calculated"}</div>
          {result && (
            <div style={{ width: "100%", maxWidth: 180, marginTop: 16 }}>
              <div style={{ height: 5, borderRadius: 99, background: "#E2E8F0", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${result.riskScore * 100}%`, background: `linear-gradient(90deg,${C.vulnerability.accent},${C.hazard.accent})`, borderRadius: 99, transition: "width 0.6s ease" }} />
              </div>
            </div>
          )}
        </div>
        {result && (
          <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "13px 16px", background: C.surfaceAlt }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 9px" }}>Component Contributions</p>
            {[["hazard","Hazard"],["exposure","Exposure"],["vulnerability","Vulnerability"]].map(([key, lbl]) => {
              const cc = COLORS[key]; const comp = result.breakdown[key];
              if (!comp) return null;
              return (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 99, background: cc.dot }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: cc.text }}>{lbl}</span>
                      <span style={{ fontSize: 10, color: C.textMuted }}>× {comp.outerWeight.toFixed(2)}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cc.accent }}>{comp.contribution.toFixed(4)}</span>
                  </div>
                  {comp.items.map((item, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", paddingLeft: 11, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: C.textSecondary }}>{item.name}{item.year ? ` (${item.year})` : ""}{item.multiplier && item.multiplier !== 1 ? ` ×${item.multiplier.toFixed(2)}` : ""}</span>
                      <span style={{ fontSize: 11, color: C.textPrimary, fontWeight: 600 }}>{item.value.toFixed(3)} × {item.weight.toFixed(2)} = {(item.value * item.weight).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>Formula</p>
              <p style={{ fontSize: 11, color: C.textSecondary, margin: 0, lineHeight: 1.7, fontFamily: "monospace" }}>
                Risk = (H×{result.breakdown.hazard?.outerWeight.toFixed(2)}) + (E×{result.breakdown.exposure?.outerWeight.toFixed(2)}) + (V×{result.breakdown.vulnerability?.outerWeight.toFixed(2)})<br />
                &nbsp;&nbsp;&nbsp;&nbsp; = {result.breakdown.hazard?.contribution.toFixed(4)} + {result.breakdown.exposure?.contribution.toFixed(4)} + {result.breakdown.vulnerability?.contribution.toFixed(4)}<br />
                &nbsp;&nbsp;&nbsp;&nbsp; = <b>{result.riskScore.toFixed(4)}</b>
              </p>
            </div>
          </div>
        )}
        {error && <div style={{ margin: "0 14px 10px", padding: "9px 12px", borderRadius: 8, background: "#FDF2F2", border: `1px solid #E8C0C0`, fontSize: 12, color: "#8B2C2C", fontWeight: 500 }}>⚠ {error}</div>}
        <div style={{ padding: "12px 16px 16px" }}>
          <button onClick={onCalculate} disabled={calculating} style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: calculating ? C.textMuted : C.navy, color: "white", fontSize: 13, fontWeight: 700, cursor: calculating ? "not-allowed" : "pointer", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {calculating ? "Calculating…" : btnLabel}
          </button>
        </div>
        {children && <div style={{ padding: "0px 16px 16px" }}>{children}</div>}
      </div>
    </div>
  );
}

// ── FutureIndicatorSection ────────────────────────────────────────────────────
// Replaces ReadOnlyIndicatorList — shows base values from Current tab with an
// editable growth/reduction multiplier slider. Selection & weights are read-only.

function FutureIndicatorSection({ type, indicators, cfg, setCfg }) {
  const c = COLORS[type];
  const label = type.charAt(0).toUpperCase() + type.slice(1);

  function changeMult(name, val) {
    setCfg(prev => ({ ...prev, [name]: { ...prev[name], multiplier: val } }));
  }

  if (!indicators.length) return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
      </div>
      <div style={{ padding: "14px 13px", background: C.surface, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>No indicators selected — go to <b>Current Risk</b> tab to select indicators.</span>
      </div>
    </div>
  );

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>{indicators.length} selected · adjust growth multiplier</span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>

        {/* Legend */}
        <div style={{ marginBottom: 12, padding: "7px 10px", borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, fontSize: 11, color: c.text }}>
          <span style={{ fontWeight: 600 }}>Multiplier guide: </span>
          <span style={{ color: "#8B2C2C", fontWeight: 700 }}>below 1× = decrease </span>
          <span style={{ color: C.textMuted }}>· </span>
          <span style={{ fontWeight: 700, color: C.textMuted }}>1× = no change </span>
          <span style={{ color: C.textMuted }}>· </span>
          <span style={{ color: c.accent, fontWeight: 700 }}>above 1× = increase</span>
        </div>

        {indicators.map(ind => {
          const mult = cfg[ind.name]?.multiplier ?? 1;
          const effectiveValue = Math.min(1, Math.max(0, ind.value * mult));
          const changed = Math.abs(mult - 1) > 0.001;

          return (
            <div key={ind.name} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.borderLight}` }}>

              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {/* Filled read-only checkbox */}
                <div style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, border: `2px solid ${c.accent}`, background: c.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.text, flex: 1 }}>{ind.name}</span>

                {/* base → effective value */}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>base</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.textSecondary, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px" }}>{ind.value.toFixed(3)}</span>
                  <span style={{ fontSize: 12, color: C.textMuted }}>→</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: changed ? (mult > 1 ? c.accent : "#8B2C2C") : C.textMuted, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 5, padding: "2px 7px" }}>{effectiveValue.toFixed(3)}</span>
                </div>

                {/* Weight badge (read-only) */}
                <span style={{ fontSize: 11, color: C.textMuted, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px" }}>
                  w: {ind.weight.toFixed(2)}
                </span>
              </div>

              {/* Multiplier slider */}
              <div style={{ paddingLeft: 25 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Growth / Reduction multiplier</span>
                  {changed && (
                    <button
                      onClick={() => changeMult(ind.name, 1)}
                      style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, cursor: "pointer" }}
                    >
                      Reset 1×
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
                  <span>← decrease (below 1×)</span>
                  <span>increase (above 1×) →</span>
                </div>
                <MultSlider value={mult} onChange={v => changeMult(ind.name, v)} color={c.accent} allowDecrease={true} />

                {/* Live contribution preview */}
                <div style={{ marginTop: 5, fontSize: 11, color: C.textMuted }}>
                  Contribution: <b style={{ color: c.accent }}>{effectiveValue.toFixed(3)}</b> × <b>{ind.weight.toFixed(2)}</b> = <b style={{ color: c.text }}>{(effectiveValue * ind.weight).toFixed(4)}</b>
                </div>
              </div>
            </div>
          );
        })}

        <p style={{ margin: "4px 0 0", fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>
          Selection and weights are fixed by the <b>Current Risk</b> tab. Only the growth multiplier is adjustable here.
        </p>
      </div>
    </div>
  );
}

// ── FutureRiskTab ─────────────────────────────────────────────────────────────

function FutureRiskTab({
  province, currentRiskIndex, currentData, currentOuter,
  currentHazardCfg, currentExpCfg, currentVulnCfg,
  hazardCfg, setHazardCfg,
  expCfg, setExpCfg,
  vulnCfg, setVulnCfg,
  result, setResult,
  isDirty,
}) {
  const [calculating, setCalc]    = useState(false);
  const [calcError, setCalcError] = useState("");

  // Base indicators from current tab (enabled only)
  const expIndicators  = Object.entries(currentExpCfg  || {}).filter(([, cfg]) => cfg.enabled !== false).map(([name, cfg]) => ({ name, value: cfg.value ?? 0, weight: cfg.weight ?? 0 }));
  const vulnIndicators = Object.entries(currentVulnCfg || {}).filter(([, cfg]) => cfg.enabled !== false).map(([name, cfg]) => ({ name, value: cfg.value ?? 0, weight: cfg.weight ?? 0 }));

  // Apply growth multipliers from futureExpCfg / futureVulnCfg
  function applyMultiplier(indicators, cfg) {
    return indicators.map(i => ({
      ...i,
      value: Math.min(1, Math.max(0, i.value * (cfg[i.name]?.multiplier ?? 1))),
      multiplier: cfg[i.name]?.multiplier ?? 1,
    }));
  }

  function validate() {
    const issues = [];
    const eh = Object.keys(hazardCfg).filter(h => hazardCfg[h]?.enabled);
    if (!eh.length) issues.push("Select at least one hazard indicator");
    const ot = currentOuter.hazard + currentOuter.exposure + currentOuter.vulnerability;
    if (Math.abs(ot - 1.0) > 0.02) issues.push(`Outer weights must sum to 1.00 (currently ${ot.toFixed(2)})`);
    if (!expIndicators.length)  issues.push("Select at least one exposure indicator in the Current Risk tab");
    if (!vulnIndicators.length) issues.push("Select at least one vulnerability indicator in the Current Risk tab");
    return issues;
  }

  async function calculate() {
    const issues = validate();
    if (issues.length) { setCalcError(issues.join(" · ")); return; }
    setCalcError(""); setCalc(true);
    try {
      const selectedHazards = Object.keys(hazardCfg).filter(h => hazardCfg[h]?.enabled);
      const effectiveExp  = applyMultiplier(expIndicators,  expCfg);
      const effectiveVuln = applyMultiplier(vulnIndicators, vulnCfg);

      const body = {
        province,
        useBaselineWeights: true,
        outerWeights: { ...currentOuter },
        hazard: selectedHazards.map(h => {
          const cfg = hazardCfg[h];
          if (h === "Hazard 1" || h === "Hazard 2") {
            return { name: h, year: cfg.year, weight: currentHazardCfg[h]?.weight ?? cfg.weight };
          }
          return { name: h, value: currentHazardCfg[h]?.value ?? cfg.value ?? 0, weight: currentHazardCfg[h]?.weight ?? cfg.weight };
        }),
        exposure: effectiveExp.map(i => ({ name: i.name, value: i.value, weight: i.weight, multiplier: i.multiplier })),
        vulnerability: effectiveVuln.map(i => ({ name: i.name, value: i.value, weight: i.weight, multiplier: i.multiplier })),
      };
      const res = await fetch(`${API}/future-risk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Request failed"); }
      setResult(await res.json());
    } catch (e) { setCalcError("Calculation failed: " + e.message); }
    setCalc(false);
  }

  if (!currentData) return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: C.hazard.text }}>⚠ Load Current Risk first</p>
    </div>
  );

  const issues = validate();
  return (
    <div>
      {isDirty && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: C.recalcBg, border: `1.5px solid ${C.recalcBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.recalcText }}>
            Current Risk baseline has pending changes. Go to the <b>Current Risk</b> tab and click <b>Recalculate</b> before running Future Risk.
          </span>
        </div>
      )}
      {issues.length > 0 && (
        <div style={{ padding: "11px 14px", borderRadius: 10, background: "#FDF6EE", border: `1px solid ${C.hazard.border}`, marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.hazard.text, margin: "0 0 4px" }}>⚠ Fix before calculating</p>
          {issues.map((iss, i) => <p key={i} style={{ fontSize: 12, color: C.hazard.text, margin: "2px 0 0", opacity: 0.8 }}>· {iss}</p>)}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20, alignItems: "start" }}>
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Configure Indicators</h3>
          <HazardSection hazardCfg={hazardCfg} setHazardCfg={setHazardCfg} currentHazardCfg={currentHazardCfg} disableWeights={true} readOnly={true} />
          {/* Exposure with multipliers */}
          <FutureIndicatorSection
            type="exposure"
            indicators={expIndicators}
            cfg={expCfg}
            setCfg={setExpCfg}
          />
          {/* Vulnerability with multipliers */}
          <FutureIndicatorSection
            type="vulnerability"
            indicators={vulnIndicators}
            cfg={vulnCfg}
            setCfg={setVulnCfg}
          />
        </div>
        <ResultPanel result={result} currentRiskIndex={currentRiskIndex} calculating={calculating} error={calcError} onCalculate={calculate} btnLabel="Calculate Future Risk →" />
      </div>
    </div>
  );
}

// ── AdaptIndicatorSection ─────────────────────────────────────────────────────

function AdaptIndicatorSection({ type, cfg, setCfg, allowDecrease = true }) {
  const c = COLORS[type];
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const enabledKeys = Object.keys(cfg).filter(k => cfg[k]?.enabled);

  function changeMult(name, val) {
    setCfg(prev => ({ ...prev, [name]: { ...prev[name], multiplier: val } }));
  }

  if (!enabledKeys.length) {
    return (
      <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ background: c.bg, padding: "9px 13px" }}>
          <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
        </div>
        <div style={{ padding: "14px 13px", background: C.surface, textAlign: "center" }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>No indicators selected — go to <b>Current Risk</b> tab to select indicators.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>{enabledKeys.length} indicators · adjust growth multiplier</span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>
        {/* Legend */}
        <div style={{ marginBottom: 12, padding: "7px 10px", borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, fontSize: 11, color: c.text }}>
          <span style={{ fontWeight: 600 }}>Multiplier guide: </span>
          <span style={{ color: "#8B2C2C", fontWeight: 700 }}>below 1× = decrease </span>
          <span style={{ color: C.textMuted }}>· </span>
          <span style={{ fontWeight: 700, color: C.textMuted }}>1× = no change </span>
          <span style={{ color: C.textMuted }}>· </span>
          <span style={{ color: c.accent, fontWeight: 700 }}>above 1× = increase</span>
        </div>

        {enabledKeys.map(name => {
          const ind = cfg[name];
          if (!ind) return null;
          const baseValue = ind.baseValue ?? 0;
          const effectiveValue = Math.min(1, Math.max(0, baseValue * (ind.multiplier ?? 1)));
          const mult = ind.multiplier ?? 1;
          const changed = Math.abs(mult - 1) > 0.001;

          return (
            <div key={name} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.borderLight}` }}>
              {/* Indicator header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {/* Filled checkbox (read-only) */}
                <div style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, border: `2px solid ${c.accent}`, background: c.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.text, flex: 1 }}>{name}</span>
                {/* Base → effective value */}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>base</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.textSecondary, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px" }}>{baseValue.toFixed(3)}</span>
                  <span style={{ fontSize: 12, color: C.textMuted }}>→</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: changed ? (mult > 1 ? c.accent : "#8B2C2C") : C.textMuted, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 5, padding: "2px 7px" }}>{effectiveValue.toFixed(3)}</span>
                </div>
                {/* Weight badge (read-only) */}
                <span style={{ fontSize: 11, color: C.textMuted, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px" }}>
                  w: {(ind.weight ?? 0).toFixed(2)}
                </span>
              </div>

              {/* Multiplier slider */}
              <div style={{ paddingLeft: 25 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Growth / Reduction multiplier</span>
                  {changed && (
                    <button
                      onClick={() => changeMult(name, 1)}
                      style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, cursor: "pointer" }}
                    >
                      Reset 1×
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
                  <span>← decrease (below 1×)</span>
                  <span>increase (above 1×) →</span>
                </div>
                <MultSlider value={mult} onChange={v => changeMult(name, v)} color={c.accent} allowDecrease={true} />
                {/* Contribution preview */}
                <div style={{ marginTop: 5, fontSize: 11, color: C.textMuted }}>
                  Contribution: <b style={{ color: c.accent }}>{effectiveValue.toFixed(3)}</b> × <b>{(ind.weight ?? 0).toFixed(2)}</b> = <b style={{ color: c.text }}>{(effectiveValue * (ind.weight ?? 0)).toFixed(4)}</b>
                </div>
              </div>
            </div>
          );
        })}

        <p style={{ margin: "4px 0 0", fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>
          Selection and weights are fixed by the <b>Current Risk</b> tab. Only the growth multiplier is adjustable here.
        </p>
      </div>
    </div>
  );
}

// ── AdaptHazardSection ────────────────────────────────────────────────────────

function AdaptHazardSection({ hazardCfg, setHazardCfg, currentHazardCfg, startYear, tenure, readOnly = false }) {
  const HAZARDS = ["Hazard 1", "Hazard 2"];
  const [yearOpts, setYearOpts] = useState({ "Hazard 1": [], "Hazard 2": [] });
  const [loading, setLoading]   = useState({ "Hazard 1": false, "Hazard 2": false });

  const enabledInCurrent = HAZARDS.filter(h => currentHazardCfg?.[h]?.enabled !== false);

  useEffect(() => {
    HAZARDS.forEach(async h => {
      if (hazardCfg[h]?.enabled && yearOpts[h].length === 0 && !loading[h]) {
        setLoading(p => ({ ...p, [h]: true }));
        try {
          const res = await fetch(`${API}/future-risk/years?hazard=${h}`);
          const data = await res.json();
          setYearOpts(p => ({ ...p, [h]: data.years || [] }));
        } catch {}
        setLoading(p => ({ ...p, [h]: false }));
      }
    });
  }, [hazardCfg["Hazard 1"]?.enabled, hazardCfg["Hazard 2"]?.enabled]);

  function toggle(h) {
    if (readOnly) return;
    if (!enabledInCurrent.includes(h)) return;
    setHazardCfg(prev => {
      const next = { ...prev, [h]: { ...prev[h], enabled: !prev[h].enabled } };
      const enabled = HAZARDS.filter(k => next[k].enabled && enabledInCurrent.includes(k));
      const w = initEqual(enabled);
      HAZARDS.forEach(k => { next[k] = { ...next[k], weight: enabled.includes(k) ? w[k] : 0 }; });
      return next;
    });
  }

  function changeWeight(h, val) {
    if (readOnly) return;
    setHazardCfg(prev => {
      const enabled = HAZARDS.filter(k => prev[k].enabled && enabledInCurrent.includes(k));
      const cur = {}; enabled.forEach(k => { cur[k] = prev[k].weight; });
      const bal = autoBalance(cur, h, val);
      const next = { ...prev };
      enabled.forEach(k => { next[k] = { ...next[k], weight: bal[k] }; });
      return next;
    });
  }

  const enabledCount = HAZARDS.filter(h => hazardCfg[h]?.enabled && enabledInCurrent.includes(h)).length;
  const endYear = startYear && tenure ? startYear + tenure : null;
  const c = COLORS.hazard;

  if (enabledInCurrent.length === 0) {
    return (
      <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}` }}>
          <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>Hazard</span>
        </div>
        <div style={{ padding: "16px 13px", background: C.surface, textAlign: "center" }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>No hazards selected — go to <b>Current Risk</b> tab to select hazard indicators.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>Hazard</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>
          {enabledCount} selected · {startYear && endYear ? `Avg ${startYear}–${endYear}` : "Set project years above"}
          {enabledInCurrent.length < HAZARDS.length && ` (${enabledInCurrent.length} available from Current tab)`}
        </span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>
        {(!startYear || !tenure) && (
          <p style={{ fontSize: 12, color: C.textMuted, textAlign: "center", margin: "0 0 10px" }}>Set Start Year and Tenure above first</p>
        )}
        {HAZARDS.map(h => {
          const cfg = hazardCfg[h];
          const isAvailable = enabledInCurrent.includes(h);
          const isEnabled = cfg?.enabled && isAvailable;
          const validYears = yearOpts[h].filter(y => y >= startYear && y <= endYear);
          return (
            <div key={h} style={{ marginBottom: 12, opacity: isAvailable ? (isEnabled ? 1 : 0.45) : 0.25, transition: "opacity 0.2s", pointerEvents: isAvailable ? "auto" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isEnabled ? 9 : 0 }}>
                <div onClick={isAvailable ? () => toggle(h) : undefined} style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, cursor: readOnly ? "default" : (isAvailable ? "pointer" : "default"), border: `2px solid ${isEnabled ? c.accent : C.border}`, background: isEnabled ? c.accent : C.surface, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", opacity: readOnly ? 0.7 : 1 }}>
                  {isEnabled && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span style={{ fontSize: 13, fontWeight: isEnabled ? 700 : 400, color: isEnabled ? c.text : isAvailable ? C.textSecondary : "#CBD5E1" }}>
                  {h === "Hazard 1" ? "Hazard 1 (Max Temperature)" : "Hazard 2 (Max 1-Day Precipitation)"}
                  {!isAvailable && <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}>(not selected in Current tab)</span>}
                  {readOnly && isAvailable && <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}>(read-only)</span>}
                </span>
              </div>
              {isEnabled && (
                <div style={{ paddingLeft: 25, display: "grid", gap: 7 }}>
                  {startYear && endYear && (
                    <div style={{ padding: "6px 10px", borderRadius: 7, background: c.bg, border: `1px solid ${c.border}`, fontSize: 12, color: c.text }}>
                      {loading[h] ? "Loading years…" : validYears.length > 0
                        ? `Averaging ${validYears.length} years: ${validYears[0]}–${validYears[validYears.length-1]}`
                        : "⚠ No data in this year range"}
                    </div>
                  )}
                  {!readOnly && (
                    <div>
                      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Inner weight</span>
                      <WSlider value={cfg.weight} onChange={v => changeWeight(h, v)} color={c.accent} disabled={enabledCount < 2} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {enabledCount === 0 && (
          <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0", textAlign: "center" }}>
            No hazards enabled. Enable them in the <b>Current Risk</b> tab first.
          </p>
        )}
      </div>
    </div>
  );
}

// ── ProjectCard & ProjectCompare ──────────────────────────────────────────────

function ProjectCard({ project, baselineRiskIndex }) {
  const level  = levelFromScore(project.riskScore);
  const lstyle = LEVEL_STYLE[level];
  const delta  = baselineRiskIndex != null ? project.riskScore - baselineRiskIndex : null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: C.navy, padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{project.name}</span>
          <span style={{ fontSize: 11, color: "#8AAFD0", marginLeft: 10 }}>{project.province} · {project.startYear}–{project.endYear}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {delta !== null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: delta > 0.001 ? "#E8A0A0" : delta < -0.001 ? "#88C8A0" : "#8AAFD0" }}>
              {delta > 0.001 ? "▲" : delta < -0.001 ? "▼" : "="} {Math.abs(delta).toFixed(3)}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: lstyle.color, background: lstyle.bg, padding: "3px 10px", borderRadius: 99 }}>{level}</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: "white" }}>{project.riskScore.toFixed(3)}</span>
        </div>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[["hazard","Hazard"],["exposure","Exposure"],["vulnerability","Vulnerability"]].map(([key, lbl]) => {
          const cc = COLORS[key]; const comp = project.breakdown[key];
          if (!comp) return null;
          return (
            <div key={key} style={{ flex: 1, minWidth: 140, background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: 9, padding: "8px 11px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: cc.header, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{lbl} ({(project.savedSettings.outerWeights[key] * 100).toFixed(0)}%)</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: cc.accent, marginBottom: 4 }}>{comp.contribution.toFixed(4)}</div>
              <div style={{ fontSize: 10, color: C.textSecondary, borderTop: `1px solid ${cc.border}`, paddingTop: 4 }}>
                {project.savedSettings[key === "hazard" ? "hazardIndicators" : key === "exposure" ? "exposureIndicators" : "vulnerabilityIndicators"].map((ind, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>• {ind.name}{ind.multiplier && ind.multiplier !== 1 ? ` ×${ind.multiplier.toFixed(2)}` : ""}</span>
                    <span>W: {ind.weight.toFixed(2)} | V: {ind.value.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectCompare({ projects, currentRiskIndex, baselineLabel = "Current Baseline" }) {
  if (!projects.length) return null;
  const all = currentRiskIndex != null
    ? [{ name: baselineLabel, riskScore: currentRiskIndex }, ...projects]
    : projects;
  const max = Math.max(...all.map(p => p.riskScore));
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Project Risk Comparison</p>
      {all.map((p, i) => {
        const level  = levelFromScore(p.riskScore);
        const lstyle = LEVEL_STYLE[level];
        const isCurrent = i === 0 && currentRiskIndex != null;
        return (
          <div key={i} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: isCurrent ? 500 : 700, color: isCurrent ? C.textSecondary : C.textPrimary }}>{p.name}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: lstyle.color }}>{p.riskScore.toFixed(3)}</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(p.riskScore / (max || 1)) * 100}%`, background: isCurrent ? C.textMuted : lstyle.color, borderRadius: 99, transition: "width 0.5s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AdaptationTab ─────────────────────────────────────────────────────────────

function AdaptationTab({
  province, futureRiskIndex, currentRiskIndex,
  currentData, currentOuter,
  currentHazardCfg, currentExpCfg, currentVulnCfg,
  startYear, setStartYear, tenure, setTenure,
  hazardCfg, setHazardCfg,
  expCfg, setExpCfg,
  vulnCfg, setVulnCfg,
  result, setResult,
  projects, setProjects,
  isDirty,
}) {
  const [projName,  setProjName]  = useState("");
  const [calculating, setCalc] = useState(false);
  const [calcError, setErr]   = useState("");
  const [loadMenuOpen, setLoadMenuOpen] = useState(false);

  const baselineRiskIndex = futureRiskIndex ?? currentRiskIndex;

  useEffect(() => {
    setExpCfg(prev => syncAdaptCfgFromCurrent(currentExpCfg, prev));
  }, [JSON.stringify(
    Object.entries(currentExpCfg || {})
      .filter(([, v]) => v.enabled !== false)
      .map(([k, v]) => ({ k, value: v.value, weight: v.weight }))
  )]);

  useEffect(() => {
    setVulnCfg(prev => syncAdaptCfgFromCurrent(currentVulnCfg, prev));
  }, [JSON.stringify(
    Object.entries(currentVulnCfg || {})
      .filter(([, v]) => v.enabled !== false)
      .map(([k, v]) => ({ k, value: v.value, weight: v.weight }))
  )]);

  function loadProjectConfig(p) {
    setStartYear(String(p.startYear));
    setTenure(String(p.tenure));
    const newHazardCfg = { ...hazardCfg };
    p.savedSettings.hazardIndicators.forEach(ind => {
      newHazardCfg[ind.name] = { ...(newHazardCfg[ind.name] || { value: ind.value ?? 0, year: (ind.name === "Hazard 1" || ind.name === "Hazard 2") ? 2025 : null, isCustom: !(ind.name === "Hazard 1" || ind.name === "Hazard 2") }), enabled: true, weight: ind.weight };
    });
    setHazardCfg(newHazardCfg);
    setExpCfg(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], multiplier: 1 }; });
      p.savedSettings.exposureIndicators.forEach(ind => {
        if (next[ind.name]) next[ind.name] = { ...next[ind.name], multiplier: ind.multiplier ?? 1 };
      });
      return next;
    });
    setVulnCfg(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], multiplier: 1 }; });
      p.savedSettings.vulnerabilityIndicators.forEach(ind => {
        if (next[ind.name]) next[ind.name] = { ...next[ind.name], multiplier: ind.multiplier ?? 1 };
      });
      return next;
    });
    setResult(null);
    setLoadMenuOpen(false);
  }

  const sy = parseInt(startYear) || null;
  const tn = parseInt(tenure)    || null;
  const endYear = sy && tn ? sy + tn : null;

  function validate() {
    const issues = [];
    if (!sy || sy < 2026 || sy > 2099) issues.push("Enter a valid Start Year (2026–2099)");
    if (!tn || tn < 1 || tn > 50)     issues.push("Enter a valid Tenure (1–50 years)");
    if (endYear && endYear > 2099)     issues.push("Start Year + Tenure exceeds 2099");
    const eh = Object.keys(hazardCfg).filter(h => hazardCfg[h]?.enabled);
    if (!eh.length) issues.push("Select at least one hazard indicator");
    const ot = currentOuter.hazard + currentOuter.exposure + currentOuter.vulnerability;
    if (Math.abs(ot - 1.0) > 0.02) issues.push(`Outer weights must sum to 1.00 (currently ${ot.toFixed(2)})`);
    const enabledExp  = Object.keys(expCfg  || {}).filter(k => expCfg[k]?.enabled);
    const enabledVuln = Object.keys(vulnCfg || {}).filter(k => vulnCfg[k]?.enabled);
    if (!enabledExp.length)  issues.push("Select at least one exposure indicator in the Current Risk tab");
    if (!enabledVuln.length) issues.push("Select at least one vulnerability indicator in the Current Risk tab");
    return issues;
  }

  async function calculate() {
    const issues = validate();
    if (issues.length) { setErr(issues.join(" · ")); return; }
    setErr(""); setCalc(true);
    try {
      const enabledH    = Object.keys(hazardCfg).filter(h => hazardCfg[h]?.enabled);
      const enabledExp  = Object.keys(expCfg  || {}).filter(k => expCfg[k]?.enabled);
      const enabledVuln = Object.keys(vulnCfg || {}).filter(k => vulnCfg[k]?.enabled);

      const body = {
        province,
        useBaselineWeights: true,
        outerWeights: { ...currentOuter },
        startYear: sy,
        endYear,
        hazard: enabledH.map(h => {
          if (h === "Hazard 1" || h === "Hazard 2") {
            return { name: h, year: hazardCfg[h].year, weight: currentHazardCfg[h]?.weight ?? hazardCfg[h].weight };
          }
          return { name: h, value: currentHazardCfg[h]?.value ?? hazardCfg[h].value ?? 0, weight: currentHazardCfg[h]?.weight ?? hazardCfg[h].weight };
        }),
        exposure: enabledExp.map(k => ({
          name: k,
          value: Math.min(1, Math.max(0, (expCfg[k]?.baseValue ?? 0) * (expCfg[k]?.multiplier ?? 1))),
          weight: expCfg[k]?.weight ?? 0,
          multiplier: expCfg[k]?.multiplier ?? 1,
        })),
        vulnerability: enabledVuln.map(k => ({
          name: k,
          value: Math.min(1, Math.max(0, (vulnCfg[k]?.baseValue ?? 0) * (vulnCfg[k]?.multiplier ?? 1))),
          weight: vulnCfg[k]?.weight ?? 0,
          multiplier: vulnCfg[k]?.multiplier ?? 1,
        })),
      };

      const res = await fetch(`${API}/adaptation-risk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Request failed"); }
      setResult(await res.json());
    } catch (e) { setErr("Calculation failed: " + e.message); }
    setCalc(false);
  }

  async function saveProject() {
    if (!result) return;
    const name = projName.trim() || `Project ${projects.length + 1}`;
    const enabledExp  = Object.keys(expCfg  || {}).filter(k => expCfg[k]?.enabled);
    const enabledVuln = Object.keys(vulnCfg || {}).filter(k => vulnCfg[k]?.enabled);
    const hazardIndicators = Object.keys(hazardCfg).filter(k => hazardCfg[k]?.enabled).map(k => ({ name: k, weight: hazardCfg[k].weight, value: result.breakdown.hazard.items.find(i => i.name === k)?.value || 0, year: hazardCfg[k].year ?? null }));
    const exposureIndicators = enabledExp.map(k => ({
      name: k,
      weight: expCfg[k].weight,
      value: Math.min(1, Math.max(0, (expCfg[k].baseValue ?? 0) * (expCfg[k].multiplier ?? 1))),
      multiplier: expCfg[k].multiplier ?? 1,
    }));
    const vulnerabilityIndicators = enabledVuln.map(k => ({
      name: k,
      weight: vulnCfg[k].weight,
      value: Math.min(1, Math.max(0, (vulnCfg[k].baseValue ?? 0) * (vulnCfg[k].multiplier ?? 1))),
      multiplier: vulnCfg[k].multiplier ?? 1,
    }));
    const savedSettings = { outerWeights: { ...currentOuter }, hazardIndicators, exposureIndicators, vulnerabilityIndicators };
    setProjName("");
    try {
      const res = await fetch(`${API}/save-project`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, province, startYear: sy, endYear, tenure: tn, riskScore: result.riskScore, level: result.level, outerWeights: currentOuter, hazardIndicators, exposureIndicators, vulnerabilityIndicators, breakdown: result.breakdown }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Request failed"); }
      const data = await res.json();
      const projectData = { ...result, name, province, startYear: sy, tenure: tn, endYear, savedSettings, savedAt: data.savedAt || null };
      setProjects(prev => [...prev, projectData]);
    } catch (e) { console.warn("Failed to save project to CSV:", e.message); }
  }

  async function deleteProject(project) {
    if (!project) return;
    try {
      const res = await fetch(`${API}/projects`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedAt: project.savedAt || "", projectName: project.name, province: project.province, startYear: project.startYear, endYear: project.endYear, tenure: project.tenure }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Request failed"); }
      setProjects(prev => prev.filter(p => !(p.name === project.name && p.province === project.province && p.startYear === project.startYear && p.endYear === project.endYear && p.tenure === project.tenure && (project.savedAt ? p.savedAt === project.savedAt : true))));
    } catch (e) { console.warn("Failed to delete project:", e.message); }
  }

  if (!currentData) return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: C.hazard.text }}>⚠ Load Current Risk first</p>
    </div>
  );

  const issues = validate();

  return (
    <div>
      {isDirty && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: C.recalcBg, border: `1.5px solid ${C.recalcBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.recalcText }}>
            Current Risk baseline has pending changes. Go to the <b>Current Risk</b> tab and click <b>Recalculate</b> before running Adaptation Risk.
          </span>
        </div>
      )}

      {/* Saved project loader */}
      {projects.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.exposure.border}`, borderRadius: 12, padding: "13px 16px", marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.exposure.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>Load a Saved Project</span>
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>Restore a previous configuration</span>
            </div>
            <button onClick={() => setLoadMenuOpen(p => !p)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 8, border: `1px solid ${C.exposure.border}`, background: loadMenuOpen ? C.exposure.bg : C.surface, color: C.exposure.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {loadMenuOpen ? "▲ Close" : "▼ Browse Projects"}
            </button>
          </div>
          {loadMenuOpen && (
            <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
              {projects.map((p, i) => {
                const lvl = levelFromScore(p.riskScore);
                const ls = LEVEL_STYLE[lvl];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", borderRadius: 9, background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>{p.province} · {p.startYear}–{p.endYear} · {p.tenure}y</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <LevelBadge level={lvl} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary }}>{p.riskScore.toFixed(3)}</span>
                      <button onClick={() => loadProjectConfig(p)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: C.navy, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Load</button>
                      <button onClick={() => deleteProject(p)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.hazard.border}`, background: C.surface, color: C.hazard.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Project Timeline</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Start Year</label>
            <input type="number" min={2026} max={2099} placeholder="e.g. 2032" value={startYear} onChange={e => setStartYear(e.target.value)}
              style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box", background: C.surface, color: C.textPrimary }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Tenure (years)</label>
            <input type="number" min={1} max={50} placeholder="e.g. 10" value={tenure} onChange={e => setTenure(e.target.value)}
              style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box", background: C.surface, color: C.textPrimary }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>End Year</label>
            <div style={{ padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700, color: endYear ? C.textPrimary : C.textMuted, background: C.surfaceAlt }}>
              {endYear ?? "—"}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>Using baseline (Current Risk) weights for inner and outer components. Adjust growth multipliers below to model project scenarios.</span>
      </div>

      {issues.length > 0 && (
        <div style={{ padding: "11px 14px", borderRadius: 10, background: "#FDF6EE", border: `1px solid ${C.hazard.border}`, marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.hazard.text, margin: "0 0 4px" }}>⚠ Fix before calculating</p>
          {issues.map((iss, i) => <p key={i} style={{ fontSize: 12, color: C.hazard.text, margin: "2px 0 0", opacity: 0.8 }}>· {iss}</p>)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20, alignItems: "start" }}>
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Configure Indicators</h3>
          <AdaptHazardSection
            hazardCfg={hazardCfg}
            setHazardCfg={setHazardCfg}
            currentHazardCfg={currentHazardCfg}
            startYear={sy}
            tenure={tn}
            readOnly={true}
          />
          <AdaptIndicatorSection type="exposure"      cfg={expCfg}  setCfg={setExpCfg}  allowDecrease={true} />
          <AdaptIndicatorSection type="vulnerability" cfg={vulnCfg} setCfg={setVulnCfg} allowDecrease={true} />
        </div>
        <ResultPanel result={result} currentRiskIndex={baselineRiskIndex} calculating={calculating} error={calcError} onCalculate={calculate} btnLabel="Calculate Project Risk →">
          {result && (
            <div style={{ marginTop: 12, background: C.surfaceAlt, borderTop: `1px solid ${C.borderLight}`, paddingTop: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 9px" }}>Save as Project</p>
              <input placeholder={`Project ${projects.length + 1}`} value={projName} onChange={e => setProjName(e.target.value)}
                style={{ width: "100%", padding: "8px 11px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 9, outline: "none", boxSizing: "border-box", background: C.surface, color: C.textPrimary }} />
              <button onClick={saveProject} style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: C.navy, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                + Save Project Configuration
              </button>
            </div>
          )}
        </ResultPanel>
      </div>

      {projects.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>Saved Projects ({projects.length})</h3>
          <ProjectCompare projects={projects} currentRiskIndex={baselineRiskIndex} baselineLabel={futureRiskIndex != null ? `Future Baseline (${futureRiskIndex.toFixed(3)})` : "Current Baseline"} />
          {projects.map((p, i) => <div key={i} style={{ position: "relative" }}><ProjectCard project={p} baselineRiskIndex={baselineRiskIndex} /><button onClick={() => deleteProject(p)} style={{ position: "absolute", top: 12, right: 12, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.hazard.border}`, background: C.surface, color: C.hazard.text, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button></div>)}
        </div>
      )}
    </div>
  );
}

// ── SummaryTab ────────────────────────────────────────────────────────────────

function SummaryTab({ currentData, futureResult, adaptProjects, currentRiskIndex }) {
  const hasCurrentRisk = currentData != null;
  const hasFutureRisk  = futureResult != null;
  const hasProjects    = adaptProjects.length > 0;
  const futureScore    = futureResult?.riskScore ?? null;
  const futureLevel    = futureScore != null ? levelFromScore(futureScore) : null;
  const currentLevel   = currentRiskIndex != null ? levelFromScore(currentRiskIndex) : currentData?.level;

  function ScoreChip({ score, level }) {
    if (score == null) return <span style={{ fontSize: 11, color: C.textMuted }}>—</span>;
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "white", lineHeight: 1 }}>{score.toFixed(3)}</span>
        <LevelBadge level={level || levelFromScore(score)} />
      </div>
    );
  }

  function DeltaChip({ delta }) {
    if (delta == null) return null;
    const up = delta > 0.001, dn = delta < -0.001;
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#8B2C2C" : dn ? "#1E5535" : C.textMuted, background: up ? "#F5D8D8" : dn ? "#D8EFE2" : C.borderLight, padding: "2px 8px", borderRadius: 99, display: "inline-block" }}>
        {up ? "▲ +" : dn ? "▼ " : "= "}{delta.toFixed(3)}
      </span>
    );
  }

  function SectionHeader({ label, colorKey }) {
    const cc = COLORS[colorKey];
    return (
      <div style={{ padding: "5px 11px", borderRadius: 6, background: cc.bg, border: `1px solid ${cc.border}`, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 7, height: 7, borderRadius: 99, background: cc.dot }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: cc.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
      </div>
    );
  }

  function ComponentSummaryRow({ label, colorKey, weight, score, contribution }) {
    const cc = COLORS[colorKey];
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 8, background: cc.bg, border: `1px solid ${cc.border}`, marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 6, height: 6, borderRadius: 99, background: cc.dot }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: cc.text }}>{label}</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>wt {(weight * 100).toFixed(0)}%</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.textSecondary }}>score <b style={{ color: cc.accent }}>{score?.toFixed(3) ?? "—"}</b></span>
          <span style={{ fontSize: 11, color: C.textSecondary }}>contrib <b style={{ color: cc.accent }}>{contribution?.toFixed(4) ?? "—"}</b></span>
        </div>
      </div>
    );
  }

  function IndicatorList({ items, colorKey }) {
    const cc = COLORS[colorKey];
    if (!items || !items.length) return null;
    return (
      <div style={{ marginTop: 6, paddingLeft: 12 }}>
        {items.map((ind, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderRadius: 6, background: C.surfaceAlt, border: `1px solid ${C.borderLight}`, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: C.textSecondary, fontWeight: 600 }}>{ind.name}</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {ind.multiplier != null && ind.multiplier !== 1 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: ind.multiplier < 1 ? "#8B2C2C" : "#1E5535" }}>{ind.multiplier.toFixed(2)}×</span>
              )}
              {ind.year && <span style={{ fontSize: 10, color: C.textMuted }}>yr {ind.year}</span>}
              <span style={{ fontSize: 11, color: C.textPrimary, fontWeight: 700 }}>{typeof ind.value === "number" ? ind.value.toFixed(3) : "—"}</span>
              <span style={{ fontSize: 10, color: C.textMuted }}>w:{ind.weight.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function JourneyCard({ label, sublabel, score, level, borderColor, active }) {
    const ls = level ? LEVEL_STYLE[level] : null;
    return (
      <div style={{ flex: 1, minWidth: 110, background: C.surface, border: `2px solid ${active ? borderColor : C.border}`, borderRadius: 12, padding: "14px 12px", textAlign: "center", opacity: active ? 1 : 0.5 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: active ? borderColor : C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6 }}>{sublabel}</div>}
        <div style={{ fontSize: 30, fontWeight: 800, color: active && ls ? ls.color : C.textMuted, lineHeight: 1, marginBottom: 8 }}>{score != null ? score.toFixed(3) : "—"}</div>
        {active && level ? <LevelBadge level={level} /> : <span style={{ fontSize: 11, color: C.textMuted }}>not calculated</span>}
      </div>
    );
  }

  function JourneyArrow({ delta }) {
    const up = delta != null && delta > 0.001;
    const dn = delta != null && delta < -0.001;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "0 2px", flexShrink: 0 }}>
        <span style={{ fontSize: 18, color: up ? "#8B2C2C" : dn ? "#1E5535" : C.textMuted }}>{up ? "▲" : dn ? "▼" : "→"}</span>
        {delta != null && <span style={{ fontSize: 10, fontWeight: 700, color: up ? "#8B2C2C" : dn ? "#1E5535" : C.textMuted }}>{delta > 0 ? "+" : ""}{delta.toFixed(3)}</span>}
      </div>
    );
  }

  if (!hasCurrentRisk) return (
    <div style={{ padding: "60px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◈</div>
      <p style={{ fontSize: 15, fontWeight: 700, color: C.textSecondary, margin: "0 0 6px" }}>No data yet</p>
      <p style={{ fontSize: 13, color: C.textMuted }}>Complete Current Risk, Future Risk, and at least one Adaptation Project to see the summary.</p>
    </div>
  );

  return (
    <div>
      {/* Journey bar */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>Risk Journey — {currentData.province}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <JourneyCard label="Current Risk" sublabel="2026 baseline" score={currentRiskIndex} level={currentLevel} borderColor={C.stageCurrentBorder} active={true} />
          <JourneyArrow delta={futureScore != null ? futureScore - currentRiskIndex : null} />
          <JourneyCard label="Future Risk" sublabel={futureResult ? `year ${futureResult.breakdown?.hazard?.items?.[0]?.year ?? "—"}` : "not calculated"} score={futureScore} level={futureLevel} borderColor={C.stageFutureBorder} active={hasFutureRisk} />
          {adaptProjects.map((p, i) => {
            const prevScore = i === 0 ? (futureScore ?? currentRiskIndex) : adaptProjects[i - 1].riskScore;
            return (
              <span key={i} style={{ display: "contents" }}>
                <JourneyArrow delta={p.riskScore - prevScore} />
                <JourneyCard label={p.name} sublabel={`${p.startYear}–${p.endYear}`} score={p.riskScore} level={levelFromScore(p.riskScore)} borderColor={C.stageProjectBorder} active={true} />
              </span>
            );
          })}
        </div>
      </div>

      {/* Risk Comparison Bar Chart */}
      {(hasFutureRisk || hasProjects) && (() => {
        const stages = [
          { label: "Current Risk", score: currentRiskIndex, level: currentLevel, color: C.stageCurrentBorder },
          ...(hasFutureRisk ? [{ label: "Future Risk", score: futureScore, level: futureLevel, color: C.stageFutureBorder }] : []),
          ...adaptProjects.map(p => ({ label: p.name, score: p.riskScore, level: levelFromScore(p.riskScore), sublabel: `${p.startYear}–${p.endYear}`, color: C.stageProjectBorder })),
        ];
        const maxScore = Math.max(...stages.map(s => s.score), 0.01);
        return (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 22 }}>
            <div style={{ background: C.navy, padding: "12px 18px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.07em" }}>Risk Score Comparison</span>
            </div>
            <div style={{ padding: "18px 22px", display: "grid", gap: 12 }}>
              {stages.map((s, i) => {
                const ls = LEVEL_STYLE[s.level] || LEVEL_STYLE.Moderate;
                const base = i === 0 ? null : stages[0].score;
                const delta = base != null ? s.score - base : null;
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>{s.label}</span>
                        {s.sublabel && <span style={{ fontSize: 11, color: C.textMuted }}>{s.sublabel}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {delta != null && <DeltaChip delta={delta} />}
                        <LevelBadge level={s.level} />
                        <span style={{ fontSize: 15, fontWeight: 800, color: ls.color, minWidth: 46, textAlign: "right" }}>{s.score.toFixed(3)}</span>
                      </div>
                    </div>
                    <div style={{ height: 10, borderRadius: 99, background: C.borderLight, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(s.score / maxScore) * 100}%`, background: s.color, borderRadius: 99, transition: "width 0.5s ease", opacity: 0.85 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Adaptation projects comparison */}
      {hasProjects && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 22 }}>
          <div style={{ background: C.navy, padding: "12px 18px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.07em" }}>Adaptation Projects Comparison</span>
            <span style={{ fontSize: 11, color: "#6A8AAA", marginLeft: 10 }}>{adaptProjects.length} project{adaptProjects.length > 1 ? "s" : ""} saved</span>
          </div>
          <div style={{ padding: "16px 18px" }}>
            <ProjectCompare
              projects={adaptProjects}
              currentRiskIndex={futureScore ?? currentRiskIndex}
              baselineLabel={hasFutureRisk ? `Future Baseline (${futureScore != null ? futureScore.toFixed(3) : ""})` : "Current Baseline"}
            />
            {adaptProjects.map((p, i) => (
              <ProjectCard key={i} project={p} baselineRiskIndex={futureScore ?? currentRiskIndex} />
            ))}
          </div>
        </div>
      )}

      {/* Per-stage detail cards */}
      {(() => {
        const allStages = [
          {
            id: "current", label: "Current Risk", sublabel: `2026 · ${currentData.province}`,
            score: currentRiskIndex, level: currentLevel, delta: null,
            components: [["hazard","Hazard"],["exposure","Exposure"],["vulnerability","Vulnerability"]].map(([key, lbl]) => {
              const src = currentData[key];
              const items = src.items.map(i => ({ name: i.name, value: i.value, weight: i.weight }));
              const sc = items.reduce((s, i) => s + (i.value || 0) * i.weight, 0);
              return { key, lbl, weight: src.overallWeight, score: sc, contribution: sc * src.overallWeight, items };
            }),
          },
          ...(hasFutureRisk ? [{
            id: "future", label: "Future Risk",
            sublabel: `Year ${futureResult.breakdown?.hazard?.items?.[0]?.year ?? "—"}`,
            score: futureScore, level: futureLevel, delta: futureScore - currentRiskIndex,
            components: [["hazard","Hazard"],["exposure","Exposure"],["vulnerability","Vulnerability"]].map(([key, lbl]) => {
              const bd = futureResult.breakdown[key];
              return bd ? { key, lbl, weight: bd.outerWeight, score: bd.score, contribution: bd.contribution, items: bd.items.map(i => ({ name: i.name, value: i.value, weight: i.weight, year: i.year })) } : null;
            }).filter(Boolean),
          }] : []),
          ...adaptProjects.map((proj, pi) => {
            const base = futureScore ?? currentRiskIndex;
            return {
              id: `project-${pi}`, label: proj.name,
              sublabel: `${proj.startYear}–${proj.endYear} · ${proj.tenure}y`,
              score: proj.riskScore, level: levelFromScore(proj.riskScore),
              delta: base != null ? proj.riskScore - base : null,
              outerWeights: proj.savedSettings.outerWeights,
              components: [["hazard","Hazard"],["exposure","Exposure"],["vulnerability","Vulnerability"]].map(([key, lbl]) => {
                const bd = proj.breakdown[key];
                const inds = proj.savedSettings[key === "hazard" ? "hazardIndicators" : key === "exposure" ? "exposureIndicators" : "vulnerabilityIndicators"] || [];
                return bd ? { key, lbl, weight: proj.savedSettings.outerWeights[key], score: bd.score, contribution: bd.contribution, items: inds.map(i => ({ name: i.name, value: i.value, weight: i.weight, multiplier: i.multiplier })) } : null;
              }).filter(Boolean),
            };
          }),
        ];

        const cols = allStages.length <= 2 ? allStages.length : Math.min(allStages.length, 3);
        return (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, alignItems: "start", marginBottom: 24 }}>
            {allStages.map((stage, si) => (
              <div key={stage.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: C.navy, padding: "12px 15px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6A8AAA", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{stage.label}</div>
                  <ScoreChip score={stage.score} level={stage.level} />
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5 }}>
                    <span style={{ fontSize: 10, color: "#6A8AAA" }}>{stage.sublabel}</span>
                    {stage.delta != null && <DeltaChip delta={stage.delta} />}
                  </div>
                </div>
                <div style={{ padding: "13px" }}>
                  {stage.components.map(comp => (
                    <div key={comp.key}>
                      <SectionHeader label={comp.lbl} colorKey={comp.key} />
                      <ComponentSummaryRow label={comp.lbl} colorKey={comp.key} weight={comp.weight} score={comp.score} contribution={comp.contribution} />
                      <IndicatorList items={comp.items} colorKey={comp.key} />
                      <div style={{ height: 10 }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Indicator performance table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ background: C.navy, padding: "12px 18px" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "white", textTransform: "uppercase", letterSpacing: "0.07em" }}>Indicator Performance Across All Stages</span>
          <span style={{ fontSize: 11, color: "#6A8AAA", marginLeft: 10 }}>value · weight · Δ vs previous stage</span>
        </div>
        <div style={{ padding: "16px 18px" }}>
          {[["hazard","Hazard"],["exposure","Exposure"],["vulnerability","Vulnerability"]].map(([type, lbl]) => {
            const currentItems = currentData[type].items;
            const futureItems  = futureResult?.breakdown?.[type]?.items || [];
            const projIndicatorSets = adaptProjects.map(p =>
              p.savedSettings[type === "hazard" ? "hazardIndicators" : type === "exposure" ? "exposureIndicators" : "vulnerabilityIndicators"] || []
            );
            const allNames = [...new Set([
              ...currentItems.map(i => i.name),
              ...futureItems.map(i => i.name),
              ...projIndicatorSets.flat().map(i => i.name),
            ])];
            if (!allNames.length) return null;

            const cols = [
              { key: "current", label: "Current Risk", color: C.exposure },
              ...(hasFutureRisk ? [{ key: "future", label: "Future Risk", color: C.hazard }] : []),
              ...adaptProjects.map((p, i) => ({ key: `proj_${i}`, label: p.name, color: C.vulnerability, projIdx: i })),
            ];

            function getCell(colKey, name) {
              if (colKey === "current") return currentItems.find(i => i.name === name) || null;
              if (colKey === "future")  return futureItems.find(i => i.name === name) || null;
              const pidx = parseInt(colKey.replace("proj_", ""));
              return projIndicatorSets[pidx]?.find(i => i.name === name) || null;
            }

            function getRef(colIdx, name) {
              for (let ci = colIdx - 1; ci >= 0; ci--) {
                const cell = getCell(cols[ci].key, name);
                if (cell) return cell.value;
              }
              return null;
            }

            return (
              <div key={type} style={{ marginBottom: 24 }}>
                <SectionHeader label={lbl} colorKey={type} />
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "8px 12px", color: C.textMuted, fontWeight: 700, background: C.surfaceAlt, borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap", minWidth: 140 }}>Indicator</th>
                        {cols.map((col, ci) => (
                          <th key={ci} style={{ textAlign: "center", padding: "8px 13px", fontWeight: 700, whiteSpace: "nowrap", color: col.color.header, background: col.color.bg, borderBottom: `2px solid ${col.color.border}`, minWidth: 110 }}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
                        <td style={{ padding: "7px 12px", fontWeight: 700, color: C.textSecondary, fontSize: 11, fontStyle: "italic" }}>Component Score / Contribution</td>
                        {cols.map((col, ci) => {
                          let score, contrib, weight;
                          if (col.key === "current") {
                            const src = currentData[type];
                            const items = src.items;
                            score = items.reduce((s, i) => s + (i.value || 0) * i.weight, 0);
                            weight = src.overallWeight;
                            contrib = score * weight;
                          } else if (col.key === "future") {
                            const bd = futureResult?.breakdown?.[type];
                            score = bd?.score; weight = bd?.outerWeight; contrib = bd?.contribution;
                          } else {
                            const pidx = col.projIdx;
                            const bd = adaptProjects[pidx]?.breakdown?.[type];
                            score = bd?.score; weight = adaptProjects[pidx]?.savedSettings?.outerWeights?.[type]; contrib = bd?.contribution;
                          }
                          return (
                            <td key={ci} style={{ padding: "7px 13px", textAlign: "center", background: col.color.bg }}>
                              <span style={{ fontWeight: 700, color: col.color.accent, fontSize: 13 }}>{score?.toFixed(3) ?? "—"}</span>
                              <span style={{ display: "block", fontSize: 10, color: C.textMuted }}>wt {weight != null ? (weight * 100).toFixed(0) : "—"}% → {contrib?.toFixed(4) ?? "—"}</span>
                            </td>
                          );
                        })}
                      </tr>
                      {allNames.map((name, ri) => (
                        <tr key={name} style={{ borderBottom: `1px solid ${C.borderLight}`, background: ri % 2 === 0 ? C.surface : C.surfaceAlt }}>
                          <td style={{ padding: "8px 12px", fontWeight: 600, color: C.textPrimary }}>{name}</td>
                          {cols.map((col, ci) => {
                            const cell = getCell(col.key, name);
                            const refVal = getRef(ci, name);
                            const dir = cell && refVal != null ? cell.value - refVal : null;
                            return (
                              <td key={ci} style={{ padding: "8px 13px", textAlign: "center" }}>
                                {cell ? (
                                  <div>
                                    <span style={{ fontWeight: 700, color: col.color.accent, fontSize: 13 }}>{cell.value?.toFixed(3) ?? "—"}</span>
                                    {cell.multiplier != null && cell.multiplier !== 1 && (
                                      <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: cell.multiplier < 1 ? "#8B2C2C" : "#1E5535" }}>{cell.multiplier.toFixed(2)}×</span>
                                    )}
                                    {cell.year && <span style={{ display: "block", fontSize: 10, color: C.textMuted }}>yr {cell.year}</span>}
                                    {dir != null && Math.abs(dir) > 0.0005 && (
                                      <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: dir > 0 ? "#8B2C2C" : "#1E5535" }}>
                                        {dir > 0 ? "▲ +" : "▼ "}{Math.abs(dir).toFixed(3)}
                                      </span>
                                    )}
                                    <span style={{ display: "block", fontSize: 10, color: C.textMuted }}>w: {cell.weight?.toFixed(2)}</span>
                                  </div>
                                ) : <span style={{ color: C.textMuted, fontSize: 12 }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab,   setActiveTab]   = useState("current");
  const [sector,      setSector]      = useState("Sector 1");
  const [province,    setProvince]    = useState("Torba");
  const [currentData, setCurrentData] = useState(null);
  const [error,       setError]       = useState("");

  const [currentRiskDirty, setCurrentRiskDirty] = useState(false);
  const [confirmedRiskScore, setConfirmedRiskScore] = useState(null);

  const [currentOuter, setCurrentOuter] = useState({ hazard: 0.34, exposure: 0.33, vulnerability: 0.33 });
  const [currentHazardCfg, setCurrentHazardCfg] = useState({});
  const [currentExpCfg, setCurrentExpCfg] = useState({});
  const [currentVulnCfg, setCurrentVulnCfg] = useState({});

  // Future tab state — expCfg/vulnCfg now carry multipliers too
  const [futureHazardCfg, setFutureHazardCfg] = useState({ "Hazard 1": { enabled: false, weight: 0.5, year: null }, "Hazard 2": { enabled: false, weight: 0.5, year: null } });
  const [futureExpCfg, setFutureExpCfg]   = useState({});
  const [futureVulnCfg, setFutureVulnCfg] = useState({});
  const [futureResult, setFutureResult]   = useState(null);

  const [adaptStartYear, setAdaptStartYear] = useState("");
  const [adaptTenure, setAdaptTenure]       = useState("");
  const [adaptHazardCfg, setAdaptHazardCfg] = useState({ "Hazard 1": { enabled: false, weight: 0.5 }, "Hazard 2": { enabled: false, weight: 0.5 } });
  const [adaptExpCfg, setAdaptExpCfg]   = useState({});
  const [adaptVulnCfg, setAdaptVulnCfg] = useState({});
  const [adaptResult, setAdaptResult]   = useState(null);
  const [adaptProjects, setAdaptProjects] = useState([]);

  const currentRiskResult = currentData
    ? buildCurrentRiskResult(currentOuter, currentHazardCfg, currentExpCfg, currentVulnCfg)
    : null;

  const currentRiskIndex = confirmedRiskScore ?? currentRiskResult?.riskScore ?? currentData?.riskIndex ?? null;

  function handleBaselineConfirmed(newScore) {
    setConfirmedRiskScore(newScore);
    setCurrentRiskDirty(false);
    setFutureResult(null);
    setAdaptResult(null);
  }

  async function loadDataForCurrentProvince() {
    if (!province) return;
    try {
      setError("");
      setCurrentRiskDirty(false);
      setConfirmedRiskScore(null);
      const res = await fetch(`${API}/current-risk?province=${encodeURIComponent(province)}`);
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();

      if (data.vulnerability && data.vulnerability.items) {
        data.vulnerability.items = data.vulnerability.items.map(item => {
          if (item.name === "LFPR_Overall") {
            return { ...item, name: "Labour Force Participation Rate" };
          }
          return item;
        });
      }

      setCurrentData(data);
      const currentHazard        = buildConfigFromItems(data.hazard?.items || []);
      const currentExposure      = buildConfigFromItems(data.exposure?.items || []);
      const currentVulnerability = buildConfigFromItems(data.vulnerability?.items || []);
      setCurrentOuter({
        hazard:        data.hazard?.overallWeight        ?? 0.34,
        exposure:      data.exposure?.overallWeight      ?? 0.33,
        vulnerability: data.vulnerability?.overallWeight ?? 0.33,
      });
      setCurrentHazardCfg(currentHazard);
      setCurrentExpCfg(currentExposure);
      setCurrentVulnCfg(currentVulnerability);

      const hi = data.hazard?.items       || [];
      const ei = data.exposure?.items     || [];
      const vi = data.vulnerability?.items || [];

      const fhc = buildHazardConfigFromItems(hi, true);
      const ahc = buildHazardConfigFromItems(hi, true);
      setFutureHazardCfg(fhc);
      setAdaptHazardCfg(ahc);

      const ew = initEqual(ei.map(i => i.name));
      // futureExpCfg carries value + multiplier for growth sliders
      const fec = {}, aec = {};
      ei.forEach(i => {
        fec[i.name] = { enabled: true, weight: ew[i.name], value: i.value, baseValue: i.value ?? 0, multiplier: 1, isCustom: i.isCustom || false };
        aec[i.name] = { enabled: true, weight: ew[i.name], baseValue: i.value ?? 0, multiplier: 1, isCustom: i.isCustom || false };
      });
      setFutureExpCfg(fec);
      setAdaptExpCfg(aec);

      const vw = initEqual(vi.map(i => i.name));
      const fvc = {}, avc = {};
      vi.forEach(i => {
        fvc[i.name] = { enabled: true, weight: vw[i.name], value: i.value, baseValue: i.value ?? 0, multiplier: 1, isCustom: i.isCustom || false };
        avc[i.name] = { enabled: true, weight: vw[i.name], baseValue: i.value ?? 0, multiplier: 1, isCustom: i.isCustom || false };
      });
      setFutureVulnCfg(fvc);
      setAdaptVulnCfg(avc);

      setFutureResult(null);
      setAdaptResult(null);
    } catch {
      setError("Failed to load risk data.");
      setCurrentData(null);
      setCurrentHazardCfg({});
      setCurrentExpCfg({});
      setCurrentVulnCfg({});
    }
  }

  function handleSectorChange(newSector) {
    if (newSector === sector) return;
    setSector(newSector);
    setActiveTab("current");
    setCurrentData(null);
    setError("");
    setCurrentRiskDirty(false);
    setConfirmedRiskScore(null);
    setCurrentOuter({ hazard: 0.34, exposure: 0.33, vulnerability: 0.33 });
    setCurrentHazardCfg({});
    setCurrentExpCfg({});
    setCurrentVulnCfg({});
    setFutureHazardCfg({ "Hazard 1": { enabled: false, weight: 0.5, year: null }, "Hazard 2": { enabled: false, weight: 0.5, year: null } });
    setFutureExpCfg({});
    setFutureVulnCfg({});
    setFutureResult(null);
    setAdaptStartYear("");
    setAdaptTenure("");
    setAdaptHazardCfg({ "Hazard 1": { enabled: false, weight: 0.5 }, "Hazard 2": { enabled: false, weight: 0.5 } });
    setAdaptExpCfg({});
    setAdaptVulnCfg({});
    setAdaptResult(null);
    setAdaptProjects([]);
    setTimeout(() => { loadDataForCurrentProvince(); }, 100);
  }

  useEffect(() => { loadDataForCurrentProvince(); }, [province]);

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch(`${API}/projects`);
        if (!res.ok) return;
        const data = await res.json();
        setAdaptProjects(Array.isArray(data.projects) ? data.projects : []);
      } catch { setAdaptProjects([]); }
    }
    loadProjects();
  }, []);

  const TABS = [
    { id: "current",    label: "Current Risk" },
    { id: "future",     label: "Future Risk" },
    { id: "adaptation", label: "Adaptation Projects" },
    { id: "summary",    label: "Summary" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, fontFamily: "'Inter', 'DM Sans', sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: C.navy, borderBottom: `1px solid ${C.navyLight}`, position: "sticky", top: 0, zIndex: 200 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "18px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "white", letterSpacing: "-0.02em", margin: 0 }}>Climate Risk Calculator</h1>
              <p style={{ fontSize: 12, color: "#8AAFD0", margin: "3px 0 0", fontWeight: 400 }}>Vanuatu · {sector} · Risk Assessment Platform</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minWidth: 340 }}>
              <Dropdown label="Sector"   options={["Sector 1","Sector 2"]} selected={sector}   setSelected={handleSectorChange} />
              <Dropdown label="Province" options={["Torba","Sanma","Penama","Malampa","Shefa","Tafea"]} selected={province} setSelected={setProvince} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 0 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "10px 22px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", background: "transparent", color: activeTab === tab.id ? "white" : "#6A8AAA", borderBottom: activeTab === tab.id ? "2px solid white" : "2px solid transparent", transition: "all 0.15s", position: "relative" }}>
                {tab.label}
                {tab.id === "current" && currentRiskDirty && (
                  <span style={{ position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: 99, background: C.recalcBtn, border: "1.5px solid #92400E" }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1160, margin: "22px auto 0", padding: "0 20px" }}>

        {activeTab === "current" && (
          <CurrentRiskTab
            province={province} sector={sector} currentData={currentData} error={error}
            outer={currentOuter} setOuter={setCurrentOuter}
            hazardCfg={currentHazardCfg} setHazardCfg={setCurrentHazardCfg}
            expCfg={currentExpCfg}       setExpCfg={setCurrentExpCfg}
            vulnCfg={currentVulnCfg}     setVulnCfg={setCurrentVulnCfg}
            isDirty={currentRiskDirty}   setIsDirty={setCurrentRiskDirty}
            onBaselineConfirmed={handleBaselineConfirmed}
          />
        )}

        {activeTab === "future" && (
          <FutureRiskTab
            province={province} currentRiskIndex={currentRiskIndex} currentData={currentData}
            currentOuter={currentOuter}
            currentHazardCfg={currentHazardCfg} currentExpCfg={currentExpCfg} currentVulnCfg={currentVulnCfg}
            hazardCfg={futureHazardCfg} setHazardCfg={setFutureHazardCfg}
            expCfg={futureExpCfg}       setExpCfg={setFutureExpCfg}
            vulnCfg={futureVulnCfg}     setVulnCfg={setFutureVulnCfg}
            result={futureResult}       setResult={setFutureResult}
            isDirty={currentRiskDirty}
          />
        )}

        {activeTab === "adaptation" && (
          <AdaptationTab
            province={province}
            futureRiskIndex={futureResult?.riskScore ?? null}
            currentRiskIndex={currentRiskIndex}
            currentData={currentData}
            currentOuter={currentOuter}
            currentHazardCfg={currentHazardCfg} currentExpCfg={currentExpCfg} currentVulnCfg={currentVulnCfg}
            startYear={adaptStartYear} setStartYear={setAdaptStartYear}
            tenure={adaptTenure}       setTenure={setAdaptTenure}
            hazardCfg={adaptHazardCfg} setHazardCfg={setAdaptHazardCfg}
            expCfg={adaptExpCfg}       setExpCfg={setAdaptExpCfg}
            vulnCfg={adaptVulnCfg}     setVulnCfg={setAdaptVulnCfg}
            result={adaptResult}       setResult={setAdaptResult}
            projects={adaptProjects}   setProjects={setAdaptProjects}
            isDirty={currentRiskDirty}
          />
        )}

        {activeTab === "summary" && (
          <SummaryTab
            currentData={currentData}
            currentRiskIndex={currentRiskIndex}
            futureResult={futureResult}
            adaptProjects={adaptProjects}
          />
        )}
      </div>
    </div>
  );
}