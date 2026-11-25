from pathlib import Path
from runpy import run_path

core = Path(__file__).resolve().parent / "public" / "grade-core.py"

if __name__ == "__main__":
    run_path(str(core), run_name="__main__")
