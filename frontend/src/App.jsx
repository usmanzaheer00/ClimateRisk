// Frontend Dashboard for Climate Risk Calculator
import { useState, useEffect } from "react";

const API = "/api";

// ── Professional colour palette ──────────────────────────────────────────────
// Slate-based neutrals + three muted semantic colours (no bright orange/green/purple)
const C = {
  // page & surface
  pageBg:      "#F4F6F9",
  surface:     "#FFFFFF",
  surfaceAlt:  "#F8FAFC",
  border:      "#DDE3EC",
  borderLight: "#EDF0F5",
  // text
  textPrimary:   "#1A2332",
  textSecondary: "#4A5568",
  textMuted:     "#8A96A8",
  // nav / brand
  navy:        "#1E3A5F",
  navyLight:   "#2C4F7C",
  // component colours — subdued, professional
  hazard:        { bg: "#FDF4EE", border: "#C8885A", text: "#7A4520", accent: "#9A5530", dot: "#C8885A", header: "#8B4513" },
  exposure:      { bg: "#EEF3FA", border: "#5C85C0", text: "#1E3F6E", accent: "#2E5FA0", dot: "#5C85C0", header: "#1E3F6E" },
  vulnerability: { bg: "#EEF7F2", border: "#4E9E6E", text: "#1E5535", accent: "#2E7A4E", dot: "#4E9E6E", header: "#1E5535" },
  // risk levels — muted
  levelLow:      { color: "#1E5535", bg: "#D8EFE2" },
  levelModerate: { color: "#7A5C00", bg: "#F5E8C0" },
  levelHigh:     { color: "#8B2C2C", bg: "#F5D8D8" },
  levelVeryHigh: { color: "#4A2080", bg: "#E0D5F5" },
  levelExtreme:  { color: "#5C1A1A", bg: "#F5D0D0" },
  // stage colours for summary journey
  stageCurrentBorder:  "#5C85C0",
  stageFutureBorder:   "#C8885A",
  stageProjectBorder:  "#4E9E6E",
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

// ── Hazard section (Future tab) — shared year selector ───────────────────────

function HazardSection({ hazardCfg, setHazardCfg }) {
  const HAZARDS = ["TXX", "RX1Day"];
  const YEAR_OPTS = Array.from({ length: 2099 - 2027 + 1 }, (_, i) => 2027 + i);
  const [sharedYear, setSharedYear] = useState(hazardCfg.TXX?.year || 2027);

  useEffect(() => {
    setHazardCfg(prev => ({
      ...prev,
      TXX:    { ...prev.TXX,    year: sharedYear },
      RX1Day: { ...prev.RX1Day, year: sharedYear },
    }));
  }, [sharedYear]);

  function toggle(h) {
    setHazardCfg(prev => {
      const next = { ...prev, [h]: { ...prev[h], enabled: !prev[h].enabled } };
      const enabled = HAZARDS.filter(k => next[k].enabled);
      const w = initEqual(enabled);
      HAZARDS.forEach(k => { next[k] = { ...next[k], weight: enabled.includes(k) ? w[k] : 0 }; });
      return next;
    });
  }

  function changeWeight(h, val) {
    setHazardCfg(prev => {
      const enabled = HAZARDS.filter(k => prev[k].enabled);
      const cur = {}; enabled.forEach(k => { cur[k] = prev[k].weight; });
      const bal = autoBalance(cur, h, val);
      const next = { ...prev };
      enabled.forEach(k => { next[k] = { ...next[k], weight: bal[k] }; });
      return next;
    });
  }

  const enabledCount = HAZARDS.filter(h => hazardCfg[h]?.enabled).length;
  const c = COLORS.hazard;
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>Hazard</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>{enabledCount} selected</span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "9px 12px", borderRadius: 8, background: c.bg, border: `1px solid ${c.border}` }}>
          <span style={{ fontSize: 12, color: c.text, fontWeight: 700, minWidth: 38 }}>Year</span>
          <select value={sharedYear} onChange={e => setSharedYear(parseInt(e.target.value))}
            style={{ fontSize: 13, fontWeight: 600, border: `1px solid ${c.border}`, borderRadius: 7, padding: "4px 10px", background: C.surface, color: c.text, cursor: "pointer", flex: 1 }}>
            {YEAR_OPTS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ fontSize: 11, color: c.text, opacity: 0.6 }}>applied to both</span>
        </div>
        {HAZARDS.map(h => {
          const cfg = hazardCfg[h];
          return (
            <div key={h} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: cfg.enabled ? 8 : 0 }}>
                <div onClick={() => toggle(h)} style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: `2px solid ${cfg.enabled ? c.accent : C.border}`, background: cfg.enabled ? c.accent : C.surface, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                  {cfg.enabled && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span style={{ fontSize: 13, fontWeight: cfg.enabled ? 700 : 400, color: cfg.enabled ? c.text : C.textSecondary }}>
                  {h === "TXX" ? "TXX (Max Temperature)" : "RX1Day (Max 1-Day Precipitation)"}
                </span>
              </div>
              {cfg.enabled && (
                <div style={{ paddingLeft: 25 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Inner weight</span>
                  <WSlider value={cfg.weight} onChange={v => changeWeight(h, v)} color={c.accent} disabled={enabledCount < 2} />
                </div>
              )}
            </div>
          );
        })}
        {enabledCount === 0 && <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0", textAlign: "center" }}>Select at least one hazard indicator</p>}
      </div>
    </div>
  );
}

