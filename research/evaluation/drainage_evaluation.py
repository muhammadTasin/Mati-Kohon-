"""Prefix-only backtest against later same-sensor observations; records censoring and proxy mismatch."""
import csv
import hashlib
import importlib.util
import json
from datetime import date
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('drainage', ROOT / 'research/live/drainage.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
SITES = ['ADM3_Khaliajuri', 'ADM3_Itna', 'ADM3_Tanore', 'ADM3_Shyamnagar', 'ADM3_Batiaghata']


def target_interval(rows, asof, sensor):
    same = sorted([r for r in rows if r[3] == sensor and r[1] is not None], key=lambda r: r[0])
    preceding = next((r for r in reversed(same) if r[0] <= asof), None)
    if not preceding or preceding[1] < model.FREE_AT:
        return None
    for r in same:
        if r[0] <= asof:
            continue
        if r[1] < model.FREE_AT:
            return [preceding[0], r[0]]
        preceding = r
    return None


def interval_error(prediction, target):
    if not prediction or not target:
        return None
    p, lo, hi = map(date.fromisoformat, [prediction, *target])
    return (p - lo).days if p < lo else (p - hi).days if p > hi else 0


def evaluate(history, previous, coordinates, sites=SITES):
    cases = []
    for site in sites:
        rows = history['upazilas'][site]
        coast = coordinates[site] < 23
        for asof in sorted({r[0] for r in rows if '10-01' <= r[0][5:] <= '12-31'}):
            prefix = [r for r in rows if r[0] <= asof]
            today = date.fromisoformat(asof)
            peak, recent = model.forecast(prefix, today, coast), model.forecast(prefix, today, coast, 'recent')
            if peak and peak['alreadyBelow']:
                continue
            current = model.drain(prefix, today, coast)
            sensor = peak['to'][3] if peak else 'nisar'
            target = target_interval(rows, asof, sensor)
            old = previous.get(site, {}).get('drained90')
            projected_old = str(date(today.year + (int(old[5:7]) <= 1), int(old[5:7]), int(old[8:10]))) if old else None
            predictions = {'peak': peak['date'] if peak else None, 'recent_trend': recent['date'] if recent else None, 'last_year_proxy': projected_old}
            cases.append({'site': site, 'asOf': asof, 'sensor': sensor, 'predictions': predictions,
                          'dateRange': current['dateRange'] if current else None, 'targetObservationInterval': target,
                          'rightCensored': target is None, 'intervalErrorDays': {k: interval_error(v, target) for k, v in predictions.items()},
                          'observationsAvailable': len(prefix), 'lastObservationUsed': max(r[0] for r in prefix)})
    summaries = {}
    for policy in ['peak', 'recent_trend', 'last_year_proxy']:
        errors = [c['intervalErrorDays'][policy] for c in cases if c['intervalErrorDays'][policy] is not None]
        summaries[policy] = {'issued': sum(c['predictions'][policy] is not None for c in cases), 'evaluable': len(errors),
                             'meanAbsoluteIntervalErrorDays': round(mean(abs(e) for e in errors), 2) if errors else None,
                             'medianSignedIntervalErrorDays': median(errors) if errors else None}
    paired = [c for c in cases if all(v is not None for v in c['intervalErrorDays'].values())]
    return {'cases': cases, 'summary': summaries, 'commonEvaluableCases': len(paired),
            'commonMeanAbsoluteIntervalErrorDays': {k: round(mean(abs(c['intervalErrorDays'][k]) for c in paired), 2) if paired else None for k in summaries},
            'rightCensoredCases': sum(c['rightCensored'] for c in cases)}


def main():
    history_file = ROOT / 'services/api/data/live/water_history.json'
    previous_file = ROOT / 'research/floods/opera_water_upazila.csv'
    coords_file = ROOT / 'research/sites/adm3_centroids.csv'
    with previous_file.open(encoding='utf-8') as f:
        previous = {r['site_id']: r for r in csv.DictReader(f)}
    with coords_file.open(encoding='utf-8') as f:
        coords = {r['site_id']: float(r['lat']) for r in csv.DictReader(f)}
    history = json.loads(history_file.read_text(encoding='utf-8'))
    result = {'schema': 'drainage-prefix-backtest-v1', 'sites': SITES, 'historyMade': history['made'],
              'protocol': ['At each October-December observation, forecast using only the prefix available on that date.',
                'Compare seasonal peak-to-latest, a recent-trend baseline and last year\'s recorded 90%-recession date shifted one year.',
                'The last-year proxy uses a different water definition and sensor; its errors are disclosed but cannot establish a fair same-target skill gain.',
                'The target is bracketed by a wet and subsequent below-5% observation from the same sensor. Zero interval error means inside that bracket, not an exact date hit.',
                'No later threshold crossing means right-censored, not success, failure or an imputed date. Report missing predictions separately.',
                'Repeated origins overlap; they are not independent events. Regional water extent is not plot workability or observed planting.',
                'Classification and calibration were developed using broader history. Prefix isolation prevents direct look-ahead but does not create a pristine holdout.',
                'Date ranges are method/sampling envelopes, not calibrated confidence intervals. Require field checks; do not promise safe planting.'],
              **evaluate(history, previous, coords)}
    all_sites = sorted(set(history['upazilas']) & set(coords))
    result['exploratoryAllLocations'] = {'sites': len(all_sites),
        'note': 'All available locations, added after inspecting pilot coverage; exploratory, not a preregistered holdout.',
        **evaluate(history, previous, coords, all_sites)}
    paths = [history_file, previous_file, coords_file, Path(__file__), ROOT / 'research/live/drainage.py']
    result['inputAndCodeSha256'] = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes().replace(b'\r\n', b'\n')).hexdigest() for p in paths}  # line endings ignored: Windows and Linux checkouts hash the same
    (ROOT / 'research/evaluation/drainage_evaluation.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'pilotCases': len(result['cases']), 'pilotSummary': result['summary'], 'allLocationSummary': result['exploratoryAllLocations']['summary']}))


if __name__ == '__main__':
    main()
