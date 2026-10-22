import json,zipfile,hashlib,collections,datetime as dt
from pathlib import Path
from fitparse import FitFile
ROOT=Path(__file__).resolve().parents[1]
def main():
 out=ROOT/'data/garmin_index.json'; rows=[];counts=collections.Counter();errors=[]
 for p in sorted((ROOT/'data/garmin_export/DI_CONNECT').rglob('UploadedFiles*.zip')):
  with zipfile.ZipFile(p) as z:
   for name in z.namelist():
    if not name.lower().endswith('.fit'):continue
    try:
     b=z.read(name);fit=FitFile(b,check_crc=False);first=next(fit.get_messages('file_id'),None)
     typ=first.get_values().get('type') if first else None;counts[str(typ)]+=1
     if typ!='activity':continue
     sessions=[m.get_values() for m in fit.get_messages('session')]
     rows.append(dict(archive=str(p.relative_to(ROOT)),member=name,sha256=hashlib.sha256(b).hexdigest(),sessions=sessions))
    except Exception as e: errors.append(dict(archive=str(p.relative_to(ROOT)),member=name,error=str(e)))
  print(p.name,len(rows),'activity files;',dict(counts),flush=True)
  out.write_text(json.dumps(dict(files=rows,types=counts,errors=errors),default=str))
 print('index complete',len(rows),'errors',len(errors),flush=True)
if __name__=='__main__':main()
