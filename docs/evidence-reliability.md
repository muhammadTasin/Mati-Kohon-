# Evidence and reliability

This prototype has not been tested with farmers or agricultural officers. Its modeled differences must not be presented as measured farm benefits. A hackathon demonstration can still be rigorous about what it knows.

## Reproduce the comparison

Run `npm run evaluate:all` to regenerate all five reports, then `npm test` and `npm run test:evaluation`. The full three-way comparison is `research/evaluation/full_system_comparison.json`. It records current practice, a calendar-only choice measured under the full inputs, and the full model, plus individual GLDAS, current-moisture, IMERG harvest-risk, OPERA and non-NASA SRDI interventions. Its source manifest hashes the engine, input data, contracts, narrator and evaluation code. The short bilingual walkthrough at `/judge/index.html` reads exactly that report from a public cached copy.

The Tanore full model ranks lentil ahead of calendar mustard, but none of the individual release-only NASA removals changes its leader. The haor IMERG removal admits conventional Boro with higher historical rainfall exposure; the full model and calendar both choose early Boro. The coastal change depends on SRDI salinity, which is not NASA evidence. These are interpretable model differences, not proof of a general NASA benefit. Current practice on haor low land is explicitly conventional Boro, not silently replaced with early Boro. Three displayed alternatives there include that rejected comparator and an unranked unplanted reference; three feasible recommendations are not fabricated.

Run `npm run evaluate:decisions`. It writes `research/evaluation/model_comparison.json` for three fixed scenarios: Talanda/Tanore, Khaliajuri and Shyamnagar. Inputs, dates, priorities, displayed alternatives, scenario baselines, evidence provenance and source/code hashes are recorded. No live services or credentials are used. Repeating it on unchanged files produces the same report.

The three scenario baselines are explicitly supplied and must all be represented for the report to pass. Aman followed by winter/summer fallow is now an unranked reference, with zero irrigation and crop return for the absent crops. Aman return uses the same illustrative method as candidate rotations. If its variety is unspecified, BRRI dhan49 is explicitly assumed. Fallow has no fabricated soil/pest scores and cannot become a ranked recommendation. An unsupported summer or monsoon crop is not silently dropped to construct this reference.

Differences in irrigation exclude Aman rescue water, whose season frequency is separate. Adding a winter crop to fallow can increase irrigation; the UI and report show this signed trade-off. All options' reviews use the supplied fallow reference rather than silently comparing with Boro. Income differences remain illustrative, and non-crop costs or benefits of fallow are unknown. These comparisons do not establish real farm benefits.

## Temporal calendar comparison

Run `npm run test:evaluation` and `npm run evaluate:temporal` with Python 3.10+ (standard library only). The versioned rules are in `research/evaluation/temporal_protocol.json`; the report is `research/evaluation/temporal_comparison.json`.

The pilot experiment uses the same fixed calendar-feasible candidates for two selectors. A simple calendar rule chooses the shortest winter field occupancy, breaking ties by earlier Aman field release. A NASA-informed water-only rule first minimizes training-period Aman rescue frequency, then median winter irrigation. It is explicitly not the production seven-dimension ranking. The calendar selector receives no weather/outcome values. The water selector uses 2001–2015, freezes its choice, then evaluates 2016–2024 (nine complete Aman–winter pairs). The stored winter replay lacks 2025–26, so it is excluded, not imputed. Boro has a recorded transplanting date but no sowing window in the release; that missing constraint is reported.

The result for this frozen experiment is the same selection under both rules: dhan71–mustard. It therefore demonstrates no incremental advantage over this calendar rule at this pilot, even if both differ from the Boro comparator. Keep this negative result. Tests deliberately worsen future outcomes to verify that selection stays fixed and unfavorable results remain visible.

The replay and its parameters were developed with knowledge of the broader historical period. This is a retrospective temporal split on simulated outcomes, not a pristine holdout or validation against independent farm observations. Do not present it as predictive accuracy or extrapolate it to the haor/coast.

## Haor seasonal flood audit

