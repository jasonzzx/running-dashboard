import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from build_training_source import render, build

class SourceTest(unittest.TestCase):
    def test_treadmill_missing_data_and_source_text(self):
        data = {'activities': [dict(activity_key='garmin:1', start_utc='2026-11-01', sport='running', sub_sport='treadmill', name='Run|\n<script>', distance_m=999999, pace_s=98765, avg_hr_bpm=9876, moving_s=1800), dict(activity_key='garmin:2', start_utc='2026-10-31', sport='running', sub_sport='generic')]}
        text = render(data, {}, 'fixed-time')
        for excluded in ['999999', '98765', '9876']: self.assertNotIn(excluded, text)
        self.assertIn('30.0', text)
        self.assertIn('Run\\| &lt;script&gt;', text)
        self.assertIn('Wellness latest source-local date: unavailable', text)
        self.assertIn('garmin:2', text)
        self.assertIn('fixed-time', text)

    def test_rebuild_replaces_snapshot_and_records_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root/'dashboard').mkdir()
            for latest in ['2026-10-01', '2026-11-01']:
                (root/'dashboard/data.js').write_text('window.RUNNING_DATA='+json.dumps({'activities':[dict(activity_key='1',start_utc=latest)]})+';')
                build(root)
                text = (root/'dashboard/training-source.md').read_text()
                self.assertIn(f'to {latest}', text)
                self.assertIn('data.js SHA-256:', text)
            self.assertNotIn('2026-10-01', text)

if __name__ == '__main__': unittest.main()
