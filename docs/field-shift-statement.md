# Field Shift: the full statement, line by line

The full challenge statement for **Field Shift: Adapting Farms with NASA Data** (NASA Space Apps 2026) was released on 28 October 2026 at <https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/>. Its Resources tab opens on 13 November. This page maps every requirement and suggestion in the statement to where Mati Kohon answers it, and says plainly where it does not yet.

**Status:** **Done** = in the product and covered by tests. **Partial** = in the product, with a limit stated here. **Not yet** = not built, with the reason.

## The challenge in one sentence

> Create a decision-support tool that uses NASA Earth observations along with local soil information, crop characteristics, and farmer priorities to help farmers explore rotation strategies that could strengthen soil health and adapt their farms to changing conditions.

| Part | Where Mati Kohon does it | Status |
|---|---|---|
| NASA Earth observations | 25 seasons of NASA POWER weather and GPM IMERG rain, replayed for every crop at the pilot and the 64 district points. Also SMAP, GLDAS-2.2 (GRACE-assimilated), MODIS NDVI, HLS, OPERA, NISAR and NASADEM. See the dataset table below. | Done |
| Local soil information | SRDI union soil card for the Talanda pilot (fertilizer doses). SRDI Soil Fertility Atlas classes (organic matter, pH) for every upazila; with no soil card, no fertilizer amount is given. | Done |
| Crop characteristics | 22 crop records (`data/crop_choice.ts`, `crop_catalog.ts`), each with: sowing windows; FAO-56 crop coefficients; heat limits; legume, rice and fodder flags. New: FAO-56 rooting depth and the local needs of each crop (machines, buyers, storage, seed, labour, water) in `data/crop_traits.ts`. | Done |
| Farmer priorities | Seven weighted scores: water, heat, flood, soil, fodder, income and pests. The planner has a slider for each, and the farmer's keypad answers set them on a call. | Done |
| Strengthen soil health and adapt to changing conditions | The soil score covers legumes, puddled rice, organic matter and urea load. New: erosion exposure (soil-moving rain on bare soil). Heat, flood and water scores come from the 25-season replay, and the what-if tests a drier or warmer year. | Done |

## Objectives

| Statement | Where | Status |
|---|---|---|
| "an app, model, interactive map, or other decision-support tool" | SAAO dashboard: planner, comparison, evidence, map, calls. Farmer phone app. One-way Bangla advice calls with keypad answers. | Done |
| "SMAP, ECOSTRESS, GPM, Landsat, MODIS, NASA POWER, GRACE and GRACE-FO, and SRTM or other NASA elevation products" | All are used except ECOSTRESS: SMAP L4, GPM IMERG, Landsat via HLS, MODIS NDVI, NASA POWER, GRACE via GLDAS-2.2, NASADEM (SRTM reprocessed). | Partial: ECOSTRESS not yet (see below) |
| "temperature, heat stress, rainfall, soil moisture, evaporation, frost risk, extreme precipitation, vegetation stress, and long-term water trends" | Temperature and heat stress: heat score and the season calendar. Rainfall: water balance. Soil moisture: SMAP, POWER root zone. Evaporation: FAO-56 ET0 and POWER ET. Frost: near-frost nights at 4 °C or less, and cold nights at 10 °C or less. Extreme precipitation: days of 44 mm or more, haor flash floods. Vegetation stress: HLS Aman not green, MODIS NDVI. Long-term water: GRACE/GLDAS groundwater trend and the 25-year trend table. | Done |
| "local soil information, crop characteristics, and farmer priorities — such as water use, forage value, nitrogen-fixing potential, erosion reduction, organic matter improvement, or market suitability" | Water use: water score and ledger. Forage value: fodder score and slider. Nitrogen-fixing: soil score and the crop role. Erosion reduction: soil-moving rain on bare soil and the cover role. Organic matter: soil score with the SRDI atlas. Market suitability: income score plus the farmer's market constraint. | Done (income uses estimates; see gaps) |
| "highlight times when fields are typically bare" | Two views. The season-risk strip under each rotation's timeline marks the bare months and their soil-moving rain. The satellite view is MODIS NDVI by month (2021-25 against 2001-05). | Done |
| "seasons when current crops appear more vulnerable" | The farmer's own rotation gets the same month-by-month flags: heat (36 °C or more), cold (10 °C or less) for rice, near-frost, heavy rain on upland crops, and dry spells for Aman. Example: Boro meets about 31 hot days at Talanda. | Done |
| "rotations that could interrupt pest cycles, reduce water demand, improve infiltration, or add supplemental income" | Pests: pest score (a crop of another family breaks the rice pest cycle). Water: water score and m³/ha saved. Infiltration: deep-rooting crops (FAO-56, 1.5 m or more) and the no-puddled-rice credit. Supplemental income: a third crop in the summer gap. | Done (infiltration is a crop role, not measured) |
| "compare at least three rotation strategies, including the existing rotation" | The farmer says what they grow now (monsoon, winter and summer crop). It is always among the options, marked, and every option is read against it. The engine guarantees at least 3 options. Registered farmers' crops become their rotation automatically. | Done |
| "why it was suggested, what evidence supports it, what benefits it may offer, where information gaps exist, and any risks that would need local review" | Each comparison card has a five-part review, built in `packages/rotation-engine/src/review.ts`: Why it was suggested; Evidence (sources); Possible benefits; Information gaps; Check locally (farmer and officer). | Done |
| "a supportive tool ... does not replace farmer judgment or local agricultural expertise" | A disclaimer above the comparison and in every advice. The SAAO approves every call. The farmer's questions go to the officer. Officer field observations override the defaults. | Done |

