// Prova lo script SQL su un Postgres in locale (PGlite), con ruoli simili a Supabase.
// Uso: cd test && npm install && node test-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
// Ambiente simile a Supabase
await db.exec(`
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create publication supabase_realtime;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','benedetto@x'),('22222222-2222-2222-2222-222222222222','luca@x');
`);
await db.exec(schema);
await db.exec(schema); // rieseguibile
await db.exec(`insert into auth.users values ('33333333-3333-3333-3333-333333333333','estraneo@x')`); // creato dopo: non membro
let ok = 0, ko = 0, r2;
async function as(role, uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { err: e.message }; } finally { await db.exec('reset role'); }
}
function check(name, cond, info) { if (cond) { ok++; console.log('OK  ', name); } else { ko++; console.log('FAIL', name, JSON.stringify(info)); } }
const B = '11111111-1111-1111-1111-111111111111', L = '22222222-2222-2222-2222-222222222222', X = '33333333-3333-3333-3333-333333333333';

let r = await as('authenticated', B, `insert into public.aziende (nome_azienda, telefono, comune) values ('Edil Prova', '0824 123 456', 'Benevento') returning id, telefono`);
check('membro inserisce + telefono normalizzato', r.rows?.[0]?.telefono === '+390824123456', r);
const id = r.rows?.[0]?.id;
r = await as('authenticated', L, `insert into public.aziende (nome_azienda, telefono) values ('Doppione', '+39 0824-123456')`);
check('doppione rifiutato', r.err?.includes('duplicate') || r.err?.includes('unique'), r);
r = await as('authenticated', L, `insert into public.aziende (nome_azienda, telefono) values ('Doppione2', '00390824123456') on conflict (telefono) do nothing returning id`);
check('doppione 0039 ignorato con on conflict', r.rows && r.rows.length === 0, r);
r = await as('authenticated', L, `insert into public.aziende (nome_azienda, telefono) values ('Cell', '393 123 4567') returning telefono`);
check('cellulare 393 a 10 cifre -> +39393...', r.rows?.[0]?.telefono === '+393931234567', r);
r = await as('authenticated', L, `insert into public.aziende (nome_azienda, telefono) values ('Corto', '12')`);
check('numero troppo corto rifiutato', !!r.err, r);
r = await as('anon', null, `select * from public.aziende`);
check('anon non legge aziende', r.err?.includes('permission denied'), r);
r = await as('anon', null, `insert into public.aziende (nome_azienda, telefono) values ('x','0824999999')`);
check('anon non scrive', r.err?.includes('permission denied'), r);
r = await as('anon', null, `select * from public.storico_chiamate`);
check('anon non legge storico', r.err?.includes('permission denied'), r);
r = await as('anon', null, `select public.registra_chiamata(1,'non_risponde','x')`);
check('anon non esegue registra_chiamata', r.err?.includes('permission denied'), r);
r = await as('anon', null, `select public.e_membro()`);
check('anon non esegue e_membro', r.err?.includes('permission denied'), r);
r = await as('authenticated', X, `select count(*)::int n from public.aziende`);
check('utente non membro vede 0 aziende', r.rows?.[0]?.n === 0, r);
r = await as('authenticated', X, `insert into public.aziende (nome_azienda, telefono) values ('x','0824999999')`);
check('utente non membro non inserisce', !!r.err, r);
r = await as('authenticated', X, `select public.e_membro() m`);
check('e_membro false per estraneo', r.rows?.[0]?.m === false, r);
r = await as('authenticated', X, `select * from public.membri`);
check('nessuno legge membri', !!r.err, r);
r = await as('authenticated', B, `select public.e_membro() m`);
check('e_membro true per Benedetto', r.rows?.[0]?.m === true, r);
r = await as('authenticated', X, `select public.registra_chiamata(${id},'non_risponde','Intruso')`);
check('estraneo non registra chiamate', !!r.err, r);
r = await as('authenticated', B, `select public.segna_in_chiamata(${id}, 'Benedetto')`);
check('segna restituisce chi sta chiamando', r.rows?.[0]?.segna_in_chiamata === 'Benedetto', r);
r = await as('authenticated', B, `select in_chiamata_da, in_chiamata_dal from public.aziende where id=${id}`);
check('segna_in_chiamata', r.rows?.[0]?.in_chiamata_da === 'Benedetto' && r.rows[0].in_chiamata_dal, r);
r = await as('authenticated', L, `select (r->'azienda') || jsonb_build_object('id_chiamata', r->'chiamata'->'id', 'nota_chiamata', r->'chiamata'->>'nota') as a from public.registra_chiamata($1,'richiamare','Luca','Richiamare dopo le 17','Mario', null, now() + interval '1 day', null, null) r`, [id]); if (r.rows) r.rows = r.rows.map(x => x.a);
check('registra_chiamata restituisce anche la riga di storico', r.rows?.[0]?.id_chiamata > 0 && r.rows[0].nota_chiamata === 'Richiamare dopo le 17', r);
check('registra_chiamata aggiorna azienda', r.rows?.[0]?.esito === 'richiamare' && r.rows[0].tentativi === 1 && r.rows[0].referente === 'Mario' && r.rows[0].in_chiamata_da === null && r.rows[0].ultimo_chiamante === 'Luca', r);
r = await as('authenticated', B, `select r->'azienda' as a from public.registra_chiamata($1,'demo_fissata','Benedetto','', '', 'a@b.it', null, now() + interval '3 day', 'Via Roma 1') r`, [id]); if (r.rows) r.rows = r.rows.map(x => x.a);
check('demo: referente mantenuto, appuntamento salvato, richiamo tolto', r.rows?.[0]?.referente === 'Mario' && r.rows[0].appuntamento_luogo === 'Via Roma 1' && r.rows[0].richiamo_il === null && r.rows[0].tentativi === 2 && r.rows[0].email === 'a@b.it', r);
r = await as('authenticated', B, `select utente_nome, esito, nota, utente_id from public.storico_chiamate where azienda_id=$1 order by id`, [id]);
check('storico: 2 righe, note non sovrascritte, utente_id', r.rows?.length === 2 && r.rows[0].nota === 'Richiamare dopo le 17' && r.rows[1].nota === null && r.rows[0].utente_id === L, r);
// --- Atomicità ---
let prima = (await db.query(`select count(*)::int n from public.storico_chiamate`)).rows[0].n;
r = await as('authenticated', B, `select public.registra_chiamata($1,'esito_inventato','Benedetto','nota')`, [id]);
let dopo = (await db.query(`select count(*)::int n from public.storico_chiamate`)).rows[0].n;
check('esito non valido: errore e NESSUNA riga nello storico (tutto annullato)', !!r.err && prima === dopo, { r, prima, dopo });
r = await as('authenticated', B, `select public.registra_chiamata(999999,'non_risponde','Benedetto')`);
dopo = (await db.query(`select count(*)::int n from public.storico_chiamate`)).rows[0].n;
check('azienda inesistente: errore e nessuna riga nello storico', !!r.err && prima === dopo, r);
r = await as('authenticated', B, `select public.segna_in_chiamata($1, 'Benedetto') chi`, [id]);
check('segna: Benedetto prende la chiamata', r.rows?.[0]?.chi === 'Benedetto', r);
r = await as('authenticated', L, `select public.segna_in_chiamata($1, 'Luca') chi`, [id]);
check('segna: Luca arriva dopo -> vince il primo (risponde "Benedetto")', r.rows?.[0]?.chi === 'Benedetto', r);
r = await as('authenticated', L, `select public.segna_in_chiamata($1, 'Luca', true) chi`, [id]);
check('segna: "Chiama lo stesso" (forza) passa a Luca', r.rows?.[0]?.chi === 'Luca', r);
await db.query(`update public.aziende set in_chiamata_dal = now() - interval '11 minutes' where id = $1`, [id]);
r = await as('authenticated', B, `select public.segna_in_chiamata($1, 'Benedetto') chi`, [id]);
check('segna: dopo 10 minuti la chiamata di Luca è scaduta e Benedetto la prende', r.rows?.[0]?.chi === 'Benedetto', r);
r = await as('authenticated', B, `insert into public.aziende (nome_azienda, telefono, in_chiamata_da, in_chiamata_dal) values ('Ora finta', '0824 444555', 'Benedetto', '2020-01-01') returning in_chiamata_dal > now() - interval '1 minute' as ora_server`);
check('aggiungi già "in chiamata" in una sola scrittura, con l\'ora del server', r.rows?.[0]?.ora_server === true, r);
r = await as('authenticated', B, `update public.aziende set in_chiamata_da = null where telefono = '+390824444555' returning in_chiamata_dal`);
check('"Non l\'ho chiamato" toglie anche l\'ora', r.rows?.[0]?.in_chiamata_dal === null, r);
r = await as('authenticated', B, `select (public.registra_chiamata($1,'segreteria','Benedetto'))->'azienda'->>'tentativi' t`, [id]);
r2 = await as('authenticated', L, `select (public.registra_chiamata($1,'non_risponde','Luca'))->'azienda'->>'tentativi' t`, [id]);
check('due chiamate di fila: tentativi contati entrambi (3 e 4)', r.rows?.[0]?.t === '3' && r2.rows?.[0]?.t === '4', [r, r2]);

