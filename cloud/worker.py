"""Queue-invoked worker. Work on an isolated snapshot; Node validates before promotion."""
import base64, hashlib, json, os, shutil, sys, tempfile, urllib.request
from pathlib import Path
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from psycopg.types.json import Jsonb
from vercel.blob import sync as blob

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(ROOT/'cloud'))
from sync_runner import sync,write_json,read_json
from sync_api import Garmin,Strava
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
    request=urllib.request.Request(url,headers={'Authorization':'Bearer '+os.environ['BLOB_READ_WRITE_TOKEN']})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args):raise ValueError('Unexpected blob redirect')
    with urllib.request.build_opener(NoRedirect).open(request,timeout=60) as response,target.open('wb') as output:
        shutil.copyfileobj(response,output)

def upload(path,name):
    result=blob.put_blob(name,path.read_bytes(),access='private',allow_overwrite=True)
    return result.url if hasattr(result,'url') else result['url']

def run(job_id):
    with psycopg.connect(os.environ['DATABASE_URL_UNPOOLED'],autocommit=True) as db:
        if not db.execute("SELECT pg_try_advisory_lock(711024)").fetchone()[0]:
            raise RuntimeError('A worker is already running')
        row=db.execute('SELECT status,result FROM cloud_jobs WHERE id=%s',[job_id]).fetchone()
        if not row:raise ValueError('Unknown job')
        if row[0] in ('validating','ready','published') and row[1]:return row[1]
        db.execute("UPDATE cloud_jobs SET status='running',error=NULL,updated_at=now() WHERE id=%s",[job_id])
        dataset,metadata=db.execute('SELECT dataset_url,metadata FROM cloud_settings WHERE id=1').fetchone()
        config={provider:decrypt(value) for provider,value in db.execute('SELECT provider,encrypted FROM cloud_connections').fetchall()}
        with tempfile.TemporaryDirectory(prefix='running-cloud-') as folder:
            root=Path(folder)
            archive=root/'input.zip'
            download(dataset,archive)
            expected=metadata.get('dataset_sha256') or metadata.get('baseline_sha256')
            if not expected or hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:
                raise ValueError('Private snapshot checksum mismatch')
            unpack(archive,root)
            archive.unlink()
            (root/'scripts').symlink_to(ROOT/'scripts',target_is_directory=True)
            (root/'tests').symlink_to(ROOT/'tests',target_is_directory=True)
            write_json(root/'data/admin/credentials.json',config)
            def save_strava(value):
                # Persist rotating refresh tokens immediately, even if a later step fails.
                db.execute("UPDATE cloud_connections SET encrypted=%s,updated_at=now() WHERE provider='strava'",[encrypt(value)])
                config['strava']=value
                write_json(root/'data/admin/credentials.json',config)
            clients={}
            if config.get('strava',{}).get('refresh_token'):
                clients['strava']=Strava(config['strava'],save_strava)
            if config.get('garmin',{}).get('api_key'):
                clients['garmin']=Garmin(config['garmin']['api_key'])
            try:
                result=sync(lambda message:print(message,flush=True),root,clients=clients,finalize=False,isolated=True)
            finally:
                refreshed=read_json(root/'data/admin/credentials.json',{})
                for provider,value in refreshed.items():
                    db.execute('UPDATE cloud_connections SET encrypted=%s,updated_at=now() WHERE provider=%s',[encrypt(value),provider])
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
        print('Cloud sync failed: '+type(exc).__name__,file=sys.stderr)
        raise SystemExit(1)
