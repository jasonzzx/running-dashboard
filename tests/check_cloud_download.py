"""Private snapshot transfers retry bounded ranges and never forward credentials."""
import io,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cloud'))
from worker import download, SnapshotError
class Response(io.BytesIO):
    status=206
    def __init__(self,data,start,total):
        super().__init__(data);self.headers={'Content-Range':f'bytes {start}-{start+len(data)-1}/{total}'}
class DownloadTests(unittest.TestCase):
    def test_ranges_retry_without_duplicating_bytes(self):
        content=b'a'*(8*1024*1024)+b'end';calls=[]
        def open_request(request,timeout):
            calls.append(request.get_header('Range'))
            if len(calls)==1:raise TimeoutError()
            start=int(request.get_header('Range').split('=')[1].split('-')[0]);part=content[start:start+8*1024*1024]
            return Response(part,start,len(content))
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'CLOUD_BLOB_HOST':'private.example','BLOB_READ_WRITE_TOKEN':'test-only'}),patch('worker.urllib.request.build_opener') as build,patch('worker.time.sleep'):
            build.return_value.open.side_effect=open_request
            target=Path(folder)/'snapshot.zip';download('https://private.example/input.zip',target)
            self.assertEqual(target.read_bytes(),content)
            self.assertEqual(calls,['bytes=0-8388607','bytes=0-8388607','bytes=8388608-8388610'])
    def test_full_response_is_streamed_when_ranges_ignored(self):
        content=b'a'*(8*1024*1024)+b'end'
        response=io.BytesIO(content);response.status=200;response.headers={'Content-Length':str(len(content))}
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'CLOUD_BLOB_HOST':'private.example','BLOB_READ_WRITE_TOKEN':'test-only'}),patch('worker.urllib.request.build_opener') as build:
            build.return_value.open.return_value=response
            target=Path(folder)/'snapshot.zip';download('https://private.example/input.zip',target)
            self.assertEqual(target.read_bytes(),content)
    def test_missing_configuration_is_diagnosed(self):
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaises(SnapshotError) as error:download('https://private.example/input.zip',Path('/tmp/unused-snapshot'))
            self.assertEqual(error.exception.code,'snapshot_config')
    def test_rejects_other_host_before_opening(self):
        with patch.dict(os.environ,{'CLOUD_BLOB_HOST':'private.example','BLOB_READ_WRITE_TOKEN':'test-only'}),patch('worker.urllib.request.build_opener') as build:
            with self.assertRaises(SnapshotError):download('https://other.example/input.zip',Path('/tmp/unused-snapshot'))
            build.assert_not_called()
if __name__=='__main__':unittest.main()
