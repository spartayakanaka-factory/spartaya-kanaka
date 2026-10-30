import mariadb from 'mariadb';
import { writeFileSync } from 'node:fs';
const u=new URL(process.env.DATABASE_URL||'');
if(u.hostname!=='127.0.0.1'||u.port!=='33078'||u.pathname!=='/sprtaya_phase4_disposable_test'||u.username!=='sprtaya_phase4') throw Error('Only isolated test schema allowed');
const conn=await mariadb.createConnection({host:u.hostname,port:Number(u.port),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:u.pathname.slice(1)});
try {
 const [env]=await conn.query('SELECT VERSION() version');
 await conn.query('CREATE TEMPORARY TABLE p4_bench_events (id INT PRIMARY KEY, kind VARCHAR(64) NOT NULL, createdAt DATETIME(3) NOT NULL) ENGINE=InnoDB');
 const results=[];
 for(const n of [1000,20000,100000]) {
  await conn.query('DELETE FROM p4_bench_events');
  await conn.query(`INSERT INTO p4_bench_events SELECT seq, CASE MOD(seq,5) WHEN 0 THEN 'payment.verified' WHEN 1 THEN 'fulfillment.cod_reconciled' WHEN 2 THEN 'finance.reconcile' ELSE 'other' END, DATE_ADD('2020-01-01', INTERVAL MOD(seq,1825) DAY) FROM seq_1_to_${n}`);
  const sql="SELECT id FROM p4_bench_events WHERE createdAt >= '2023-01-01' AND createdAt < '2023-02-01' AND kind IN ('payment.verified','fulfillment.cod_reconciled','finance.reconcile') ORDER BY id LIMIT 5001";
  async function measure(label) {const [row]=await conn.query('ANALYZE FORMAT=JSON '+sql); const plan=JSON.parse(row['ANALYZE']); return {label,plan};}
  const noIndex=await measure('without event date index');
  await conn.query('CREATE INDEX p4_bench_kind_date ON p4_bench_events(kind,createdAt)');
  const indexed=await measure('with kind/date index');
  await conn.query('DROP INDEX p4_bench_kind_date ON p4_bench_events');
  results.push({rows:n,noIndex,indexed});
 }
 writeFileSync('docs/phase4/benchmark.json',JSON.stringify({scope:'Synthetic temporary event-table microbenchmark; not an end-to-end report workload. Three event kinds, 5-year dates; no persistent schema changes.',engine:env.version,results},(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
 console.log('Recorded three isolated temporary-table benchmark plans.');
} finally {await conn.end();}
