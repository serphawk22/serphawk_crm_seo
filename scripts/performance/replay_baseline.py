"""Replay the same fixture harness against an explicitly exported git baseline.

Run inside an isolated test container with network disabled. Input archive must
contain source only (main.py, database.py, modules, routers, addons, tests).
"""
import os
from pathlib import Path
import runpy
import shutil
import sys
import tarfile
import tempfile

archive, output = sys.argv[1:]
with tempfile.TemporaryDirectory(prefix="neon-baseline-") as scratch:
    with tarfile.open(archive) as source:
        source.extractall(scratch, filter="data")
    Path(scratch, "static").mkdir(exist_ok=True)
    shutil.copytree(Path(__file__).parent, Path(scratch, "scripts", "performance"))
    os.chdir(scratch)
    sys.path.insert(0, scratch)
    sys.argv = ["benchmark", "--output", output]
    runpy.run_module("scripts.performance.neon_benchmark", run_name="__main__")
