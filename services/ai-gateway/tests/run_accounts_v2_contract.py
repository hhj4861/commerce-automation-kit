"""CI entry point: database checks must execute, never silently skip."""
import os
from pathlib import Path
import sys
import unittest

if not os.environ.get('ACCOUNTS_TEST_DATABASE_URL'):
    raise SystemExit('ACCOUNTS_TEST_DATABASE_URL is required')
suite=unittest.defaultTestLoader.discover(str(Path(__file__).parent),pattern='test_accounts_*py')
result=unittest.TextTestRunner(verbosity=2).run(suite)
if result.skipped:
    raise SystemExit('Accounts v2 contract unexpectedly skipped tests')
raise SystemExit(0 if result.wasSuccessful() else 1)
