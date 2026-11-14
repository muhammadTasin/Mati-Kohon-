"""Offline temporal comparison of fixed-calendar and NASA-water policies. Standard library only.

Selectors are separate from evaluation. The calendar policy receives only explicit calendar metadata;
the water policy receives only training rows. Test-period metrics never select or tune a rotation.
This is a retrospective comparison on simulated outcomes, not external scientific validation.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
from datetime import date
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def year_day(md: str) -> int:
    month, day = map(int, md.split('-'))
    return (date(2001 if month >= 7 else 2002, month, day) - date(2001, 7, 1)).days


def feasible_candidates(candidates: list[dict]) -> list[dict]:
    return [c for c in candidates if year_day(c['amanReady']) <= year_day(c['winterSow'])
            and (c['sowingWindow'] is None or year_day(c['sowingWindow'][0]) <= year_day(c['winterSow']) <= year_day(c['sowingWindow'][1]))]


def select_calendar(candidates: list[dict]) -> str:
    # The type boundary matters: this function has no replay, scores, or train/test outcomes.
    if not candidates:
        raise ValueError('No common calendar-feasible candidates')
    return min(candidates, key=lambda c: (year_day(c['winterHarvest']) - year_day(c['winterSow']),
                                         year_day(c['amanReady']), c['id']))['id']


def load_outcomes(aman_file: Path, winter_file: Path) -> tuple[dict, dict]:
    def read(file: Path, key_name: str, value_name: str, boolean=False) -> dict:
        result = {}
        with file.open(encoding='utf-8', newline='') as stream:
            for row in csv.DictReader(stream):
                key = (row[key_name], int(row['season'][:4]))
                if key in result:
                    raise ValueError(f'Duplicate season: {key}')
                raw = row[value_name].strip()
                if boolean:
                    if raw not in ('True', 'False'):
                        raise ValueError(f'Invalid rescue indicator: {key}')
                    value = int(raw == 'True')
                else:
                    value = float(raw)
                    if not math.isfinite(value) or value < 0:
                        raise ValueError(f'Invalid irrigation: {key}')
                result[key] = value
        return result
    return (read(aman_file, 'variety', 'needs_rescue_irrigation', True),
            read(winter_file, 'crop', 'net_irrigation_mm'))


def panel(candidates: list[dict], years: list[int], aman: dict, winter: dict) -> dict:
    result = {}
    for c in candidates:
        rows = []
        for year in years:
            akey, wkey = (c['aman'], year), (c['winter'], year)
            if akey not in aman or wkey not in winter:
                raise ValueError(f'Missing complete paired season for {c["id"]}: {year}')
            rows.append({'season': year, 'amanRescue': aman[akey], 'winterNetIrrigationMm': winter[wkey]})
        if not rows:
            raise ValueError('Empty evaluation period')
        result[c['id']] = rows
    return result


def select_water(training_panel: dict) -> str:
    return min(training_panel, key=lambda key: (
        mean(r['amanRescue'] for r in training_panel[key]),
        median(r['winterNetIrrigationMm'] for r in training_panel[key]), key))


def summarize(rows: list[dict]) -> dict:
    return {'seasons': len(rows), 'amanRescueSeasons': sum(r['amanRescue'] for r in rows),
            'amanRescueRate': round(mean(r['amanRescue'] for r in rows), 4),
            'winterNetIrrigationMeanMm': round(mean(r['winterNetIrrigationMm'] for r in rows), 2),
            'winterNetIrrigationMedianMm': round(median(r['winterNetIrrigationMm'] for r in rows), 2)}


def compare(protocol: dict, aman: dict, winter: dict) -> dict:
    train = list(range(protocol['trainYears'][0], protocol['trainYears'][1] + 1))
    evaluation = list(range(protocol['evaluationYears'][0], protocol['evaluationYears'][1] + 1))
    if not train or not evaluation or max(train) >= min(evaluation):
        raise ValueError('Training must end before evaluation begins')
    candidates = feasible_candidates(protocol['candidates'])
    calendar_id = select_calendar(candidates)
    training = panel(candidates, train, aman, winter)
    nasa_id = select_water(training)
    # Evaluation is built only after both selections have been frozen.
    test = panel(candidates, evaluation, aman, winter)
    usual_id = protocol['currentPracticeId']
    if usual_id not in test:
        raise ValueError('Current-practice comparator must be in the same feasible set')
    policies = {'calendar_only': calendar_id, 'nasa_water_only': nasa_id, 'usual_practice': usual_id}
    comparisons = []
    for comparator in ['calendar_only', 'usual_practice']:
        other = test[policies[comparator]]
        paired = [{
            'season': n['season'],
            'lessWinterIrrigationMm': round(b['winterNetIrrigationMm'] - n['winterNetIrrigationMm'], 2),
            'fewerAmanRescueEvents': b['amanRescue'] - n['amanRescue'],
        } for n, b in zip(test[nasa_id], other)]
        comparisons.append({'nasaWaterPolicyVs': comparator, 'pairedSeasons': paired,
                            'meanLessWinterIrrigationMm': round(mean(r['lessWinterIrrigationMm'] for r in paired), 2),
                            'totalFewerAmanRescueEvents': sum(r['fewerAmanRescueEvents'] for r in paired)})
    return {
        'schema': 'temporal-model-comparison-v1', 'protocol': protocol,
        'commonFeasibleCandidateIds': [c['id'] for c in candidates],
        'excludedByCalendar': [c['id'] for c in protocol['candidates'] if c not in candidates],
        'unverifiedSowingWindowIds': [c['id'] for c in candidates if c['sowingWindow'] is None],
        'trainingYearsUsed': train, 'evaluationYearsUsed': evaluation,
        'selections': policies,
        'selectionFinding': 'same_choice_as_calendar_no_incremental_advantage' if nasa_id == calendar_id else 'different_choice_requires_tradeoff_review',
        'trainingMetrics': {key: summarize(rows) for key, rows in training.items()},
        'evaluationMetrics': {name: summarize(test[key]) for name, key in policies.items()},
        'pairedComparisons': comparisons,
    }


def main() -> None:
    protocol_file = HERE / 'temporal_protocol.json'
    aman_file = ROOT / 'research/pilots/connect_tanore_aman.csv'
    winter_file = ROOT / 'research/pilots/connect_tanore_rabi.csv'
    protocol = json.loads(protocol_file.read_text(encoding='utf-8'))
    result = compare(protocol, *load_outcomes(aman_file, winter_file))
    inputs = [protocol_file, Path(__file__), aman_file, winter_file, ROOT / 'research/explore/connect_check.py']
    result['inputAndCodeSha256'] = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes().replace(b'\r\n', b'\n')).hexdigest() for p in inputs}  # line endings ignored: Windows and Linux checkouts hash the same
    destination = HERE / 'temporal_comparison.json'
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Training: {len(result["trainingYearsUsed"])} seasons; evaluation: {len(result["evaluationYearsUsed"])} complete paired seasons.')
    for name, selected in result['selections'].items():
        print(f'{name}: {selected}')
    print(result['selectionFinding'])
    print('Saved research/evaluation/temporal_comparison.json. Modeled outcomes; no field-validation claim.')


if __name__ == '__main__':
    main()
