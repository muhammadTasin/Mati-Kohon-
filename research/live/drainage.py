"""Pure as-of drainage projection. A regional water threshold is not a field planting date."""
from datetime import date, timedelta
import math

FREE_AT, MIN_DROP, MIN_GAP, MAX_AHEAD = .05, .03, 7, 45


def available(readings, today, coast):
    start = date(today.year if today.month >= 10 else today.year - 1, 9, 1)
    rows = []
    for r in readings:
        if len(r) < 4 or r[1] is None or r[3] not in ('nisar', 'opera'):
            continue
        day = date.fromisoformat(r[0])
        if start <= day <= today and math.isfinite(float(r[1])) and 0 <= float(r[1]) <= 1:
            rows.append(r)
    rows.sort(key=lambda r: (r[0], r[3]))
    for sensor in ('nisar', 'opera'):
        same = [r for r in rows if r[3] == sensor]
        if len(same) >= 2 and (date.fromisoformat(same[-1][0]) - date.fromisoformat(same[0][0])).days >= MIN_GAP:
            return same
    # Mixed-sensor slopes are not forecasts, inland or coastal. Old code allowed this inland.
    return []


def extrapolate(first, last):
    days = (date.fromisoformat(last[0]) - date.fromisoformat(first[0])).days
    drop = first[1] - last[1]
    if days < MIN_GAP or drop < MIN_DROP:
        return None, None
    rate = drop / days
    ahead = max(0, math.ceil((last[1] - FREE_AT) / rate))
    return (str(date.fromisoformat(last[0]) + timedelta(days=ahead)) if ahead <= MAX_AHEAD else None), rate


def forecast(readings, today, coast=False, method='peak'):
    if not (today.month >= 10 or today.month == 1):
        return None
    rows = available(readings, today, coast)
    if len(rows) < 2 or (today - date.fromisoformat(rows[-1][0])).days > 21:
        return None
    last = rows[-1]
    if last[1] < FREE_AT:
        return {'date': last[0], 'rate': None, 'alreadyBelow': True, 'from': last, 'to': last}
    # A recent rise makes a straight-line readiness forecast unsafe.
    if last[1] > rows[-2][1] + .01:
        return None
    first = max(rows, key=lambda r: (r[1], r[0])) if method == 'peak' else next(
        (r for r in reversed(rows[:-1]) if (date.fromisoformat(last[0]) - date.fromisoformat(r[0])).days >= MIN_GAP), None)
    if first is None:
        return None
    projected, rate = extrapolate(first, last)
    return {'date': projected, 'rate': rate, 'alreadyBelow': False, 'from': first, 'to': last}


def drain(readings, today, coast=False):
    peak = forecast(readings, today, coast)
    if not peak:
        return None
    recent = forecast(readings, today, coast, 'recent')
    dates = [x['date'] for x in (peak, recent) if x and x['date']]
    # Envelope of the two methods, widened by the latest sampling gap. Not a calibrated confidence interval.
    rows = available(readings, today, coast)
    gap = min(14, max(1, (date.fromisoformat(rows[-1][0]) - date.fromisoformat(rows[-2][0])).days))
    interval = None
    if dates and not peak['alreadyBelow'] and peak['date'] and recent and recent['date']:
        lo = max(today, date.fromisoformat(min(dates)) - timedelta(days=gap))
        hi = date.fromisoformat(max(dates)) + timedelta(days=gap)
        if lo <= hi and (hi - today).days <= MAX_AHEAD:
            interval = [str(lo), str(hi)]
    endpoint = lambda r: {'date': r[0], 'floodShare': r[1], 'sensor': r[3]}
    return {'from': endpoint(peak['from']), 'to': endpoint(peak['to']),
            'perWeek': round(peak['rate'] * 7, 3) if peak['rate'] else None,
            'freeBy': peak['date'], 'dateRange': interval,
            'rangeMethod': 'peak/recent-trend envelope plus observation gap; not a confidence interval',
            'fieldCheckRequired': True,
            'plantingNote': 'Check access, surface water, soil workability and salinity in the field. Regional flood share below 5% does not establish planting readiness.'}
