"""Reproducible audit of seasonal rain thresholds against existing report-derived flood labels.

Standard library only. No calibration, forecast lead-time claim or production threshold change.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
LABELS = {'yes': True, 'late': True, 'short': True, 'no': False,
          'not stated': None, 'not before mid-May': None}


def read_years(file: Path) -> dict:
    with file.open(encoding='utf-8', newline='') as stream:
        result = {}
        for row in csv.DictReader(stream):
            year = int(row['year'])
            if year in result:
                raise ValueError(f'Duplicate year in {file.name}: {year}')
            result[year] = row
        return result


def score(years: list[int], predictions: dict, labels: dict) -> dict:
    buckets = {key: [] for key in ['truePositiveYears', 'falsePositiveYears', 'falseNegativeYears', 'trueNegativeYears']}
    unknown = []
    for year in years:
        label = labels.get(year)
        if label is None:
            unknown.append(year)
            continue
        key = ('truePositiveYears' if label else 'falsePositiveYears') if predictions[year] else (
            'falseNegativeYears' if label else 'trueNegativeYears')
        buckets[key].append(year)
    tp, fp, fn, tn = (len(buckets[k]) for k in buckets)
    ratio = lambda a, b: round(a / b, 4) if b else None
    return {**buckets, 'labeledYears': tp + fp + fn + tn, 'unknownYears': unknown,
            'precision': ratio(tp, tp + fp), 'recall': ratio(tp, tp + fn),
            'falsePositiveRate': ratio(fp, fp + tn),
            'flaggedYearsIncludingUnknown': [y for y in years if predictions[y]],
            'unknownFlaggedYears': [y for y in unknown if predictions[y]]}


def evaluate(protocol: dict, rain_rows: dict, label_rows: dict, indirect_note: dict) -> dict:
    years = list(range(protocol['years'][0], protocol['years'][1] + 1))
    if not years:
        raise ValueError('Empty evaluation period')
    rain, labels, evidence = {}, {}, []
    for year in years:
        if year not in rain_rows:
            raise ValueError(f'Missing rainfall year: {year}')
        value = float(rain_rows[year]['sohra_max3_mm'])
        if not math.isfinite(value) or value < 0:
            raise ValueError(f'Invalid rainfall: {year}')
        rain[year] = value
        row = label_rows.get(year)
        raw = row['flash_flood_before_15_may'] if row else 'no report'
        if row and raw not in LABELS:
            raise ValueError(f'Unrecognized report label: {year}: {raw}')
        labels[year] = LABELS.get(raw)
        evidence.append({'year': year, 'label': raw, 'primaryOutcome': labels[year],
                         'reportPage': row.get('report_page') or None if row else None,
                         'timing': row.get('timing') or None if row else None})
    # Use the explicit supporting note, not the derived hindcast label, for the sensitivity only.
    if indirect_note.get('year') != '2010' or '2004' not in indirect_note.get('sentence', ''):
        raise ValueError('Missing supporting 2010 report note for the indirect 2004 sensitivity')
    strict = {**labels, 2019: None}
    indirect = {**labels, 2004: True}
    populations = {'primary': labels, 'excludeBroad2019Label': strict, 'includeIndirect2004Label': indirect}
    policies = {'always_watch_in_season': {y: True for y in years}, 'never_watch': {y: False for y in years}}
    for threshold in protocol['thresholdsMm']:
        if not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or threshold <= 0:
            raise ValueError('Invalid rainfall threshold')
        policies[f'rain_at_least_{threshold}mm'] = {y: rain[y] >= threshold for y in years}
    return {'schema': 'haor-seasonal-evaluation-v1', 'protocol': protocol, 'labelEvidence': evidence,
            'indirect2004Evidence': indirect_note, 'leadTimeEvaluable': False,
            'results': {name: {policy: score(years, predicted, population) for policy, predicted in policies.items()}
                        for name, population in populations.items()}}


def main() -> None:
    protocol_file = HERE / 'haor_protocol.json'
    rain_file = ROOT / 'research/floods/flash_flood_hindcast.csv'
    label_file = ROOT / 'research/floods/haor_flash_flood_years.csv'
    notes_file = ROOT / 'research/floods/ffwc_premonsoon_notes.csv'
    with notes_file.open(encoding='utf-8', newline='') as stream:
        notes = [r for r in csv.DictReader(stream) if r['year'] == '2010' and 'similar to the year of 2004' in r['sentence']]
    if len(notes) != 1:
        raise ValueError('Expected one source note for the indirect 2004 label')
    result = evaluate(json.loads(protocol_file.read_text(encoding='utf-8')), read_years(rain_file), read_years(label_file), notes[0])
    inputs = [protocol_file, rain_file, label_file, notes_file, Path(__file__), ROOT / 'research/explore/flash_flood_hindcast.py', ROOT / 'research/explore/ffwc_floods.py']
    result['inputAndCodeSha256'] = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes().replace(b'\r\n', b'\n')).hexdigest() for p in inputs}  # line endings ignored: Windows and Linux checkouts hash the same
    (HERE / 'haor_evaluation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for name, result in result['results']['primary'].items():
        print(f'{name}: TP={len(result["truePositiveYears"])} FP={len(result["falsePositiveYears"])} FN={len(result["falseNegativeYears"])} TN={len(result["trueNegativeYears"])}; {len(result["unknownYears"])} unknown years')
    print('Saved research/evaluation/haor_evaluation.json. Seasonal associations; warning lead time is not evaluated.')


if __name__ == '__main__':
    main()
