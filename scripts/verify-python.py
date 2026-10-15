from pathlib import Path
import sys
import unittest
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'python'))
suite=unittest.defaultTestLoader.discover(str(root/'python'/'tests'))
if not suite.countTestCases(): raise SystemExit('No Python tests discovered')
raise SystemExit(0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1)
