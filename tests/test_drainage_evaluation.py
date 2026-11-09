import importlib.util
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('evaluation', ROOT / 'research/evaluation/drainage_evaluation.py')
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)
model = evaluation.model


class DrainageTests(unittest.TestCase):
    def setUp(self):
        self.rows = [['2026-09-20', .4, .5, 'nisar'], ['2026-10-01', .3, .4, 'nisar'], ['2026-10-11', .2, .3, 'nisar']]

    def test_future_observations_cannot_change_prediction(self):
        cutoff = date(2026, 10, 11)
        result = model.drain(self.rows, cutoff)
        self.assertIsNotNone(result['dateRange'])
        self.assertEqual(result, model.drain(self.rows + [['2026-10-21', .99, 1, 'nisar']], cutoff))

    def test_mixed_sensor_and_reflooding_abstain(self):
        self.assertIsNone(model.drain([self.rows[0], ['2026-10-11', .1, .2, 'opera']], date(2026, 10, 11)))
        self.assertIsNone(model.drain(self.rows + [['2026-10-21', .3, .4, 'nisar']], date(2026, 10, 21)))

    def test_targets_need_future_same_sensor_observations(self):
        self.assertIsNone(evaluation.target_interval(self.rows + [['2026-10-20', 0, 0, 'opera']], '2026-10-11', 'nisar'))
        self.assertEqual(evaluation.target_interval(self.rows + [['2026-10-21', .02, .1, 'nisar']], '2026-10-01', 'nisar'), ['2026-10-11', '2026-10-21'])

    def test_interval_errors_retain_direction_and_censoring(self):
        target = ['2026-10-11', '2026-10-21']
        self.assertEqual(evaluation.interval_error('2026-10-08', target), -3)
        self.assertEqual(evaluation.interval_error('2026-10-24', target), 3)
        self.assertEqual(evaluation.interval_error('2026-10-15', target), 0)
        self.assertIsNone(evaluation.interval_error('2026-10-15', None))

    def test_stale_and_out_of_season_abstain(self):
        self.assertIsNone(model.drain(self.rows, date(2026, 12, 1)))
        self.assertIsNone(model.drain(self.rows, date(2026, 8, 1)))


if __name__ == '__main__':
    unittest.main()
