"""Queue-invoked worker. Work on an isolated snapshot; Node validates before promotion."""
import base64, hashlib, http.client, json, os, re, shutil, sys, tempfile, urllib.request, urllib.error, time
from pathlib import Path
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from psycopg.types.json import Jsonb
from vercel.blob import sync as blob

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(ROOT/'cloud'))
from sync_runner import sync,write_json,read_json,BuildError
from sync_api import Garmin,ApiError
from archive import pack,unpack

def decrypt(value):
    raw=base64.b64decode(value)
    return json.loads(AESGCM(base64.b64decode(os.environ['CLOUD_ENCRYPTION_KEY'])).decrypt(raw[:12],raw[12:],None))

def encrypt(value):
    nonce=os.urandom(12)
    return base64.b64encode(nonce+AESGCM(base64.b64decode(os.environ['CLOUD_ENCRYPTION_KEY'])).encrypt(nonce,json.dumps(value).encode(),None)).decode()

def download(url,target):
    from urllib.parse import urlparse
    parsed=urlparse(url)
    if parsed.scheme!='https' or parsed.hostname!=os.environ['CLOUD_BLOB_HOST']:
        raise ValueError('Invalid private snapshot location')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args):raise ValueError('Unexpected blob redirect')
    opener=urllib.request.build_opener(NoRedirect)
    chunk_size=8*1024*1024
    offset,total=0,None
    with target.open('wb') as output:
        while total is None or offset<total:
            end=offset+chunk_size-1 if total is None else min(offset+chunk_size,total)-1
            request=urllib.request.Request(url,headers={'Authorization':'Bearer '+os.environ['BLOB_READ_WRITE_TOKEN'],'Range':f'bytes={offset}-{end}'})
            for attempt in range(3):
                try:
                    with opener.open(request,timeout=20) as response:
                        if response.status!=206:raise ValueError('Snapshot server did not honor range request')
                        match=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',response.headers.get('Content-Range',''))
                        if not match:raise ValueError('Invalid snapshot range response')
                        lo,hi,size=map(int,match.groups())
                        if lo!=offset or hi!=min(end,size-1) or not 0<size<=1_500_000_000 or total is not None and total!=size:raise ValueError('Inconsistent snapshot range')
                        part=response.read(chunk_size+1)
                        if len(part)!=hi-lo+1:raise OSError('Incomplete snapshot range')
                    break
                except (TimeoutError,urllib.error.URLError,OSError,http.client.IncompleteRead):
                    if attempt==2:raise
                    time.sleep(attempt+1)
            output.write(part)
            offset+=len(part)
            total=size

def upload(path,name):
    result=blob.put_blob(name,path.read_bytes(),access='private',allow_overwrite=True)
    return result.url if hasattr(result,'url') else result['url']

PHASE='startup'

def progress(message):
    global PHASE
    if 'Exporting Parquet' in message:PHASE='parquet_export'
    elif 'Rebuilding' in message:PHASE='dashboard_build'
    print(message,flush=True)

def run(job_id):
    global PHASE
    PHASE='database'
    with psycopg.connect(os.environ['DATABASE_URL_UNPOOLED'],autocommit=True) as db:
        if not db.execute("SELECT pg_try_advisory_lock(711024)").fetchone()[0]:
            raise RuntimeError('A worker is already running')
        row=db.execute('SELECT status,result FROM cloud_jobs WHERE id=%s',[job_id]).fetchone()
        if not row:raise ValueError('Unknown job')
        if row[0]=='failed':return
        if row[0] in ('validating','ready','published') and row[1]:return row[1]
        db.execute("UPDATE cloud_jobs SET status='running',error=NULL,updated_at=now() WHERE id=%s",[job_id])
        dataset,metadata=db.execute('SELECT dataset_url,metadata FROM cloud_settings WHERE id=1').fetchone()
        config={provider:decrypt(value) for provider,value in db.execute('SELECT provider,encrypted FROM cloud_connections WHERE provider=%s',["garmin"]).fetchall()}
        with tempfile.TemporaryDirectory(prefix='running-cloud-') as folder:
            root=Path(folder)
            archive=root/'input.zip'
            PHASE='snapshot_download'
            download(dataset,archive)
            expected=metadata.get('dataset_sha256') or metadata.get('baseline_sha256')
            if not expected or hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:
                raise ValueError('Private snapshot checksum mismatch')
            unpack(archive,root)
            archive.unlink()
            (root/'scripts').symlink_to(ROOT/'scripts',target_is_directory=True)
            (root/'tests').symlink_to(ROOT/'tests',target_is_directory=True)
            write_json(root/'data/admin/credentials.json',config)
            clients={}
            PHASE='garmin_auth'
            if config.get('garmin',{}).get('api_key'):
                clients['garmin']=Garmin(config['garmin']['api_key'])
            try:
                PHASE='activity_sync'
                result=sync(progress,root,clients=clients,finalize=False,isolated=True)
            finally:
                refreshed=read_json(root/'data/admin/credentials.json',{})
                for provider,value in refreshed.items():
                    db.execute('UPDATE cloud_connections SET encrypted=%s,updated_at=now() WHERE provider=%s',[encrypt(value),provider])
            PHASE='artifact_upload'
            prefix='sync/'+job_id+'/'
            output={'summary':result}
            # Preserve new source responses and Parquet snapshots privately.
            for path in (root/'data/raw/api').rglob('*'):
                if path.is_file():
                    upload(path,prefix+'raw/'+str(path.relative_to(root/'data/raw/api')))
                    path.unlink()
            output['parquet']={}
            for path in (root/'data/parquet').glob('*.parquet'):
                output['parquet'][path.name]=upload(path,prefix+'parquet/'+path.name)
                path.unlink()
            pack(root,root/'dataset.zip')
            output['dataset_sha256']=hashlib.sha256((root/'dataset.zip').read_bytes()).hexdigest()
            (root/'data/running.duckdb').unlink()
            output['dataset_url']=upload(root/'dataset.zip',prefix+'dataset.zip')
            (root/'dataset.zip').unlink()
            pack(root,root/'dashboard.zip',dataset=False)
            output['dashboard_url']=upload(root/'dashboard.zip',prefix+'dashboard.zip')
            db.execute("UPDATE cloud_jobs SET status='validating',result=%s,updated_at=now() WHERE id=%s",[Jsonb(output),job_id])
            return output

if __name__=='__main__':
    try:run(sys.argv[1])
    except Exception as exc:
        # No provider payloads or credential-bearing exception URLs in logs/UI.
        detail={'stage':PHASE,'code':'provider_'+str(exc.status) if isinstance(exc,ApiError) else 'worker_failed','exception':type(exc).__name__}
        if isinstance(exc,BuildError):detail['build']=exc.diagnostic
        print('SYNC_ERROR:'+json.dumps(detail),file=sys.stderr)
        raise SystemExit(1)
