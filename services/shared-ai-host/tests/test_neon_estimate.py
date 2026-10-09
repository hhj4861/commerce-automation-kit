"""Unit tests for the Neon compute-hour estimate."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "poc"))
import neon_estimate as ne  # noqa: E402


class EstimateTest(unittest.TestCase):
    def test_disjoint_touches_each_keep_the_compute_up_for_the_idle_window(self):
        self.assertEqual(ne.active_seconds([0, 1000], idle=300), 600)

    def test_overlapping_windows_are_counted_once(self):
        self.assertEqual(ne.active_seconds([0, 100, 200], idle=300), 500)

    def test_each_instance_session_ends_with_a_shutdown_flush(self):
        self.assertEqual(ne.db_touches([2000, 0, 100], shutdown_after=900), [0, 100, 1000, 2000, 2900])

    def test_each_instance_session_is_one_cold_start(self):
        self.assertEqual(ne.sessions([2000, 0, 100], shutdown_after=900), 2)
        self.assertEqual(ne.sessions([], shutdown_after=900), 0)

    def test_a_warm_instance_touches_the_database_periodically(self):
        self.assertEqual(ne.db_touches([50], periodic=600, window=(0, 1800)), [0, 50, 600, 1200, 1800])

    def test_monthly_cost_at_minimum_compute(self):
        cost = ne.monthly_cost(12 * 3600)
        self.assertEqual(cost["cu_hours_per_month"], 91.2)
        self.assertEqual(cost["usd_per_month"], 9.67)
        self.assertTrue(cost["cloud_sql_cheaper"])


if __name__ == "__main__":
    unittest.main()
