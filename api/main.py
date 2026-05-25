# API Backend for Climate Risk Calculator
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Any, Dict, Optional
import pandas as pd
import os
import csv
import json
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CURRENT_RISK_FILE = os.path.join(BASE_DIR, "Risk Index 2026.xlsx")
TXX_FILE    = os.path.join(BASE_DIR, "TXX.csv")
RX1DAY_FILE = os.path.join(BASE_DIR, "RX1DAY.csv")  

df_current = pd.read_excel(CURRENT_RISK_FILE)

def _load_csv(path: str, label: str) -> pd.DataFrame | None:
    if not os.path.exists(path):
        print(f"[WARNING] {label} file not found: {path}")
        return None
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]
    return df

df_txx    = _load_csv(TXX_FILE,    "TXX")
df_rx1day = _load_csv(RX1DAY_FILE, "RX1Day")

HAZARD_REGISTRY = {
    "TXX":    (df_txx,    "normallized_TXX"),
    "RX1Day": (df_rx1day, "normallized_RX1Day"),
}

def safe_float(value):
    try:
        return None if pd.isna(value) else float(value)
    except Exception:
        return None

def level_from_score(score: float) -> str:
    if score < 0.20: return "Low"
    if score < 0.40: return "Moderate"
    if score < 0.60: return "High"
    if score < 0.80: return "Very High"
    return "Extreme"

@app.get("/current-risk")
def current_risk(province: str = Query(...)):
    match = df_current[df_current["Province"] == province]
    if match.empty:
        raise HTTPException(status_code=404, detail="Province not found")
    row = match.iloc[0]

    return {
        "province":  row["Province"],
        "riskIndex": safe_float(row["Risk_2026"]),
        "level":     row["Level"],
        "hazard": {
            "overallWeight": 0.34,
            "items": [
                {"name": "TXX",    "value": 0.381, "weight": 0.50},
                {"name": "RX1Day", "value": 0.252, "weight": 0.50},
            ],
        },
        "exposure": {
            "overallWeight": 0.33,
            "items": [
                {"name": "Total Population", "value": safe_float(row.get("Total Poulation")), "weight": 0.34},
                {"name": "Males",            "value": safe_float(row.get("Males")),           "weight": 0.33},
                {"name": "Females",          "value": safe_float(row.get("Females")),         "weight": 0.33},
            ],
        },
        "vulnerability": {
            "overallWeight": 0.33,
            "items": [
                {"name": "LFPR",                "value": safe_float(row.get("LFPR")),                "weight": 0.25},
                {"name": "Unemployment Rate",   "value": safe_float(row.get("Unemployment Rate")),   "weight": 0.25},
                {"name": "Piped Water Shared",  "value": safe_float(row.get("Piped Water Shared")),  "weight": 0.25},
                {"name": "Piped Water Private", "value": safe_float(row.get("Piped Water Private")), "weight": 0.25},
            ],
        },
    }

@app.get("/provinces")
def provinces():
    return {"provinces": df_current["Province"].dropna().tolist()}

@app.get("/future-risk/years")
def future_risk_years(hazard: str = Query(..., description="'TXX' or 'RX1Day'")):
    entry = HAZARD_REGISTRY.get(hazard)
    if entry is None:
        raise HTTPException(status_code=400, detail=f"Unknown hazard '{hazard}'.")
    df, _ = entry
    if df is None:
        raise HTTPException(status_code=503, detail=f"Hazard file for '{hazard}' not loaded.")
    years = sorted(df["time"].dropna().unique().astype(int).tolist())
    return {"hazard": hazard, "years": years}

class HazardItem(BaseModel):
    name:   str
    year:   int
    weight: float

class IndicatorItem(BaseModel):
    name:   str
    value:  float
    weight: float

class OuterWeights(BaseModel):
    hazard:        float
    exposure:      float
    vulnerability: float

class FutureRiskRequest(BaseModel):
    province:      str
    outerWeights:  OuterWeights
    hazard:        List[HazardItem]
    exposure:      List[IndicatorItem]
    vulnerability: List[IndicatorItem]