Run `npm run evaluate:haor`; `npm run test:evaluation` covers both the temporal comparison and this audit. The versioned `research/evaluation/haor_protocol.json` uses existing rainfall history and FFWC report extractions. Its output, `research/evaluation/haor_evaluation.json`, records input/code hashes, every year contributing to a confusion count, unknown years and all four existing thresholds. Always-watch and never-watch policies make the trade-off visible. No threshold is selected or changed.

The primary count has **seven directly labeled years: four flood and three no-flood years**, with 18 unknown out of 25. At the current 200 mm watch threshold, two flood years are detected (2010, 2017), two are missed (2018, 2019), and none of the three no-flood years is flagged. The 100 mm threshold detects all four labeled flood years but also flags 2014. Unknown years never become true negatives or false positives.

The existing hindcast's eighth label, 2004, is inferred from a comparison in the 2010 report. A separate sensitivity includes it, reproducing three of five flood years at 200 mm. Another sensitivity excludes the broad regional 2019 account. The 2015 report names a June flood; that alone does not establish absence of earlier flooding, so 2015 remains unknown. Source extractions have not been newly audited against the original PDFs in this phase.

These are same-season associations on an already explored series, not held-out forecasts. The historical IMERG Final product and broad regional labels do not establish real-time availability or farm flooding. Arrival dates are unavailable; a detected rain burst could be late. Warning lead time, delivery, avoided crop loss and coastal salinity outcomes remain unvalidated. The warning page now shows the smaller direct sample and the missed years explicitly.

## Assumption checks in the app

Input sensitivity now reruns the complete selector with fixed farmer priorities: irrigation cost +2 BDT/m³, per-crop costs ±5,000 BDT/ha, Aman maturity +7 days, winter duration ±10 days, initial winter soil water 25/75 mm against 50, a combined stress, and coastal EC ±25%. These are transparent engineering ranges, not surveyed farmer ranges or probability distributions. Winter duration changes use average daily water demand and calendar shifts, not a fresh daily-weather/phenology run; Aman rescue and heat frequencies stay fixed. Summer crop records are not incorrectly shifted by winter perturbations.

The response includes each scenario's selected feasible option, modeled demand and return. It reports stable within tested ranges, review required, or insufficient evidence. A changed or infeasible choice, substantial old regional salinity evidence, or a provisional drainage range can withhold `recommendedOptionId`. The API and shared farmer-narration path always run this check. The narrator then gives a review request instead of a planting instruction. This does not claim that every other application alert is a field-validated instruction.

The older score-neutralization view remains as a separate diagnostic:

The comparison screen shows whether the highest weighted score changes when income, soil practice, all four heuristic dimensions, or water/heat differences are neutralized. Each selected dimension becomes 0.5 for every displayed option. Farmer priorities, weights and the shortlist stay fixed. Dimensions with zero weight or disabled plugins are skipped. Scores within 0.001 are treated as tied.

These checks identify dependence on scores. They do not rerun crop generation, weather, yields or market prices; they cannot establish NASA's total added value. Crop requests and constraints can affect the displayed order independently of weighted scores. Stability across these checks is not a probability of success, and does not establish robustness to untested assumptions.

## Current observations

The engine independently screens soil and rain (at most 7 days old), disease weather (7), field conditions (2), flood extent and recession endpoint (21). Invalid, missing and future dates fail the check. Mixed-sensor recession slopes are excluded. A drainage range must have ordered valid dates from today through 45 days ahead; invalid or expired ranges cannot change crop feasibility. These cutoffs are operational policy, not accuracy estimates or a guarantee that a field remains unchanged. Dates use the UTC calendar day. A forecast must begin today or tomorrow to supply forward-looking instructions; an expired forecast and its future paddy-dry series are excluded.

Fresh soil moisture does not make an old rainfall series current. A stale radar recession series is not attached to a newer optical reading. Excluded advice inputs are listed in `stale_or_missing_inputs`; the historical replay remains available. The public map uses the same cutoffs for current soil, rain, disease and field-alert values; expired readings become unavailable, not a current instruction. Raw single-upazila observations remain accessible with dates and ages. Field conditions may contain modeled gap-filling between `observedTo` and `through`, and spatially averaged observations still need field checks.

## Narration

