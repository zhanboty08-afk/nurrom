"""NURROOM storefront demo with a small SQLite order database (Python standard library only).

Start with:  $env:FORMA_ADMIN_PASSWORD='choose-a-long-password'; py server.py
Then open http://127.0.0.1:8000. Keep this server private until deployed behind HTTPS.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import base64, hmac, json, os, secrets, sqlite3

ROOT=os.path.dirname(os.path.abspath(__file__)); DB=os.path.join(ROOT,'forma.sqlite3')
PASSWORD=os.environ.get('FORMA_ADMIN_PASSWORD','')
def db():
 c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
 c.execute('''CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, date TEXT NOT NULL, customer TEXT NOT NULL, items TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL)'''); c.commit(); return c
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw): super().__init__(*a,directory=ROOT,**kw)
 def send_json(self,status,obj):
  b=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(b))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(b)
 def authorized(self):
  if not PASSWORD: self.send_json(503,{'error':'Задайте FORMA_ADMIN_PASSWORD и перезапустите сервер.'}); return False
  try: supplied=base64.b64decode(self.headers.get('Authorization','').removeprefix('Basic ')).decode().split(':',1)[1]
  except Exception: supplied=''
  if not hmac.compare_digest(supplied,PASSWORD): self.send_json(401,{'error':'Неверный пароль администратора.'}); return False
  return True
 def do_GET(self):
  if self.path=='/api/orders':
   if not self.authorized(): return
   with db() as c: rows=c.execute('SELECT * FROM orders ORDER BY date DESC').fetchall()
   return self.send_json(200,[{'id':r['id'],'date':r['date'],'customer':json.loads(r['customer']),'items':json.loads(r['items']),'total':r['total'],'status':r['status']} for r in rows])
  return super().do_GET()
 def do_POST(self):
  if self.path not in ('/api/orders','/api/order-status'): return self.send_json(404,{'error':'Not found'})
  if self.path.endswith('status') and not self.authorized(): return
  try: data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
  except Exception: return self.send_json(400,{'error':'Некорректные данные.'})
  if self.path=='/api/orders':
   customer=data.get('customer',{}); items=data.get('items',[])
   if not all(str(customer.get(k,'')).strip() for k in ('name','phone','address')) or not items: return self.send_json(400,{'error':'Заполните контакты и добавьте товары.'})
   oid='FM-'+secrets.token_hex(4).upper(); date=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(); total=sum(max(0,int(i['price']))*max(1,int(i['qty'])) for i in items)
   with db() as c: c.execute('INSERT INTO orders VALUES (?,?,?,?,?,?)',(oid,date,json.dumps(customer,ensure_ascii=False),json.dumps(items,ensure_ascii=False),total,'Новый'))
   return self.send_json(201,{'id':oid})
  with db() as c: c.execute('UPDATE orders SET status=? WHERE id=?',(str(data.get('status',''))[:40],str(data.get('id',''))))
  return self.send_json(200,{'ok':True})
 def log_message(self,*args): pass
if __name__=='__main__':
 db().close(); print('NURROOM is running at http://127.0.0.1:8000'); ThreadingHTTPServer(('127.0.0.1',8000),Handler).serve_forever()