@app.post("/future-risk")
def future_risk(req: FutureRiskRequest):
    ow = req.outerWeights
    outer_total = ow.hazard + ow.exposure + ow.vulnerability
    if abs(outer_total - 1.0) > 0.05:
        raise HTTPException(status_code=400, detail=f"Outer weights must sum to 1.0")

    h_score = 0.0
    hazard_items_out = []

    for item in req.hazard:
        entry = HAZARD_REGISTRY.get(item.name)
        if entry is None: raise HTTPException(status_code=400, detail=f"Unknown hazard '{item.name}'")
        df, val_col = entry
        if df is None: raise HTTPException(status_code=503, detail=f"Hazard file not loaded.")

        row = df[df["time"] == item.year]
        if row.empty: raise HTTPException(status_code=404, detail=f"No data for year {item.year}.")

        value = float(row.iloc[0][val_col])
        h_score += value * item.weight
        hazard_items_out.append({
            "name":   item.name,
            "year":   item.year,
            "value":  round(value, 6),
            "weight": item.weight,
        })

    e_score = 0.0
    exp_items_out = []
    for item in req.exposure:
        e_score += item.value * item.weight
        exp_items_out.append({"name": item.name, "value": item.value, "weight": item.weight})

    v_score = 0.0
    vuln_items_out = []
    for item in req.vulnerability:
        v_score += item.value * item.weight
        vuln_items_out.append({"name": item.name, "value": item.value, "weight": item.weight})

    risk_score = h_score * ow.hazard + e_score * ow.exposure + v_score * ow.vulnerability
    risk_score = round(min(1.0, max(0.0, risk_score)), 6)

    return {
        "province":  req.province,
        "riskScore": risk_score,
        "level":     level_from_score(risk_score),
        "breakdown": {
            "hazard": { "score": round(h_score, 6), "outerWeight": ow.hazard, "contribution": round(h_score * ow.hazard, 6), "items": hazard_items_out },
            "exposure": { "score": round(e_score, 6), "outerWeight": ow.exposure, "contribution": round(e_score * ow.exposure, 6), "items": exp_items_out },
            "vulnerability": { "score": round(v_score, 6), "outerWeight": ow.vulnerability, "contribution": round(v_score * ow.vulnerability, 6), "items": vuln_items_out },
        },
    }

PROJECTS_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "adaptation_projects.csv")

PROJECTS_CSV_HEADERS = [
    "saved_at", "project_name", "province", "start_year", "end_year", "tenure",
    "risk_score", "risk_level",
    "outer_weight_hazard", "outer_weight_exposure", "outer_weight_vulnerability",
    "hazard_score", "hazard_contribution",
    "hazard_indicators",        # JSON string
    "exposure_score", "exposure_contribution",
    "exposure_indicators",      # JSON string
    "vulnerability_score", "vulnerability_contribution",
    "vulnerability_indicators", # JSON string
]

class SaveProjectIndicator(BaseModel):
    name:       str
    value:      float
    weight:     float
    multiplier: Optional[float] = None

class SaveProjectOuterWeights(BaseModel):
    hazard:        float
    exposure:      float
    vulnerability: float

class SaveProjectRequest(BaseModel):
    name:                    str
    province:                str
    startYear:               int
    endYear:                 int
    tenure:                  int
    riskScore:               float
    level:                   str
    outerWeights:            SaveProjectOuterWeights
    hazardIndicators:        List[SaveProjectIndicator]
    exposureIndicators:      List[SaveProjectIndicator]
    vulnerabilityIndicators: List[SaveProjectIndicator]
    breakdown:               Dict[str, Any]