The optional model selects only `{"style":"direct"}` or `{"style":"warm"}`. It receives no farmer/place/agricultural facts and cannot author agricultural advice. Dates, units, crops, amounts, actions and the English translation come from the same approved templates. Extra fields, free text, invalid styles, unavailable providers and timeouts fall back to the direct template. The compatibility status `local_model_checked` now means a validated style choice, not factual validation by a model.

The audit checks whole-message membership in the approved set, as well as numbers and prohibited terms. Matching numbers alone cannot approve changed units, reversed actions, changed crops or false assurances. Template integrity does not validate the scientific inputs; narration identifies irrigation as a model estimate.

## Claims to use in a demonstration

The machine-readable `docs/claims-register.json` records 18 headline/output claims with calculation, repository sources, assumptions, allowed wording and prohibited wording. Tests check source existence, required fields and report hashes. This is traceability, not independent scientific certification.

- Soil: a rule-based practice score with SRDI inputs where available, not a measured soil-health outcome.
- Water: modeled irrigation demand differences, not proven groundwater retained. The district storage/irrigation volume comparison does not model recharge, return flows, irrigation source or other withdrawals; it cannot predict aquifer recovery.
- Haor: modeled crop choices and rainfall-threshold checks on a small historical sample, not field-validated flood forecasts. The new drainage backtest is described below; independent field planting dates remain unavailable.
- River erosion: static authored demonstration values, not a live satellite or gauge feed. The example-label date is 7 November 2026, while observation dates and per-value source references are explicitly null. That labeling date is not an observation date.
- Income: illustrative estimates; farmer costs remain unverified.
- Coverage: district weather replays combined with upazila context, not independently observed weather at every farm.

## Evidence still needed

The next research milestone is independent outcome validation and temporal comparisons beyond Tanore, including historical stress events where calendar-only decisions may fail. Report irrigation-demand errors against independent observations where available, flood alert precision/recall with event counts, drainage-date errors, and failure cases. Reserve new cases before further tuning; the retrospective experiment above is not a replacement for that. A small farmer/officer comprehension exercise would test whether the message is understood, without being represented as an adoption or yield trial.

## Drainage-to-planting backtest

`npm run evaluate:drainage` replays every stored October–December origin using only observations available by that date. Same-sensor peak-to-latest and recent-trend forecasts are compared with later observations bracketing the below-5% regional water threshold and with a last-year recession-date proxy. The last-year proxy uses a different water definition and sensor; it cannot support a fair same-target improvement claim. A prediction inside the wet/dry observation interval has zero interval error, not an exact date hit. Missing later crossings are censored, never counted as success. Overlapping origins are not independent events.

The five fixed pilot sites yield 16 origins but no evaluable future crossing for any policy. The explicitly post-hoc exploration across all 544 locations has 49 origins evaluable by all three policies. Mean absolute distance outside the observation interval is 3.65 days for peak-to-latest, 2.88 for recent trend, and 28.08 for the non-equivalent last-year proxy. The peak method does not outperform recent trend here. Different unpaired sample counts are also reported, and must not be compared as though they were the same cohort. These results depend on the committed water-history snapshot made 30 October 2026, not current observations or observed farm planting.

The live acquisition pipeline and backtest share `research/live/drainage.py`. It rejects mixed sensors, recent rises and stale observations, and never reads future rows. Where both methods produce dates, it exposes their envelope widened by the observation gap (capped at 14 days), within a 45-day horizon. This is not a calibrated confidence interval. The later endpoint sets provisional low-land readiness in the crop selector, separately from historical OPERA context; the farmer-facing response requires field checks. Current stored observations retain their original dates; code changes do not fabricate new satellite readings.

## Judge walkthrough and offline behavior

The landing page links directly to `/judge/index.html`. It presents one illustrative farmer, stated current rotation, three alternatives, source removals, trade-offs, review rehearsal and the controlled Bangla message with English translation. Checkboxes acknowledge review requirements; they do not claim an inspection, authorize planting or send a message. Bangla speech uses a device voice when available, with a readable/downloadable transcript when unavailable. After one successful online load, a service worker scoped only to `/judge/` saves the walkthrough and dated report for offline replay. The normal app and its private data are not cached by this worker. Cattle, chat and erosion are outside this focused flow; Rongu is hidden during full-app crop comparisons.

Development before presentation is documented in `docs/AI_USE.md`. No competition outcome or organizer approval is claimed.
