"""Build the one-cell notebook from the reviewed server and prompt contract.
Run locally with Python; no model download or GPU work occurs here.
"""
import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def build():
    runner = (ROOT / "notebook_runner.py").read_text(encoding="utf-8")
    server = (ROOT / "ghost_server.py").read_text(encoding="utf-8-sig") + '\n' + (ROOT / 'request_handler.py').read_text(encoding='utf-8')
    contract = (ROOT / "prompt_contract.py").read_text(encoding="utf-8")
    runner = runner.replace("# EMBED_SERVER", f"WARM_SERVER_CODE = {server!r}\nPROMPT_CONTRACT_CODE = {contract!r}")
    ast.parse(runner)
    (ROOT / "clothmatics_ghost_v9.py").write_text(runner, encoding="utf-8")
    notebook = {"nbformat":4,"nbformat_minor":5,"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"}},"cells":[{"cell_type":"code","execution_count":None,"metadata":{},"outputs":[],"source":runner.splitlines(keepends=True)}]}
    (ROOT / "clothmatics_ghost_v9.ipynb").write_text(json.dumps(notebook, indent=2), encoding="utf-8")

if __name__ == "__main__":
    build()
