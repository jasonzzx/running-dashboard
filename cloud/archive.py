"""Private cloud snapshots; never package account credentials."""
from pathlib import Path
import zipfile

def pack(root, target, dataset=True):
    paths = list((root/'dashboard').rglob('*'))
    if dataset:
        paths += [root/'data/running.duckdb', root/'reports/import_status.json', root/'reports/garmin_import_report.json']
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=3) as archive:
        for path in paths:
            if path.is_file():
                archive.write(path, path.relative_to(root).as_posix())

def unpack(archive, root):
    with zipfile.ZipFile(archive) as source:
        total=0
        for entry in source.infolist():
            path=(root/entry.filename).resolve()
            if not path.is_relative_to(root.resolve()) or entry.filename.startswith('/'):
                raise ValueError('Invalid snapshot path')
            total += entry.file_size
            if total>1_500_000_000:
                raise ValueError('Snapshot exceeds supported size')
        source.extractall(root)