## Potential considerations

### Understanding conditions and data

| Statement | Where | Status |
|---|---|---|
| How temperature, soil moisture, rainfall, evaporation and vegetation stress relate to crop vulnerability and soil health | Every score's "Why this score" and the evidence screen. The season calendar shows heat, cold, rain, root-zone wetness and greenness by month. | Done |
| Explain evapotranspiration, soil moisture anomalies, NDVI, frost risk, water-balance indicators | The evidence screen's "Terms and methods in plain words" card, in Bangla and English. It also explains GRACE and heavy rain. | Done |
| How satellite observations differ from ground measurements, and how combining both helps | Glossary section "Satellite against ground measurements". In the product, POWER temperatures are corrected against BMD stations, IMERG is gauge-adjusted, the SRDI soil tests are used, and officer observations override. | Done |

### SI, modelling and data fusion

| Statement | Where | Status |
|---|---|---|
| Compare different SI or statistical approaches | The glossary's methods section compares five approaches: physical accounting for the scores; two trend methods side by side (early/recent means and Theil-Sen with Mann-Kendall); NDVI signal processing; the ML yield test, which found no skill and is reported honestly; and the language model, which only rewords. | Done |
| SI to highlight seasonal transitions, bare-field periods, crop stress | Savitzky-Golay smoothing of MODIS NDVI with peak detection gives crops per year (`national_greenness.py`). Monthly NDVI medians give the green and bare months (`season_calendar.py`). HLS greenness shows crops under stress (`crop_loss.py`). | Done |
| How the model interprets uncertainty; where local expertise is needed | Each score carries a confidence level, measured / modelled / assumed, and a sample flag. Each option's "Information gaps" and "Check locally" lists say what is uncertain. A trend is called clear only at p < 0.05. | Done |
| Harmonise datasets to a common analysis grid | Everything is brought to the upazila (544) and its district point before scoring. The glossary table lists each dataset's native size and how it is used. | Done (point/upazila units, not a raster grid) |
| SMAP, ECOSTRESS LST, GPM, Landsat/MODIS VIs, GEDI biomass and soil data as coherent features | SMAP, GPM, Landsat/MODIS and soil data are used. **ECOSTRESS is not yet used.** **GEDI is not used:** its biomass products are for forest canopy, not field crops. | Partial |

### Rotation strategy exploration

| Statement | Where | Status |
|---|---|---|
| Nutrient cycling, erosion risk, organic matter, pest-cycle disruption, water use, forage, market | Nutrient cycling: soil score, urea ledger and SRDI doses. Erosion: soil-moving rain on bare soil. Organic matter: soil score with the atlas. Pests: pest score with PEST-CHEMGRIDS. Water use: water score. Forage: fodder score. Market: income score and the market constraint. | Done |
| Map rotation ideas to farmer priorities (conserve water, supplemental income, soil structure) | The priority sliders re-rank the options. Each review says which priorities an option leads or trails on, against the farmer's rotation. | Done |
| How nitrogen-fixing, cover, deep-rooting and drought-tolerant crops help soil | Crop-role chips on each option, with explanations on hover. The glossary section "What each crop does for the soil". Dhaincha green manure is suggested where the soil lies bare in the pre-monsoon storms. | Done |

### Geospatial mapping and visualisation