// ── Indicator section (Future tab) ───────────────────────────────────────────

function IndicatorSection({ type, indicators, cfg, setCfg }) {
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
                  <WSlider value={indCfg.weight} onChange={v => changeWeight(ind.name, v)} color={c.accent} disabled={enabledKeys.length < 2} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Result panel ─────────────────────────────────────────────────────────────

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
                      <span style={{ fontSize: 11, color: C.textSecondary }}>{item.name}{item.year ? ` (${item.year})` : ""}{item.multiplier && item.multiplier !== 1 ? ` ×${item.multiplier}` : ""}</span>
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

// ── Future Risk Tab ───────────────────────────────────────────────────────────

function FutureRiskTab({ province, currentRiskIndex, currentData, outer, setOuter, hazardCfg, setHazardCfg, expCfg, setExpCfg, vulnCfg, setVulnCfg, result, setResult }) {
  const [calculating, setCalc]    = useState(false);
  const [calcError, setCalcError] = useState("");

  const expIndicators  = currentData?.exposure?.items  || [];
  const vulnIndicators = currentData?.vulnerability?.items || [];

  function validate() {
    const issues = [];
    const eh = ["TXX","RX1Day"].filter(h => hazardCfg[h]?.enabled);
    if (!eh.length) issues.push("Select at least one hazard indicator");
    const ot = outer.hazard + outer.exposure + outer.vulnerability;
    if (Math.abs(ot - 1.0) > 0.02) issues.push(`Outer weights must sum to 1.00 (currently ${ot.toFixed(2)})`);
    if (!expIndicators.filter(i => expCfg[i.name]?.enabled).length)  issues.push("Select at least one exposure indicator");
    if (!vulnIndicators.filter(i => vulnCfg[i.name]?.enabled).length) issues.push("Select at least one vulnerability indicator");
    return issues;
  }

  async function calculate() {
    const issues = validate();
    if (issues.length) { setCalcError(issues.join(" · ")); return; }
    setCalcError(""); setCalc(true);
    try {
      const body = {
        province, outerWeights: outer,
        hazard: ["TXX","RX1Day"].filter(h => hazardCfg[h]?.enabled).map(h => ({ name: h, year: hazardCfg[h].year, weight: hazardCfg[h].weight })),
        exposure: expIndicators.filter(i => expCfg[i.name]?.enabled).map(i => ({ name: i.name, value: expCfg[i.name].value, weight: expCfg[i.name].weight })),
        vulnerability: vulnIndicators.filter(i => vulnCfg[i.name]?.enabled).map(i => ({ name: i.name, value: vulnCfg[i.name].value, weight: vulnCfg[i.name].weight })),
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
      <OuterWeightBar outer={outer} setOuter={setOuter} />
      {issues.length > 0 && (
        <div style={{ padding: "11px 14px", borderRadius: 10, background: "#FDF6EE", border: `1px solid ${C.hazard.border}`, marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.hazard.text, margin: "0 0 4px" }}>⚠ Fix before calculating</p>
          {issues.map((iss, i) => <p key={i} style={{ fontSize: 12, color: C.hazard.text, margin: "2px 0 0", opacity: 0.8 }}>· {iss}</p>)}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20, alignItems: "start" }}>
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Configure Indicators</h3>
          <HazardSection hazardCfg={hazardCfg} setHazardCfg={setHazardCfg} />
          <IndicatorSection type="exposure"      indicators={expIndicators}  cfg={expCfg}  setCfg={setExpCfg} />
          <IndicatorSection type="vulnerability" indicators={vulnIndicators} cfg={vulnCfg} setCfg={setVulnCfg} />
        </div>
        <ResultPanel result={result} currentRiskIndex={currentRiskIndex} calculating={calculating} error={calcError} onCalculate={calculate} btnLabel="Calculate Future Risk →" />
      </div>
    </div>
  );
}

// ── Adapt indicator section ───────────────────────────────────────────────────

function AdaptIndicatorSection({ type, cfg, setCfg, allowDecrease = false }) {
  const c = COLORS[type];
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const allKeys = Object.keys(cfg);
  const enabledKeys = allKeys.filter(k => cfg[k]?.enabled);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newValue, setNewValue] = useState("");

  function toggle(name) {
    setCfg(prev => {
      const next = { ...prev, [name]: { ...prev[name], enabled: !prev[name]?.enabled } };
      const nowEnabled = Object.keys(next).filter(k => next[k]?.enabled);
      const w = initEqual(nowEnabled);
      nowEnabled.forEach(k => { next[k] = { ...next[k], weight: w[k] }; });
      Object.keys(next).filter(k => !next[k]?.enabled).forEach(k => { next[k] = { ...next[k], weight: 0 }; });
      return next;
    });
  }

  function changeWeight(name, val) {
    setCfg(prev => {
      const cur = {}; enabledKeys.forEach(k => { cur[k] = prev[k].weight; });
      const bal = autoBalance(cur, name, val);
      const next = { ...prev };
      enabledKeys.forEach(k => { next[k] = { ...next[k], weight: bal[k] }; });
      return next;
    });
  }

  function changeMult(name, val) {
    setCfg(prev => ({ ...prev, [name]: { ...prev[name], multiplier: val } }));
  }

  function addCustom() {
    const nm = newName.trim();
    const vl = parseFloat(newValue);
    if (!nm || isNaN(vl) || vl < 0 || vl > 1) return;
    setCfg(prev => {
      const next = { ...prev };
      const currentKeys = [...Object.keys(next).filter(k => next[k]?.enabled), nm];
      const w = initEqual(currentKeys);
      currentKeys.forEach(k => { if (next[k]) next[k].weight = w[k]; });
      next[nm] = { enabled: true, weight: w[nm], baseValue: vl, multiplier: 1, isCustom: true };
      return next;
    });
    setNewName(""); setNewValue(""); setAdding(false);
  }

  function removeCustom(name) {
    setCfg(prev => {
      const next = { ...prev }; delete next[name];
      const nowEnabled = Object.keys(next).filter(k => next[k]?.enabled);
      const w = initEqual(nowEnabled);
      nowEnabled.forEach(k => { next[k] = { ...next[k], weight: w[k] }; });
      return next;
    });
  }

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>{enabledKeys.length} selected</span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>
        {allKeys.map(name => {
          const ind = cfg[name];
          if (!ind) return null;
          const effectiveValue = Math.min(1, Math.max(0, (ind.baseValue ?? 0) * (ind.multiplier ?? 1)));
          return (
            <div key={name} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: ind.enabled ? 9 : 0 }}>
                <div onClick={() => toggle(name)} style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: `2px solid ${ind.enabled ? c.accent : C.border}`, background: ind.enabled ? c.accent : C.surface, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                  {ind.enabled && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span style={{ fontSize: 13, fontWeight: ind.enabled ? 700 : 400, color: ind.enabled ? c.text : C.textSecondary, flex: 1 }}>{name}{ind.isCustom ? " ✦" : ""}</span>
                {ind.enabled && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.accent, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: "2px 7px" }}>
                    {(ind.baseValue ?? 0).toFixed(3)} → {effectiveValue.toFixed(3)}
                  </span>
                )}
                {ind.isCustom && (
                  <button onClick={() => removeCustom(name)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 15, padding: "0 3px" }}>✕</button>
                )}
              </div>
              {ind.enabled && (
                <div style={{ paddingLeft: 25, display: "grid", gap: 7 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{allowDecrease ? "Growth / Reduction multiplier" : "Growth multiplier"}</span>
                      <span style={{ fontSize: 10, color: C.textMuted }}>base {(ind.baseValue ?? 0).toFixed(3)}</span>
                    </div>
                    {allowDecrease && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textMuted, marginBottom: 2 }}>
                        <span>← decrease (below 1×)</span><span>increase (above 1×) →</span>
                      </div>
                    )}
                    <MultSlider value={ind.multiplier ?? 1} onChange={v => changeMult(name, v)} color={c.accent} allowDecrease={allowDecrease} />
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Inner weight</span>
                    <WSlider value={ind.weight} onChange={v => changeWeight(name, v)} color={c.accent} disabled={enabledKeys.length < 2} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {adding ? (
          <div style={{ background: C.surfaceAlt, border: `1px dashed ${c.border}`, borderRadius: 9, padding: "11px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: c.text, margin: "0 0 8px" }}>New {label} Indicator</p>
            <div style={{ display: "grid", gap: 7 }}>
              <input placeholder="Indicator name" value={newName} onChange={e => setNewName(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, outline: "none" }} />
              <input placeholder="Normalised value (0–1)" type="number" min={0} max={1} step={0.001} value={newValue} onChange={e => setNewValue(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, outline: "none" }} />
              <div style={{ display: "flex", gap: 7 }}>
                <button onClick={addCustom} style={{ flex: 1, padding: "8px", borderRadius: 7, border: "none", background: c.accent, color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Add</button>
                <button onClick={() => { setAdding(false); setNewName(""); setNewValue(""); }} style={{ flex: 1, padding: "8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "8px", borderRadius: 9, border: `1px dashed ${c.border}`, background: c.bg, color: c.text, fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 2 }}>
            + Add {label} Indicator
          </button>
        )}
      </div>
    </div>
  );
}

// ── Adapt hazard section ──────────────────────────────────────────────────────

function AdaptHazardSection({ hazardCfg, setHazardCfg, startYear, tenure }) {
  const HAZARDS = ["TXX", "RX1Day"];
  const [yearOpts, setYearOpts] = useState({ TXX: [], RX1Day: [] });
  const [loading, setLoading]   = useState({ TXX: false, RX1Day: false });

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
  }, [hazardCfg.TXX?.enabled, hazardCfg.RX1Day?.enabled]);

  function toggle(h) {
    setHazardCfg(prev => {
      const next = { ...prev, [h]: { ...prev[h], enabled: !prev[h].enabled } };
      const enabled = HAZARDS.filter(k => next[k].enabled);
      const w = initEqual(enabled);
      HAZARDS.forEach(k => { next[k] = { ...next[k], weight: enabled.includes(k) ? w[k] : 0 }; });
      return next;
    });
  }

  function changeWeight(h, val) {
    setHazardCfg(prev => {
      const enabled = HAZARDS.filter(k => prev[k].enabled);
      const cur = {}; enabled.forEach(k => { cur[k] = prev[k].weight; });
      const bal = autoBalance(cur, h, val);
      const next = { ...prev };
      enabled.forEach(k => { next[k] = { ...next[k], weight: bal[k] }; });
      return next;
    });
  }

  const enabledCount = HAZARDS.filter(h => hazardCfg[h]?.enabled).length;
  const endYear = startYear && tenure ? startYear + tenure : null;
  const c = COLORS.hazard;

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: c.bg, padding: "9px 13px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: c.header, textTransform: "uppercase", letterSpacing: "0.07em" }}>Hazard</span>
        <span style={{ fontSize: 11, color: c.text, opacity: 0.7 }}>{startYear && endYear ? `Avg ${startYear}–${endYear}` : "Set project years above"}</span>
      </div>
      <div style={{ padding: "12px 13px", background: C.surface }}>
        {(!startYear || !tenure) && (
          <p style={{ fontSize: 12, color: C.textMuted, textAlign: "center", margin: "0 0 10px" }}>Set Start Year and Tenure above first</p>
        )}
        {HAZARDS.map(h => {
          const cfg = hazardCfg[h];
          const validYears = yearOpts[h].filter(y => y >= startYear && y <= endYear);
          return (
            <div key={h} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: cfg.enabled ? 9 : 0 }}>
                <div onClick={() => toggle(h)} style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: `2px solid ${cfg.enabled ? c.accent : C.border}`, background: cfg.enabled ? c.accent : C.surface, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                  {cfg.enabled && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span style={{ fontSize: 13, fontWeight: cfg.enabled ? 700 : 400, color: cfg.enabled ? c.text : C.textSecondary }}>
                  {h === "TXX" ? "TXX (Max Temperature)" : "RX1Day (Max 1-Day Precipitation)"}
                </span>
              </div>
              {cfg.enabled && (
                <div style={{ paddingLeft: 25, display: "grid", gap: 7 }}>
                  {startYear && endYear && (
                    <div style={{ padding: "6px 10px", borderRadius: 7, background: c.bg, border: `1px solid ${c.border}`, fontSize: 12, color: c.text }}>
                      {loading[h] ? "Loading years…" : validYears.length > 0
                        ? `Averaging ${validYears.length} years: ${validYears[0]}–${validYears[validYears.length-1]}`
                        : "⚠ No data in this year range"}
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Inner weight</span>
                    <WSlider value={cfg.weight} onChange={v => changeWeight(h, v)} color={c.accent} disabled={enabledCount < 2} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {enabledCount === 0 && <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0", textAlign: "center" }}>Select at least one hazard indicator</p>}
      </div>
    </div>
  );
}

// ── Project card & compare ────────────────────────────────────────────────────

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
                    <span>• {ind.name}</span>
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

// ── Adaptation Tab ────────────────────────────────────────────────────────────

function AdaptationTab({ province, futureRiskIndex, currentRiskIndex, currentData, outer, setOuter, startYear, setStartYear, tenure, setTenure, hazardCfg, setHazardCfg, expCfg, setExpCfg, vulnCfg, setVulnCfg, result, setResult, projects, setProjects }) {
  const [projName,  setProjName]  = useState("");
  const [calculating, setCalc] = useState(false);
  const [calcError, setErr]   = useState("");
  const [loadMenuOpen, setLoadMenuOpen] = useState(false);

  const baselineRiskIndex = futureRiskIndex ?? currentRiskIndex;

  function loadProjectConfig(p) {
    setOuter({ ...p.savedSettings.outerWeights });
    setStartYear(String(p.startYear));
    setTenure(String(p.tenure));
    const newHazardCfg = { TXX: { enabled: false, weight: 0.5 }, RX1Day: { enabled: false, weight: 0.5 } };
    p.savedSettings.hazardIndicators.forEach(ind => {
      newHazardCfg[ind.name] = { enabled: true, weight: ind.weight };
    });
    setHazardCfg(newHazardCfg);
    setExpCfg(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], enabled: false, weight: 0, multiplier: 1 }; });
      p.savedSettings.exposureIndicators.forEach(ind => {
        if (next[ind.name]) next[ind.name] = { ...next[ind.name], enabled: true, weight: ind.weight, multiplier: ind.multiplier ?? 1 };
      });
      return next;
    });
    setVulnCfg(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], enabled: false, weight: 0, multiplier: 1 }; });
      p.savedSettings.vulnerabilityIndicators.forEach(ind => {
        if (next[ind.name]) next[ind.name] = { ...next[ind.name], enabled: true, weight: ind.weight, multiplier: ind.multiplier ?? 1 };
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
    const eh = ["TXX","RX1Day"].filter(h => hazardCfg[h]?.enabled);
    if (!eh.length) issues.push("Select at least one hazard indicator");
    const ot = outer.hazard + outer.exposure + outer.vulnerability;
    if (Math.abs(ot - 1.0) > 0.02) issues.push(`Outer weights must sum to 1.00 (currently ${ot.toFixed(2)})`);
    const enabledExp  = Object.keys(expCfg).filter(k => expCfg[k]?.enabled);
    const enabledVuln = Object.keys(vulnCfg).filter(k => vulnCfg[k]?.enabled);
    if (!enabledExp.length)  issues.push("Select at least one exposure indicator");
    if (!enabledVuln.length) issues.push("Select at least one vulnerability indicator");
    return issues;
  }

  async function calculate() {
    const issues = validate();
    if (issues.length) { setErr(issues.join(" · ")); return; }
    setErr(""); setCalc(true);
    try {
      const enabledH = ["TXX","RX1Day"].filter(h => hazardCfg[h]?.enabled);
      const enabledExp  = Object.keys(expCfg).filter(k => expCfg[k]?.enabled);
      const enabledVuln = Object.keys(vulnCfg).filter(k => vulnCfg[k]?.enabled);
      const body = {
        province, outerWeights: outer, startYear: sy, endYear,
        hazard: enabledH.map(h => ({ name: h, weight: hazardCfg[h].weight })),
        exposure: enabledExp.map(k => ({ name: k, value: Math.min(1, (expCfg[k].baseValue ?? 0) * (expCfg[k].multiplier ?? 1)), weight: expCfg[k].weight, multiplier: expCfg[k].multiplier ?? 1 })),
        vulnerability: enabledVuln.map(k => ({ name: k, value: Math.min(1, Math.max(0, (vulnCfg[k].baseValue ?? 0) * (vulnCfg[k].multiplier ?? 1))), weight: vulnCfg[k].weight, multiplier: vulnCfg[k].multiplier ?? 1 })),
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
    const hazardIndicators = Object.keys(hazardCfg).filter(k => hazardCfg[k]?.enabled).map(k => ({ name: k, weight: hazardCfg[k].weight, value: result.breakdown.hazard.items.find(i => i.name === k)?.value || 0 }));
    const exposureIndicators = Object.keys(expCfg).filter(k => expCfg[k]?.enabled).map(k => ({ name: k, weight: expCfg[k].weight, value: Math.min(1, Math.max(0, (expCfg[k].baseValue ?? 0) * (expCfg[k].multiplier ?? 1))), multiplier: expCfg[k].multiplier }));
    const vulnerabilityIndicators = Object.keys(vulnCfg).filter(k => vulnCfg[k]?.enabled).map(k => ({ name: k, weight: vulnCfg[k].weight, value: Math.min(1, Math.max(0, (vulnCfg[k].baseValue ?? 0) * (vulnCfg[k].multiplier ?? 1))), multiplier: vulnCfg[k].multiplier }));
    const savedSettings = { outerWeights: { ...outer }, hazardIndicators, exposureIndicators, vulnerabilityIndicators };
    const projectData = { ...result, name, province, startYear: sy, tenure: tn, endYear, savedSettings };
    setProjects(prev => [...prev, projectData]);
    setProjName("");
    try {
      await fetch(`${API}/save-project`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, province, startYear: sy, endYear, tenure: tn, riskScore: result.riskScore, level: result.level, outerWeights: outer, hazardIndicators, exposureIndicators, vulnerabilityIndicators, breakdown: result.breakdown }) });
    } catch (e) { console.warn("Failed to save project to CSV:", e.message); }
  }

  if (!currentData) return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: C.hazard.text }}>⚠ Load Current Risk first</p>
    </div>
  );

  const issues = validate();

  return (
    <div>
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

      <OuterWeightBar outer={outer} setOuter={setOuter} />

      {issues.length > 0 && (
        <div style={{ padding: "11px 14px", borderRadius: 10, background: "#FDF6EE", border: `1px solid ${C.hazard.border}`, marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.hazard.text, margin: "0 0 4px" }}>⚠ Fix before calculating</p>
          {issues.map((iss, i) => <p key={i} style={{ fontSize: 12, color: C.hazard.text, margin: "2px 0 0", opacity: 0.8 }}>· {iss}</p>)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 20, alignItems: "start" }}>
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>Configure Indicators</h3>
          <AdaptHazardSection hazardCfg={hazardCfg} setHazardCfg={setHazardCfg} startYear={sy} tenure={tn} />
          <AdaptIndicatorSection type="exposure"      cfg={expCfg}  setCfg={setExpCfg} />
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
          {projects.map((p, i) => <ProjectCard key={i} project={p} baselineRiskIndex={baselineRiskIndex} />)}
        </div>
      )}
    </div>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

function SummaryTab({ currentData, futureResult, adaptProjects, currentRiskIndex }) {
  const hasCurrentRisk = currentData != null;
  const hasFutureRisk  = futureResult != null;
  const hasProjects    = adaptProjects.length > 0;
  const futureScore    = futureResult?.riskScore ?? null;
  const futureLevel    = futureScore != null ? levelFromScore(futureScore) : null;

  // ── inner helpers ──────────────────────────────────────────────────────────

  function ScoreChip({ score, level }) {
    if (score == null) return <span style={{ fontSize: 11, color: C.textMuted }}>—</span>;
    const ls = LEVEL_STYLE[level || levelFromScore(score)];
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: ls.color, lineHeight: 1 }}>{score.toFixed(3)}</span>
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

  // ── Journey bar ────────────────────────────────────────────────────────────

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

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!hasCurrentRisk) return (
    <div style={{ padding: "60px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◈</div>
      <p style={{ fontSize: 15, fontWeight: 700, color: C.textSecondary, margin: "0 0 6px" }}>No data yet</p>
      <p style={{ fontSize: 13, color: C.textMuted }}>Complete Current Risk, Future Risk, and at least one Adaptation Project to see the summary.</p>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── Journey bar ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>Risk Journey — {currentData.province}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <JourneyCard label="Current Risk" sublabel="2026 baseline" score={currentRiskIndex} level={currentData.level} borderColor={C.stageCurrentBorder} active={true} />
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

      {/* ── Risk Comparison Bar Chart ── */}
      {(hasFutureRisk || hasProjects) && (() => {
        const stages = [
          { label: "Current Risk", score: currentRiskIndex, level: currentData.level, color: C.stageCurrentBorder },
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

      {/* ── Per-stage detail cards ── */}
      {(() => {
        const allStages = [
          {
            id: "current", label: "Current Risk", sublabel: `2026 · ${currentData.province}`,
            score: currentRiskIndex, level: currentData.level, delta: null,
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

        // Responsive: if 1-2 stages → side-by-side; 3+ → single column each in grid
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

      {/* ── Indicator performance table ── */}
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

            // Column definitions
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
              // Reference is previous column that has a value for this indicator
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
                      {/* Component score row */}
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
                      {/* Indicator rows */}
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
  const [sector,      setSector]      = useState("Health");
  const [province,    setProvince]    = useState("Torba");
  const [currentData, setCurrentData] = useState(null);
  const [error,       setError]       = useState("");

  const [futureOuter, setFutureOuter] = useState({ hazard: 0.34, exposure: 0.33, vulnerability: 0.33 });
  const [futureHazardCfg, setFutureHazardCfg] = useState({ TXX: { enabled: false, weight: 0.5, year: null }, RX1Day: { enabled: false, weight: 0.5, year: null } });
  const [futureExpCfg, setFutureExpCfg]   = useState({});
  const [futureVulnCfg, setFutureVulnCfg] = useState({});
  const [futureResult, setFutureResult]   = useState(null);

  const [adaptOuter, setAdaptOuter] = useState({ hazard: 0.34, exposure: 0.33, vulnerability: 0.33 });
  const [adaptStartYear, setAdaptStartYear] = useState("");
  const [adaptTenure, setAdaptTenure]       = useState("");
  const [adaptHazardCfg, setAdaptHazardCfg] = useState({ TXX: { enabled: false, weight: 0.5 }, RX1Day: { enabled: false, weight: 0.5 } });
  const [adaptExpCfg, setAdaptExpCfg]   = useState({});
  const [adaptVulnCfg, setAdaptVulnCfg] = useState({});
  const [adaptResult, setAdaptResult]   = useState(null);
  const [adaptProjects, setAdaptProjects] = useState([]);

  useEffect(() => {
    async function loadData() {
      if (!province) return;
      try {
        setError("");
        const res = await fetch(`${API}/current-risk?province=${encodeURIComponent(province)}`);
        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        setCurrentData(data);
        const ei = data.exposure?.items || [];
        const vi = data.vulnerability?.items || [];
        const ew = initEqual(ei.map(i => i.name));
        const fec = {}; const aec = {};
        ei.forEach(i => {
          fec[i.name] = { enabled: true, weight: ew[i.name], value: i.value };
          aec[i.name] = { enabled: true, weight: ew[i.name], baseValue: i.value ?? 0, multiplier: 1, isCustom: false };
        });
        setFutureExpCfg(fec); setAdaptExpCfg(aec);
        const vw = initEqual(vi.map(i => i.name));
        const fvc = {}; const avc = {};
        vi.forEach(i => {
          fvc[i.name] = { enabled: true, weight: vw[i.name], value: i.value };
          avc[i.name] = { enabled: true, weight: vw[i.name], baseValue: i.value ?? 0, multiplier: 1, isCustom: false };
        });
        setFutureVulnCfg(fvc); setAdaptVulnCfg(avc);
        setFutureResult(null); setAdaptResult(null);
      } catch {
        setError("Failed to load risk data.");
        setCurrentData(null);
      }
    }
    loadData();
  }, [province]);

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
      <div style={{ background: C.navy, borderBottom: `1px solid ${C.navyLight}`, padding: "0 0 0 0", position: "sticky", top: 0, zIndex: 200 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "18px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "white", letterSpacing: "-0.02em", margin: 0 }}>Climate Risk Calculator</h1>
              <p style={{ fontSize: 12, color: "#8AAFD0", margin: "3px 0 0", fontWeight: 400 }}>Vanuatu · Health Sector · Risk Assessment Platform</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minWidth: 340 }}>
              <Dropdown label="Sector"   options={["Health"]} selected={sector}   setSelected={setSector} />
              <Dropdown label="Province" options={["Torba","Sanma","Penama","Malampa","Shefa","Tafea"]} selected={province} setSelected={setProvince} />
            </div>
          </div>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "10px 22px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", background: "transparent", color: activeTab === tab.id ? "white" : "#6A8AAA", borderBottom: activeTab === tab.id ? "2px solid white" : "2px solid transparent", transition: "all 0.15s" }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1160, margin: "22px auto 0", padding: "0 20px" }}>

        {/* Current Risk */}
        {activeTab === "current" && (
          <>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 15px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Current Risk View — 2026</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary }}>Sector: {sector}</span>
            </div>
            {error && <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 9, background: "#FDF2F2", border: `1px solid #E8C0C0`, fontSize: 13, color: "#8B2C2C", fontWeight: 500 }}>⚠ {error}</div>}
            {currentData && (
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1.2fr 0.8fr", alignItems: "start" }}>
                <div style={{ display: "grid", gap: 14 }}>
                  <SectionCard title="Hazard" color={COLORS.hazard}>
                    <div style={{ marginBottom: 9, fontSize: 12, color: C.textSecondary }}>Overall Weight: <b>{currentData.hazard.overallWeight}</b></div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {currentData.hazard.items.map(item => (
                        <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 11px", borderRadius: 8, background: COLORS.hazard.bg, fontSize: 13, border: `1px solid ${COLORS.hazard.border}` }}>
                          <span style={{ color: COLORS.hazard.text, fontWeight: 600 }}>{item.name}</span>
                          <span style={{ color: C.textSecondary }}><b style={{ color: COLORS.hazard.accent }}>{item.value}</b> · weight {item.weight}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                  <SectionCard title="Exposure" color={COLORS.exposure}>
                    <div style={{ marginBottom: 9, fontSize: 12, color: C.textSecondary }}>Overall Weight: <b>{currentData.exposure.overallWeight}</b></div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {currentData.exposure.items.map(item => (
                        <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 11px", borderRadius: 8, background: COLORS.exposure.bg, fontSize: 13, border: `1px solid ${COLORS.exposure.border}` }}>
                          <span style={{ color: COLORS.exposure.text, fontWeight: 600 }}>{item.name}</span>
                          <span style={{ color: C.textSecondary }}><b style={{ color: COLORS.exposure.accent }}>{typeof item.value === "number" ? item.value.toFixed(3) : item.value}</b> · weight {item.weight}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                  <SectionCard title="Vulnerability" color={COLORS.vulnerability}>
                    <div style={{ marginBottom: 9, fontSize: 12, color: C.textSecondary }}>Overall Weight: <b>{currentData.vulnerability.overallWeight}</b></div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {currentData.vulnerability.items.map(item => (
                        <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 11px", borderRadius: 8, background: COLORS.vulnerability.bg, fontSize: 13, border: `1px solid ${COLORS.vulnerability.border}` }}>
                          <span style={{ color: COLORS.vulnerability.text, fontWeight: 600 }}>{item.name}</span>
                          <span style={{ color: C.textSecondary }}><b style={{ color: COLORS.vulnerability.accent }}>{typeof item.value === "number" ? item.value.toFixed(3) : item.value}</b> · weight {item.weight}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
                <div style={{ position: "sticky", top: 100, alignSelf: "start" }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Risk Index 2026</div>
                    <div style={{ fontSize: 52, fontWeight: 800, color: C.textPrimary, lineHeight: 1, marginBottom: 12 }}>{currentData.riskIndex ?? "—"}</div>
                    <LevelBadge level={currentData.level} />
                    <div style={{ width: "100%", maxWidth: 160, marginTop: 16 }}>
                      <div style={{ height: 5, borderRadius: 99, background: C.borderLight, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(currentData.riskIndex || 0) * 100}%`, background: `linear-gradient(90deg,${C.vulnerability.accent},${C.hazard.accent})`, borderRadius: 99 }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                        <span style={{ fontSize: 9, color: C.textMuted }}>0</span><span style={{ fontSize: 9, color: C.textMuted }}>1</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Future Risk */}
        {activeTab === "future" && (
          <FutureRiskTab
            province={province}
            currentRiskIndex={currentData?.riskIndex ?? null}
            currentData={currentData}
            outer={futureOuter} setOuter={setFutureOuter}
            hazardCfg={futureHazardCfg} setHazardCfg={setFutureHazardCfg}
            expCfg={futureExpCfg} setExpCfg={setFutureExpCfg}
            vulnCfg={futureVulnCfg} setVulnCfg={setFutureVulnCfg}
            result={futureResult} setResult={setFutureResult}
          />
        )}

        {/* Adaptation Projects */}
        {activeTab === "adaptation" && (
          <AdaptationTab
            province={province}
            futureRiskIndex={futureResult?.riskScore ?? null}
            currentRiskIndex={currentData?.riskIndex ?? null}
            currentData={currentData}
            outer={adaptOuter} setOuter={setAdaptOuter}
            startYear={adaptStartYear} setStartYear={setAdaptStartYear}
            tenure={adaptTenure} setTenure={setAdaptTenure}
            hazardCfg={adaptHazardCfg} setHazardCfg={setAdaptHazardCfg}
            expCfg={adaptExpCfg} setExpCfg={setAdaptExpCfg}
            vulnCfg={adaptVulnCfg} setVulnCfg={setAdaptVulnCfg}
            result={adaptResult} setResult={setAdaptResult}
            projects={adaptProjects} setProjects={setAdaptProjects}
          />
        )}

        {/* Summary */}
        {activeTab === "summary" && (
          <SummaryTab
            currentData={currentData}
            currentRiskIndex={currentData?.riskIndex ?? null}
            futureResult={futureResult}
            adaptProjects={adaptProjects}
          />
        )}

      </div>
    </div>
  );
}