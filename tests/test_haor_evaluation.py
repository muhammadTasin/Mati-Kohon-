import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('haor', ROOT / 'research/evaluation/haor_evaluation.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HaorEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.protocol = json.loads((ROOT / 'research/evaluation/haor_protocol.json').read_text(encoding='utf-8'))
        self.rain = module.read_years(ROOT / 'research/floods/flash_flood_hindcast.csv')
        self.labels = module.read_years(ROOT / 'research/floods/haor_flash_flood_years.csv')
        self.note = {'year': '2010', 'page': '8', 'sentence': 'similar to the year of 2004'}

    def run_audit(self):
        return module.evaluate(self.protocol, self.rain, self.labels, self.note)

    def test_unknowns_are_not_negatives_and_misses_are_visible(self):
        report = self.run_audit()
        result = report['results']['primary']['rain_at_least_200mm']
        self.assertEqual(result['labeledYears'], 7)
        self.assertEqual(len(result['unknownYears']), 18)
        self.assertIn(2015, result['unknownYears'])
        self.assertEqual(result['falseNegativeYears'], [2018, 2019])
        self.assertEqual(result['truePositiveYears'], [2010, 2017])
        self.assertEqual(result['trueNegativeYears'], [2014, 2020, 2021])
        self.assertFalse(report['leadTimeEvaluable'])

    def test_indirect_and_broad_labels_are_separate_sensitivities(self):
        results = self.run_audit()['results']
        self.assertEqual(results['includeIndirect2004Label']['rain_at_least_200mm']['truePositiveYears'], [2004, 2010, 2017])
        self.assertEqual(results['excludeBroad2019Label']['rain_at_least_200mm']['falseNegativeYears'], [2018])

    def test_derived_hindcast_labels_cannot_change_evaluation(self):
        before = self.run_audit()
        for row in self.rain.values():
            row['flash_flood'] = '0'
            row['ffwc_says'] = 'no'
        self.assertEqual(before, self.run_audit())

    def test_threshold_boundary_and_undefined_precision(self):
        self.rain[2010]['sohra_max3_mm'] = '200'
        results = self.run_audit()['results']['primary']
        self.assertIn(2010, results['rain_at_least_200mm']['truePositiveYears'])
        self.assertIsNone(results['never_watch']['precision'])
        self.assertEqual(results['always_watch_in_season']['falsePositiveRate'], 1)

    def test_missing_or_invalid_rain_fails(self):
        del self.rain[2020]
        with self.assertRaisesRegex(ValueError, 'Missing rainfall'):
            self.run_audit()
        self.rain[2020] = {'sohra_max3_mm': 'NaN'}
        with self.assertRaisesRegex(ValueError, 'Invalid rainfall'):
            self.run_audit()

    def test_unknown_label_fails_instead_of_becoming_negative(self):
        self.labels[2010]['flash_flood_before_15_may'] = 'ambiguous-new-label'
        with self.assertRaisesRegex(ValueError, 'Unrecognized report label'):
            self.run_audit()

    def test_duplicate_years_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'duplicates.csv'
            path.write_text('year,value\n2010,1\n2010,2\n', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Duplicate year'):
                module.read_years(path)


if __name__ == '__main__':
    unittest.main()
