from http.server import BaseHTTPRequestHandler
import hashlib,hmac,json,os,re,subprocess,sys,time
from pathlib import Path

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        size=int(self.headers.get('Content-Length','0'))
        if size>1024:return self.respond(400,{'error':'Invalid request'})
        body=self.rfile.read(size)
        stamp=self.headers.get('X-Worker-Time','')
        expected=hmac.new(os.environ['CLOUD_WORKER_SECRET'].encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
        if not stamp.isdigit() or abs(time.time()-int(stamp))>300 or not hmac.compare_digest(expected,self.headers.get('X-Worker-Signature','')):
            return self.respond(401,{'error':'Unauthorized'})
        try:
            job=json.loads(body)['id']
            if not re.fullmatch(r'[0-9a-f-]{36}',job):raise ValueError()
            script=Path(__file__).resolve().parents[1]/'cloud/worker.py'
            result=subprocess.run([sys.executable,str(script),job],capture_output=True,timeout=270)
            if result.returncode:
                detail={}
                for line in result.stderr.decode(errors='replace').splitlines():
                    if line.startswith('SYNC_ERROR:'):
                        try:detail=json.loads(line[len('SYNC_ERROR:'):])
                        except ValueError:pass
                stage=detail.get('stage','startup')
                if stage not in ('startup','database','snapshot_download','garmin_auth','activity_sync','parquet_export','dashboard_build','artifact_upload'):stage='startup'
                code=detail.get('code','worker_failed')
                if not re.fullmatch(r'provider_\d{3}|worker_failed',str(code)):code='worker_failed'
                # This endpoint requires a short-lived worker HMAC. Keep build
                # diagnostics here; the owner-facing queue exposes only stage/code.
                diagnostic=detail.get('build') if isinstance(detail.get('build'),dict) else None
                return self.respond(502,{'error':'Sync worker failed; existing published data is unchanged.','stage':stage,'code':code,'build':diagnostic})
            return self.respond(200,{'ok':True})
        except subprocess.TimeoutExpired:return self.respond(504,{'error':'Sync exceeded its time limit; retry is safe.'})
        except Exception:return self.respond(400,{'error':'Invalid request'})
    def respond(self,status,body):
        value=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(value)