@app.post("/save-project")
def save_project(req: SaveProjectRequest):
    """Append a saved adaptation project to the CSV log."""
    file_exists = os.path.isfile(PROJECTS_CSV)

    bd = req.breakdown
    row = {
        "saved_at":                        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "project_name":                    req.name,
        "province":                        req.province,
        "start_year":                      req.startYear,
        "end_year":                        req.endYear,
        "tenure":                          req.tenure,
        "risk_score":                      round(req.riskScore, 6),
        "risk_level":                      req.level,
        "outer_weight_hazard":             req.outerWeights.hazard,
        "outer_weight_exposure":           req.outerWeights.exposure,
        "outer_weight_vulnerability":      req.outerWeights.vulnerability,
        "hazard_score":                    round(bd.get("hazard", {}).get("score", 0), 6),
        "hazard_contribution":             round(bd.get("hazard", {}).get("contribution", 0), 6),
        "hazard_indicators":               json.dumps([i.dict() for i in req.hazardIndicators]),
        "exposure_score":                  round(bd.get("exposure", {}).get("score", 0), 6),
        "exposure_contribution":           round(bd.get("exposure", {}).get("contribution", 0), 6),
        "exposure_indicators":             json.dumps([i.dict() for i in req.exposureIndicators]),
        "vulnerability_score":             round(bd.get("vulnerability", {}).get("score", 0), 6),
        "vulnerability_contribution":      round(bd.get("vulnerability", {}).get("contribution", 0), 6),
        "vulnerability_indicators":        json.dumps([i.dict() for i in req.vulnerabilityIndicators]),
    }

    with open(PROJECTS_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=PROJECTS_CSV_HEADERS)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)

    return {"status": "saved", "file": PROJECTS_CSV, "project": req.name}


class AdaptHazardItem(BaseModel):
    name:   str
    weight: float

class AdaptIndicatorItem(BaseModel):
    name:       str
    value:      float
    weight:     float
    multiplier: float = 1.0

class AdaptationRiskRequest(BaseModel):
    province:      str
    outerWeights:  OuterWeights
    startYear:     int
    endYear:       int
    hazard:        List[AdaptHazardItem]
    exposure:      List[AdaptIndicatorItem]
    vulnerability: List[AdaptIndicatorItem]

@app.post("/adaptation-risk")
def adaptation_risk(req: AdaptationRiskRequest):
    ow = req.outerWeights
    outer_total = ow.hazard + ow.exposure + ow.vulnerability
    if abs(outer_total - 1.0) > 0.05:
        raise HTTPException(status_code=400, detail="Outer weights must sum to 1.0")

    if req.startYear >= req.endYear:
        raise HTTPException(status_code=400, detail="endYear must be greater than startYear")

    h_score = 0.0
    hazard_items_out = []

    for item in req.hazard:
        entry = HAZARD_REGISTRY.get(item.name)
        if entry is None: raise HTTPException(status_code=400, detail=f"Unknown hazard '{item.name}'")
        df, val_col = entry
        if df is None: raise HTTPException(status_code=503, detail="Hazard file not loaded.")

        mask = (df["time"] >= req.startYear) & (df["time"] <= req.endYear)
        subset = df[mask]
        if subset.empty: raise HTTPException(status_code=404, detail="No data within range.")

        avg_value = float(subset[val_col].mean())
        h_score  += avg_value * item.weight
        hazard_items_out.append({
            "name":      item.name,
            "startYear": req.startYear,
            "endYear":   req.endYear,
            "nYears":    len(subset),
            "value":     round(avg_value, 6),
            "weight":    item.weight,
        })

    e_score = 0.0
    exp_items_out = []
    for item in req.exposure:
        e_score += item.value * item.weight
        exp_items_out.append({
            "name": item.name, "value": item.value,
            "weight": item.weight, "multiplier": item.multiplier,
        })

    v_score = 0.0
    vuln_items_out = []
    for item in req.vulnerability:
        v_score += item.value * item.weight
        vuln_items_out.append({
            "name": item.name, "value": item.value,
            "weight": item.weight, "multiplier": item.multiplier,
        })

    risk_score = h_score * ow.hazard + e_score * ow.exposure + v_score * ow.vulnerability
    risk_score = round(min(1.0, max(0.0, risk_score)), 6)

    return {
        "province":  req.province,
        "riskScore": risk_score,
        "level":     level_from_score(risk_score),
        "startYear": req.startYear,
        "endYear":   req.endYear,
        "breakdown": {
            "hazard": { "score": round(h_score, 6), "outerWeight": ow.hazard, "contribution": round(h_score * ow.hazard, 6), "items": hazard_items_out },
            "exposure": { "score": round(e_score, 6), "outerWeight": ow.exposure, "contribution": round(e_score * ow.exposure, 6), "items": exp_items_out },
            "vulnerability": { "score": round(v_score, 6), "outerWeight": ow.vulnerability, "contribution": round(v_score * ow.vulnerability, 6), "items": vuln_items_out },
        },
    }