r = await as('authenticated', B, `update public.storico_chiamate set nota='x'`);
check('storico non modificabile', !!r.err, r);
r = await as('authenticated', B, `update public.aziende set note='Chiedere di Mario', telefono='0824 777 888' where id=$1 returning telefono`, [id]);
check('modifica azienda + normalizza', r.rows?.[0]?.telefono === '+390824777888', r);
r = await as('authenticated', B, `insert into public.aziende (nome_azienda, telefono) select 'Imp '||g, '0824 55'||lpad(g::text,4,'0') from generate_series(1,3) g on conflict (telefono) do nothing returning id`);
check('importazione multipla', r.rows?.length === 3, r);
r = await as('authenticated', B, `delete from public.aziende where id=$1`, [id]);
r = await as('authenticated', B, `select count(*)::int n from public.storico_chiamate where azienda_id=$1`, [id]);
check('eliminazione azienda cancella anche lo storico', r.rows?.[0]?.n === 0, r);
r = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1`);
check('tabelle in realtime', r.rows.map(x=>x.tablename).join() === 'aziende,storico_chiamate', r.rows);
r = await db.query(`select count(*)::int n from public.membri`);
check('membri = utenti esistenti al momento dello script', r.rows[0].n === 2, r.rows);
r = await db.query(`select relname, relrowsecurity from pg_class where relname in ('aziende','storico_chiamate','membri')`);
check('RLS attivo su tutte', r.rows.every(x => x.relrowsecurity), r.rows);
console.log(`\n${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
