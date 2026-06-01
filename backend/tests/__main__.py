"""Run all backend tests: uv run python -m backend.tests"""

from __future__ import annotations

import pathlib
import sys
import unittest


def main(*, verbosity: int = 2) -> int:
    tests_dir = pathlib.Path(__file__).resolve().parent
    repo_root = tests_dir.parent.parent

    suite = unittest.TestLoader().discover(
        start_dir=str(tests_dir),
        pattern="test_*.py",
        top_level_dir=str(repo_root),
    )
    result = unittest.TextTestRunner(verbosity=verbosity).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