| Statement | Where | Status |
|---|---|---|
| Interactive maps of trends over time (soil moisture, heat waves, water-storage declines) | The map of 544 upazilas includes: change in crops per year (2001-06 to 2021-26); the GRACE groundwater trend; and the dry-season root zone. The 25-year trend table is on the evidence screen. | Partial: no time slider on the map |
| Field-level vulnerabilities: erosion risk, water stress hotspots, frost-prone areas | New map group "Field risks (NASA, 25 years)": spring heat days, winter cold nights (the frost and cold-prone areas), soil-moving rain in the bare pre-monsoon months, and dry-season root-zone wetness (water stress). | Partial: district values, not field pixels |
| Timelines, dataset overlays, scenario sliders for rainfall or temperature | Month timeline with a season-risk strip, overlaid with MODIS NDVI. The what-if sliders change rain by -20 to +20% and warm every day by 0 to 3 °C, showing irrigation, hot days in the field and soil-moving rain for every option. | Done (the what-if is a rough estimate; the 25-season replay is not re-run) |

### Farmer-centred design

| Statement | Where | Status |
|---|---|---|
| Interpretable for farmers with limited technical experience | Bangla-first everywhere. One-way voice calls under a minute, with keypad answers. Plain-language glossary. The farmer app's Today card. | Done |
| Farmers input priorities or constraints (water availability, equipment, market preferences) | Water availability: irrigation yes or no, which drops dry-season rice. Equipment: no machines flags crops needing a thresher or sheller. Market: village only flags crops needing a town market, mill or cold store. Also: crops wanted, the main crop, and crops to avoid. | Done (machines and market flag; they do not re-rank) |
| Remind that the tool supports, not replaces, local expertise | The disclaimer, plus "Check locally (farmer and officer)" on every option. | Done |

## Datasets in the statement

| Dataset | Used for | Where |
|---|---|---|
| SMAP | Root-zone moisture before Rabi sowing; today's soil wetness | `research/explore/soil_moisture.py`, `research/live/` |
| ECOSTRESS | Not yet | — |
| GPM IMERG | Daily rain for the 25-season water balance; heavy and soil-moving rain; haor flash floods | `national_replay.py`, `season_calendar.py`, `daily_update.py` |
| Landsat (HLS) | Aman not green this year; winter cropping | `crop_loss.py`, HLS winter run |
| MODIS | NDVI crops per year and green/bare months; flood imagery | `national_greenness.py`, `season_calendar.py` |
| NASA POWER | Weather for ET0, heat, cold and root-zone wetness | everywhere |
| GRACE / GRACE-FO | Groundwater trend (via GLDAS-2.2, GRACE-assimilated); groundwater budget | `groundwater_budget.py` |
| SRTM / NASA elevation | NASADEM land type per upazila | `research/acquire/landtype_proxy.py` |
| Also | OPERA DSWx, NISAR, SEDAC PEST-CHEMGRIDS, MERRA-2 | flood now, drainage, pesticide estimates |

## Known gaps, honestly

- **ECOSTRESS** (evapotranspiration and the evaporative stress index at 70 m) is named twice in the statement and is not used yet. It would add field-scale water stress for the pilot.
- **Income** uses BBS prices and yields and team cost estimates, not this year's farm-gate prices (DAM's tables come back empty) or farmer cost interviews.
- **Farmer priorities** are defaults until the Talanda interviews; the planner and the keypad let each farmer set their own.
- **Mustard then Boro in one winter** (Mustard-Boro-T.Aman, common in parts of the north) is not modelled: the engine has one winter slot. A farmer who names it sees their rotation without the second winter crop, with a note.
- **Trends:** the station records held here cover about seven years, so the reanalysis trends could not be checked against stations. Most hot-day trends are not significant, and the table says so.
- **What-if:** irrigation moves with crop water use (about 3% per °C) and with the rain while each crop stands (80% usable). Aman rescue water is not in it.

## Files

- `research/explore/season_calendar.py` writes `packages/rotation-engine/src/data/season_calendar.json`: the month-by-month risks, the 25-year trends and the NDVI calendars.
- `packages/rotation-engine/src/review.ts` builds the season risk per rotation, the five-part review and the what-if.
- `packages/rotation-engine/src/data/crop_traits.ts` holds the crop roles and local needs.
- `services/api/src/advice.ts` accepts `currentRotation`, `constraints` and `scenario`. `officer_desk.ts` turns a registered farmer's crops into their rotation.
- `apps/saao-dashboard/public/review.js` draws the review, risk strip, what-if, calendar and trends. The planner inputs, glossary and map layers are in `index.html` and `bd-map.js`.
- Tests: `test_pipeline.ts` TEST 18 and the Field Shift checks in `test_server.js`.
