import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('temporal', Path(__file__).resolve().parents[1] / 'research/evaluation/temporal_comparison.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TemporalEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.protocol = {
            'trainYears': [2001, 2002], 'evaluationYears': [2003, 2004], 'currentPracticeId': 'a',
            'candidates': [
                {'id': 'a', 'aman': 'rice-a', 'winter': 'winter-a', 'amanReady': '11-01', 'winterSow': '11-10', 'winterHarvest': '01-10', 'sowingWindow': ['11-01', '11-30']},
                {'id': 'b', 'aman': 'rice-b', 'winter': 'winter-b', 'amanReady': '11-01', 'winterSow': '11-10', 'winterHarvest': '02-10', 'sowingWindow': ['11-01', '11-30']},
            ],
        }
        self.aman = {(crop, y): int(crop == 'rice-a') for crop in ['rice-a', 'rice-b'] for y in range(2001, 2005)}
        self.winter = {(crop, y): 200 if crop == 'winter-a' else 100 for crop in ['winter-a', 'winter-b'] for y in range(2001, 2005)}

    def test_future_outcomes_cannot_change_selection(self):
        first = module.compare(self.protocol, self.aman, self.winter)
        self.assertEqual(first['selections']['calendar_only'], 'a')
        self.assertEqual(first['selections']['nasa_water_only'], 'b')
        for year in [2003, 2004]:
            self.aman['rice-b', year] = 1
            self.aman['rice-a', year] = 0
            self.winter['winter-b', year] = 10000
            self.winter['winter-a', year] = 0
        second = module.compare(self.protocol, self.aman, self.winter)
        self.assertEqual(first['selections'], second['selections'])
        self.assertLess(second['pairedComparisons'][0]['meanLessWinterIrrigationMm'], 0, 'Must retain an unfavorable outcome')

    def test_training_can_change_water_policy_but_not_calendar(self):
        for year in [2001, 2002]:
            self.aman['rice-b', year] = 1
            self.aman['rice-a', year] = 0
        result = module.compare(self.protocol, self.aman, self.winter)
        self.assertEqual(result['selections']['nasa_water_only'], 'a')
        self.assertEqual(result['selections']['calendar_only'], 'a')
        self.assertEqual(result['selectionFinding'], 'same_choice_as_calendar_no_incremental_advantage')
        self.assertEqual(result['pairedComparisons'][0]['meanLessWinterIrrigationMm'], 0)

    def test_shared_calendar_feasibility(self):
        late = copy.deepcopy(self.protocol['candidates'][0])
        late.update(id='late', winterSow='12-10')
        before_ready = copy.deepcopy(self.protocol['candidates'][0])
        before_ready.update(id='overlap', amanReady='11-20')
        self.assertEqual([c['id'] for c in module.feasible_candidates([late, before_ready] + self.protocol['candidates'])], ['a', 'b'])

    def test_missing_pair_is_not_imputed_or_silently_dropped(self):
        del self.winter['winter-b', 2004]
        with self.assertRaisesRegex(ValueError, 'Missing complete paired season'):
            module.compare(self.protocol, self.aman, self.winter)

    def test_missing_calendar_window_is_reported(self):
        self.protocol['candidates'][0]['sowingWindow'] = None
        result = module.compare(self.protocol, self.aman, self.winter)
        self.assertIn('a', result['commonFeasibleCandidateIds'])
        self.assertEqual(result['unverifiedSowingWindowIds'], ['a'])

    def test_overlapping_periods_rejected(self):
        self.protocol['evaluationYears'] = [2002, 2004]
        with self.assertRaisesRegex(ValueError, 'Training must end'):
            module.compare(self.protocol, self.aman, self.winter)


if __name__ == '__main__':
    unittest.main()
