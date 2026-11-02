"""Create a source-only handover without credentials, builds or dependencies."""
from pathlib import Path
import argparse
import hashlib
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
excluded = {'.git', '.cache', '.next', 'node_modules', '.vercel', '.temp', '.branches', 'test-results', 'playwright-report', '__pycache__'}
files = []
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if not path.is_file() or any(part in excluded for part in relative.parts):
            continue
        if path.name.startswith('.env') and path.name != '.env.example':
            continue
        if path.name.endswith('.tsbuildinfo'):
            continue
        archive.write(path, Path('riway_web_app') / relative)
        files.append(str(relative))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any(name.endswith('.env.local') or '/node_modules/' in name for name in archive.namelist())
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(digest + '  ' + output.name + '\n', encoding='utf-8')
print(f'{len(files)} source files; {output.stat().st_size} bytes; SHA256 {digest}')
