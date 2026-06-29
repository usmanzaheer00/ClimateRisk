"""
Climate Risk Calculator — FastAPI Backend
Reads indicator data from Indicators_Data_Updated.csv
Updated to support:
  - Exposure:      Total_Population, Age, exposure_indicator_3 … exposure_indicator_10
  - Vulnerability: LFPR_Overall, Unemployement_Rate, Piped_Shared_Water,
                   Piped_Private_Water, vulnerability_indicator_5 … vulnerability_indicator_10
"""

from __future__ import annotations

import csv
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE_DIR   = Path(__file__).parent
CSV_PATH   = BASE_DIR / "Indicators_Data_Updated.csv"
PROJ_PATH  = BASE_DIR / "projects.json"
# ── FastAPI setup ─────────────────────────────────────────────────────────────

app = FastAPI(title="Climate Risk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── CSV column definitions ────────────────────────────────────────────────────

# Each entry: (display_name, normalized_column_in_csv)
EXPOSURE_COLS: list[tuple[str, str]] = [
    ("Total_Population",       "Normalized_Total_Population"),
    ("Age",                    "Normalized_Age"),
    ("exposure_indicator_3",   "Normalized_exposure_indicator_3"),
    ("exposure_indicator_4",   "Normalized_exposure_indicator_4"),
    ("exposure_indicator_5",   "Normalized_exposure_indicator_5"),
    ("exposure_indicator_6",   "Normalized_exposure_indicator_6"),
    ("exposure_indicator_7",   "Normalized_exposure_indicator_7"),
    ("exposure_indicator_8",   "Normalized_exposure_indicator_8"),
    ("exposure_indicator_9",   "Normalized_exposure_indicator_9"),
    ("exposure_indicator_10",  "Normalized_exposure_indicator_10"),
]

VULNERABILITY_COLS: list[tuple[str, str]] = [
    ("LFPR_Overall",                   "Normalized_LFPR"),
    ("Unemployement_Rate",             "Normalized_Unemployment_Rate"),
    ("Piped_Shared_Water",             "Normalized_Piped_Shared_Water"),
    ("Piped_Private_Water",            "Normalized_Piped_Private_Water"),
    ("vulnerability_indicator_5",      "Normalized_vulnerability_indicator_5"),
    ("vulnerability_indicator_6",      "Normalized_vulnerability_indicator_6"),
    ("vulnerability_indicator_7",      "Normalized_vulnerability_indicator_7"),
    ("vulnerability_indicator_8",      "Normalized_vulnerability_indicator_8"),
    ("vulnerability_indicator_9",      "Normalized_vulnerability_indicator_9"),
    ("vulnerability_indicator_10",     "Normalized_vulnerability_indicator_10"),
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(val: str, default: float = 0.0) -> float:
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _equal_weights(n: int) -> list[float]:
    if n == 0:
        return []
    base = round(1.0 / n, 2)
    weights = [base] * n
    weights[-1] = round(1.0 - base * (n - 1), 2)
    return weights


def _load_csv() -> dict[str, dict[str, str]]:
    """Return {region_name: {col: value}} from the indicators CSV."""
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")
    data: dict[str, dict[str, str]] = {}
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            region = row["Region"].strip()
            data[region] = {k.strip(): v.strip() for k, v in row.items()}
    return data


def _level_from_score(score: float) -> str:
    if score < 0.20:
        return "Low"
    if score < 0.40:
        return "Moderate"
    if score < 0.60:
        return "High"
    if score < 0.80:
        return "Very High"
    return "Extreme"


def _load_projects() -> list[dict]:
    if PROJ_PATH.exists():
        with open(PROJ_PATH, encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    return []


def _save_projects(projects: list[dict]) -> None:
    with open(PROJ_PATH, "w", encoding="utf-8") as f:
        json.dump(projects, f, indent=2)


# ── Hazard data — Hazard1.csv (TXX) and Hazard2.csv (RX1Day) ────────────────
# Hazard1.csv columns: time, tasmax, tasmax_c, normallized_TXX
# Hazard2.csv columns: time, highest_one_day_precipitation_amount_per_time_period, normallized_RX1Day
# Both are global time-series (1980–2099), no province column.

HAZ1_CSV = BASE_DIR / "Hazard1.csv"
HAZ2_CSV = BASE_DIR / "Hazard2.csv"

# {year: normalized_value}
HAZARD1_DATA: dict[int, float] = {}
HAZARD2_DATA: dict[int, float] = {}


def _load_hazard1() -> dict[int, float]:
    result: dict[int, float] = {}
    if not HAZ1_CSV.exists():
        return result
    with open(HAZ1_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                year = int(float(row["time"]))
                val  = _safe_float(row.get("normallized_TXX", "0"))
                result[year] = val
            except (ValueError, KeyError):
                continue
    return result


def _load_hazard2() -> dict[int, float]:
    result: dict[int, float] = {}
    if not HAZ2_CSV.exists():
        return result
    with open(HAZ2_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                year = int(float(row["time"]))
                val  = _safe_float(row.get("normallized_RX1Day", "0"))
                result[year] = val
            except (ValueError, KeyError):
                continue
    return result


@app.on_event("startup")
async def startup_event() -> None:
    global HAZARD1_DATA, HAZARD2_DATA
    HAZARD1_DATA = _load_hazard1()
    HAZARD2_DATA = _load_hazard2()


def _hazard_years() -> list[int]:
    """All years available across both hazard files."""
    return sorted(set(HAZARD1_DATA.keys()) | set(HAZARD2_DATA.keys()))


def _get_hazard_value(hazard_name: str, year: int) -> float:
    """Return normalized value for a given hazard and exact year."""
    if hazard_name == "Hazard 1":
        return HAZARD1_DATA.get(year, 0.0)
    if hazard_name == "Hazard 2":
        return HAZARD2_DATA.get(year, 0.0)
    return 0.0


def _avg_hazard(hazard_name: str, year_from: int, year_to: int) -> float:
    """Average normalized hazard value over a year range (for adaptation tenure)."""
    data = HAZARD1_DATA if hazard_name == "Hazard 1" else HAZARD2_DATA
    vals = [v for yr, v in data.items() if year_from <= yr <= year_to]
    return sum(vals) / len(vals) if vals else 0.0


# ── Pydantic models ───────────────────────────────────────────────────────────

class HazardItem(BaseModel):
    name: str
    year: int | None = None
    value: float | None = None
    weight: float = 0.5


class IndicatorItem(BaseModel):
    name: str
    value: float = 0.0
    weight: float = 0.0
    multiplier: float | None = None


class FutureRiskRequest(BaseModel):
    province: str
    outerWeights: dict[str, float]
    hazard: list[HazardItem]
    exposure: list[IndicatorItem]
    vulnerability: list[IndicatorItem]
    useBaselineWeights: bool = True


class AdaptationRiskRequest(BaseModel):
    province: str
    outerWeights: dict[str, float]
    startYear: int
    endYear: int
    hazard: list[HazardItem]
    exposure: list[IndicatorItem]
    vulnerability: list[IndicatorItem]
    useBaselineWeights: bool = True


class SaveProjectRequest(BaseModel):
    name: str
    province: str
    startYear: int
    endYear: int
    tenure: int
    riskScore: float
    level: str
    outerWeights: dict[str, float]
    hazardIndicators: list[dict]
    exposureIndicators: list[dict]
    vulnerabilityIndicators: list[dict]
    breakdown: dict


class DeleteProjectRequest(BaseModel):
    savedAt: str = ""
    projectName: str = ""
    province: str = ""
    startYear: int | None = None
    endYear: int | None = None
    tenure: int | None = None


# ── /api/current-risk ─────────────────────────────────────────────────────────

@app.get("/api/current-risk")
def get_current_risk(province: str = Query(...)):
    try:
        csv_data = _load_csv()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    if province not in csv_data:
        available = list(csv_data.keys())
        raise HTTPException(
            status_code=404,
            detail=f"Province '{province}' not found. Available: {available}",
        )

    row = csv_data[province]

    # ── Build exposure items ──────────────────────────────────────────────────
    exp_items = []
    for display_name, norm_col in EXPOSURE_COLS:
        val = _safe_float(row.get(norm_col, "0"))
        exp_items.append({"name": display_name, "value": val, "isCustom": False})

    exp_weights = _equal_weights(len(exp_items))
    for item, w in zip(exp_items, exp_weights):
        item["weight"] = w

    exp_score = sum(i["value"] * i["weight"] for i in exp_items)

    # ── Build vulnerability items ─────────────────────────────────────────────
    vuln_items = []
    for display_name, norm_col in VULNERABILITY_COLS:
        val = _safe_float(row.get(norm_col, "0"))
        vuln_items.append({"name": display_name, "value": val, "isCustom": False})

    vuln_weights = _equal_weights(len(vuln_items))
    for item, w in zip(vuln_items, vuln_weights):
        item["weight"] = w

    vuln_score = sum(i["value"] * i["weight"] for i in vuln_items)

    # ── Hazard values from Hazard1.csv / Hazard2.csv ─────────────────────────
    # Use the most recent available year as the default current-risk value
    all_years  = _hazard_years()
    # Pick latest year ≤ 2026 as "current"; fall back to earliest available
    current_years = [y for y in all_years if y <= 2026]
    default_year  = max(current_years) if current_years else (all_years[0] if all_years else 2025)

    haz_items = [
        {"name": "Hazard 1", "value": _get_hazard_value("Hazard 1", default_year), "weight": 0.5, "isCustom": False},
        {"name": "Hazard 2", "value": _get_hazard_value("Hazard 2", default_year), "weight": 0.5, "isCustom": False},
    ]
    haz_score = sum(i["value"] * i["weight"] for i in haz_items)

    # ── Outer weights (equal split) ───────────────────────────────────────────
    outer_hazard  = round(1 / 3, 2)
    outer_exp     = round(1 / 3, 2)
    outer_vuln    = round(1.0 - outer_hazard - outer_exp, 2)

    risk_score = (
        haz_score  * outer_hazard +
        exp_score  * outer_exp +
        vuln_score * outer_vuln
    )
    risk_score = round(risk_score, 6)

    return {
        "province":  province,
        "riskIndex": risk_score,
        "level":     _level_from_score(risk_score),
        "hazard": {
            "overallWeight": outer_hazard,
            "score":         round(haz_score, 6),
            "items":         haz_items,
        },
        "exposure": {
            "overallWeight": outer_exp,
            "score":         round(exp_score, 6),
            "items":         exp_items,
        },
        "vulnerability": {
            "overallWeight": outer_vuln,
            "score":         round(vuln_score, 6),
            "items":         vuln_items,
        },
    }


# ── /api/future-risk/years ────────────────────────────────────────────────────

@app.get("/api/future-risk/years")
def get_future_years(hazard: str = Query(...)):
    """Return all available years for the requested hazard indicator."""
    if hazard == "Hazard 1":
        years = sorted(HAZARD1_DATA.keys())
    elif hazard == "Hazard 2":
        years = sorted(HAZARD2_DATA.keys())
    else:
        years = _hazard_years()
    return {"hazard": hazard, "years": years}


# ── /api/future-risk/value ───────────────────────────────────────────────────

@app.get("/api/future-risk/value")
def get_hazard_value_endpoint(hazard: str = Query(...), year: int = Query(...)):
    """Return the normalized value for a specific hazard and year."""
    val = _get_hazard_value(hazard, year)
    return {"hazard": hazard, "year": year, "value": round(val, 6)}


# ── /api/future-risk ─────────────────────────────────────────────────────────

@app.post("/api/future-risk")
def post_future_risk(body: FutureRiskRequest):
    outer_h = body.outerWeights.get("hazard",        1 / 3)
    outer_e = body.outerWeights.get("exposure",      1 / 3)
    outer_v = body.outerWeights.get("vulnerability", 1 / 3)

    # Hazard score
    haz_result_items = []
    for h in body.hazard:
        if h.name in ("Hazard 1", "Hazard 2") and h.year is not None:
            # Look up the exact year from the hazard CSV
            val = _get_hazard_value(h.name, h.year)
        else:
            val = h.value or 0.0
        haz_result_items.append({"name": h.name, "value": round(val, 6), "weight": h.weight, "year": h.year})

    haz_score = sum(i["value"] * i["weight"] for i in haz_result_items)

    # Exposure score
    exp_result_items = []
    for e in body.exposure:
        val = min(1.0, max(0.0, e.value * (e.multiplier or 1.0)))
        exp_result_items.append({"name": e.name, "value": round(val, 6), "weight": e.weight, "multiplier": e.multiplier})
    exp_score = sum(i["value"] * i["weight"] for i in exp_result_items)

    # Vulnerability score
    vuln_result_items = []
    for v in body.vulnerability:
        val = min(1.0, max(0.0, v.value * (v.multiplier or 1.0)))
        vuln_result_items.append({"name": v.name, "value": round(val, 6), "weight": v.weight, "multiplier": v.multiplier})
    vuln_score = sum(i["value"] * i["weight"] for i in vuln_result_items)

    risk_score = round(haz_score * outer_h + exp_score * outer_e + vuln_score * outer_v, 6)

    return {
        "province":  body.province,
        "riskScore": risk_score,
        "level":     _level_from_score(risk_score),
        "breakdown": {
            "hazard": {
                "outerWeight":  outer_h,
                "score":        round(haz_score, 6),
                "contribution": round(haz_score * outer_h, 6),
                "items":        haz_result_items,
            },
            "exposure": {
                "outerWeight":  outer_e,
                "score":        round(exp_score, 6),
                "contribution": round(exp_score * outer_e, 6),
                "items":        exp_result_items,
            },
            "vulnerability": {
                "outerWeight":  outer_v,
                "score":        round(vuln_score, 6),
                "contribution": round(vuln_score * outer_v, 6),
                "items":        vuln_result_items,
            },
        },
    }


# ── /api/adaptation-risk ──────────────────────────────────────────────────────

@app.post("/api/adaptation-risk")
def post_adaptation_risk(body: AdaptationRiskRequest):
    outer_h = body.outerWeights.get("hazard",        1 / 3)
    outer_e = body.outerWeights.get("exposure",      1 / 3)
    outer_v = body.outerWeights.get("vulnerability", 1 / 3)

    # Hazard — average across startYear..endYear window
    haz_result_items = []
    for h in body.hazard:
        if h.name in ("Hazard 1", "Hazard 2"):
            # Average over the project tenure window
            val = _avg_hazard(h.name, body.startYear, body.endYear)
        else:
            val = h.value or 0.0
        haz_result_items.append({"name": h.name, "value": round(val, 6), "weight": h.weight})

    haz_score = sum(i["value"] * i["weight"] for i in haz_result_items)

    # Exposure
    exp_result_items = []
    for e in body.exposure:
        val = min(1.0, max(0.0, e.value * (e.multiplier or 1.0)))
        exp_result_items.append({"name": e.name, "value": round(val, 6), "weight": e.weight, "multiplier": e.multiplier})
    exp_score = sum(i["value"] * i["weight"] for i in exp_result_items)

    # Vulnerability
    vuln_result_items = []
    for v in body.vulnerability:
        val = min(1.0, max(0.0, v.value * (v.multiplier or 1.0)))
        vuln_result_items.append({"name": v.name, "value": round(val, 6), "weight": v.weight, "multiplier": v.multiplier})
    vuln_score = sum(i["value"] * i["weight"] for i in vuln_result_items)

    risk_score = round(haz_score * outer_h + exp_score * outer_e + vuln_score * outer_v, 6)

    return {
        "province":  body.province,
        "riskScore": risk_score,
        "level":     _level_from_score(risk_score),
        "breakdown": {
            "hazard": {
                "outerWeight":  outer_h,
                "score":        round(haz_score, 6),
                "contribution": round(haz_score * outer_h, 6),
                "items":        haz_result_items,
            },
            "exposure": {
                "outerWeight":  outer_e,
                "score":        round(exp_score, 6),
                "contribution": round(exp_score * outer_e, 6),
                "items":        exp_result_items,
            },
            "vulnerability": {
                "outerWeight":  outer_v,
                "score":        round(vuln_score, 6),
                "contribution": round(vuln_score * outer_v, 6),
                "items":        vuln_result_items,
            },
        },
    }


# ── /api/projects ─────────────────────────────────────────────────────────────

@app.get("/api/projects")
def get_projects():
    return {"projects": _load_projects()}


@app.post("/api/save-project")
def save_project(body: SaveProjectRequest):
    projects = _load_projects()
    saved_at = datetime.utcnow().isoformat()
    project = {
        "savedAt":                 saved_at,
        "name":                    body.name,
        "province":                body.province,
        "startYear":               body.startYear,
        "endYear":                 body.endYear,
        "tenure":                  body.tenure,
        "riskScore":               body.riskScore,
        "level":                   body.level,
        "breakdown":               body.breakdown,
        "savedSettings": {
            "outerWeights":              body.outerWeights,
            "hazardIndicators":          body.hazardIndicators,
            "exposureIndicators":        body.exposureIndicators,
            "vulnerabilityIndicators":   body.vulnerabilityIndicators,
        },
    }
    projects.append(project)
    _save_projects(projects)
    return {"status": "saved", "savedAt": saved_at}


@app.delete("/api/projects")
def delete_project(body: DeleteProjectRequest):
    projects = _load_projects()
    before = len(projects)

    def _matches(p: dict) -> bool:
        if body.savedAt and p.get("savedAt") == body.savedAt:
            return True
        name_match     = (not body.projectName or p.get("name")      == body.projectName)
        prov_match     = (not body.province    or p.get("province")   == body.province)
        start_match    = (body.startYear is None or p.get("startYear") == body.startYear)
        end_match      = (body.endYear   is None or p.get("endYear")   == body.endYear)
        tenure_match   = (body.tenure    is None or p.get("tenure")    == body.tenure)
        return name_match and prov_match and start_match and end_match and tenure_match

    projects = [p for p in projects if not _matches(p)]
    _save_projects(projects)
    return {"status": "deleted", "removed": before - len(projects)}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)