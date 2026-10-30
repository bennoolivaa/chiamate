import { SUPABASE_URL, SUPABASE_KEY, MINUTI_IN_CHIAMATA, ESITI_NASCOSTI } from './config.js';
import { normalizzaTelefono, inizioGiorno } from './utili.js';

// Stato condiviso dall'intera app. Le schermate si ridisegnano quando cambia.
export const stato = {
  pronto: false,        // sappiamo se l'utente è collegato
  utente: null,
  nome: '',
  membro: true,
  caricamento: false,
  aziende: [],
  storico: [],
  online: navigator.onLine,
};

const ascoltatori = new Set();
export function ascolta(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); }
function avvisa() { ascoltatori.forEach(fn => fn()); }
function cambia(parziale) { Object.assign(stato, parziale); avvisa(); }

let db = null;
let canale = null;

// "Resta collegato": se tolto, la sessione si perde alla chiusura del browser
const memoria = {
  getItem: k => localStorage.getItem(k) ?? sessionStorage.getItem(k),
  setItem: (k, v) => {
    if (localStorage.getItem('restaCollegato') === 'no') { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
    else localStorage.setItem(k, v);
  },
  removeItem: k => { localStorage.removeItem(k); sessionStorage.removeItem(k); },
};

export async function avvia(clientDiProva) {
  db = clientDiProva || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storage: memoria, persistSession: true, autoRefreshToken: true },
  });
  db.auth.onAuthStateChange((evento, sessione) => {
    const utente = sessione?.user || null;
    const cambiato = utente?.id !== stato.utente?.id;
    cambia({ pronto: true, utente, nome: utente?.user_metadata?.nome || '' });
    if (utente && cambiato) setTimeout(caricaTutto, 0);
    if (!utente) { chiudiCanale(); cambia({ aziende: [], storico: [] }); }
  });
  window.addEventListener('online', () => { cambia({ online: true }); if (stato.utente) caricaTutto(); });
  window.addEventListener('offline', () => cambia({ online: false }));
  // Il telefono "addormenta" la connessione: al ritorno sull'app ricarichiamo
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && stato.utente) caricaTutto();
  });
  // Per far scadere da soli i "sto chiamando"
  setInterval(avvisa, 30000);
}

export async function accedi(email, password, restaCollegato) {
  localStorage.setItem('restaCollegato', restaCollegato ? 'si' : 'no');
  const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function esci() {
  await db.auth.signOut();
}

export async function impostaNome(nome) {
  const { data, error } = await db.auth.updateUser({ data: { nome } });
  if (error) throw error;
  cambia({ nome, utente: data.user });
}

async function leggiTutte(tabella, ordine) {
  const righe = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await db.from(tabella).select('*').order(ordine).range(da, da + 999);
    if (error) throw error;
    righe.push(...data);
    if (data.length < 1000) return righe;
  }
}

let caricamentoInCorso = null;
export function caricaTutto() {
  if (caricamentoInCorso) return caricamentoInCorso;
  cambia({ caricamento: true });
  caricamentoInCorso = (async () => {
    try {
      const { data: membro } = await db.rpc('e_membro');
      const [aziende, storico] = await Promise.all([leggiTutte('aziende', 'id'), leggiTutte('storico_chiamate', 'id')]);
      cambia({ aziende, storico, membro: membro !== false });
      apriCanale();
    } catch (e) {
      console.warn(e);
    } finally {
      caricamentoInCorso = null;
      cambia({ caricamento: false });
    }
  })();
  return caricamentoInCorso;
}

function apriCanale() {
  if (canale) return;
  canale = db.channel('modifiche')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'aziende' }, ({ eventType, new: nuova, old }) => {
      if (eventType === 'DELETE') togliAzienda(old.id);
      else mettiAzienda(nuova);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'storico_chiamate' }, ({ new: riga }) => {
      if (stato.storico.some(s => s.id === riga.id)) return;
      const senzaProvvisoria = stato.storico.filter(s => !(String(s.id).startsWith('temp-') && s.azienda_id === riga.azienda_id));
      cambia({ storico: [...senzaProvvisoria, riga] });
    })
    .subscribe();
}

function chiudiCanale() {
  if (canale) db.removeChannel(canale);
  canale = null;
}

function mettiAzienda(a) {
  const altre = stato.aziende.filter(x => x.id !== a.id);
  cambia({ aziende: [...altre, a] });
}

function togliAzienda(id) {
  cambia({ aziende: stato.aziende.filter(x => x.id !== id), storico: stato.storico.filter(s => s.azienda_id !== id) });
}

// ---- Azioni ----

export async function segnaInChiamata(id) {
  const a = stato.aziende.find(x => x.id === id);
  if (a) mettiAzienda({ ...a, in_chiamata_da: stato.nome, in_chiamata_dal: new Date().toISOString() });
  const { error } = await db.rpc('segna_in_chiamata', { p_azienda_id: id, p_nome: stato.nome });
  if (error) throw error;
}

export async function registraChiamata(id, { esito, nota, referente, email, richiamo_il, appuntamento_il, appuntamento_luogo }) {
  const { data, error } = await db.rpc('registra_chiamata', {
    p_azienda_id: id, p_esito: esito, p_nome: stato.nome, p_nota: nota || null,
    p_referente: referente || null, p_email: email || null,
    p_richiamo_il: richiamo_il || null, p_appuntamento_il: appuntamento_il || null,
    p_appuntamento_luogo: appuntamento_luogo || null,
  });
  if (error) throw error;
  mettiAzienda(data);
  // la riga di storico arriva in tempo reale; intanto la mostriamo subito
  cambia({ storico: [...stato.storico, { id: `temp-${Date.now()}`, azienda_id: id, utente_nome: stato.nome, chiamata_il: new Date().toISOString(), esito, nota: nota || null }] });
  setTimeout(() => cambia({ storico: stato.storico.filter(s => !String(s.id).startsWith('temp-')) }), 4000);
  return data;
}

export async function aggiungiAzienda(campi, { chiamo = false } = {}) {
  const riga = { ...pulisci(campi), creato_da: stato.nome };
  const { data, error } = await db.from('aziende').insert(riga).select().single();
  if (error) throw error;
  mettiAzienda(data);
  if (chiamo) await segnaInChiamata(data.id);
  return data;
}

export async function aggiornaAzienda(id, campi) {
  const { data, error } = await db.from('aziende').update(pulisci(campi)).eq('id', id).select().single();
  if (error) throw error;
  mettiAzienda(data);
  return data;
}

export async function eliminaAzienda(id) {
  const { error } = await db.from('aziende').delete().eq('id', id);
  if (error) throw error;
  togliAzienda(id);
}

// Ritorna quante aziende sono state davvero aggiunte (i doppioni vengono saltati)
export async function importaAziende(righe, avanzamento) {
  let aggiunte = 0;
  for (let i = 0; i < righe.length; i += 500) {
    const blocco = righe.slice(i, i + 500).map(r => ({ ...pulisci(r), creato_da: stato.nome }));
    const { data, error } = await db.from('aziende')
      .upsert(blocco, { onConflict: 'telefono', ignoreDuplicates: true }).select();
    if (error) throw error;
    aggiunte += data.length;
    data.forEach(mettiAzienda);
    avanzamento?.(Math.min(i + 500, righe.length));
  }
  return aggiunte;
}

function pulisci(campi) {
  const r = {};
  for (const [k, v] of Object.entries(campi)) r[k] = typeof v === 'string' ? (v.trim() || null) : v;
  if ('telefono' in r) r.telefono = normalizzaTelefono(r.telefono);
  return r;
}

// Ricerca su Pagine Gialle / Pagine Bianche tramite la funzione "cerca-numero" su Supabase.
// Se la funzione non c'è o non trova nulla, ritorna una lista vuota.
export async function cercaOnline(telefono) {
  try {
    const { data, error } = await db.functions.invoke('cerca-numero', { body: { telefono } });
    if (error) throw error;
    return data?.risultati || [];
  } catch (e) {
    console.warn('Ricerca online non riuscita', e);
    return [];
  }
}

// ---- Letture comode ----

export function trovaPerTelefono(testo) {
  const t = normalizzaTelefono(testo);
  return t ? stato.aziende.find(a => a.telefono === t) : null;
}

export function chiChiama(a) {
  if (!a?.in_chiamata_da || !a.in_chiamata_dal) return null;
  const scaduta = Date.now() - new Date(a.in_chiamata_dal) > MINUTI_IN_CHIAMATA * 60000;
  return scaduta ? null : a.in_chiamata_da;
}

// "Sto chiamando" scaduto senza esito salvato = l'hanno chiamata ma non hanno scritto com'è andata
export function chiamataSenzaEsito(a) {
  if (!a?.in_chiamata_da || !a.in_chiamata_dal || chiChiama(a)) return null;
  return { chi: a.in_chiamata_da, quando: a.in_chiamata_dal };
}

export async function liberaChiamata(id) {
  await aggiornaAzienda(id, { in_chiamata_da: null, in_chiamata_dal: null });
}

export function chiamaUnAltro(a) {
  const chi = chiChiama(a);
  return chi && chi !== stato.nome ? chi : null;
}

export function storicoDi(id) {
  return stato.storico.filter(s => s.azienda_id === id).sort((a, b) => new Date(b.chiamata_il) - new Date(a.chiamata_il));
}

export function comuni() {
  return [...new Set(stato.aziende.map(a => a.comune).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
}

// Priorità nella lista "Da chiamare": prima i richiami di oggi, poi i nuovi, poi chi non ha risposto (dal più vecchio).
function priorita(a) {
  const fineOggi = inizioGiorno().getTime() + 86400000;
  if (a.richiamo_il && new Date(a.richiamo_il) < fineOggi) return 0;
  if (a.esito === 'nuovo' && !a.in_chiamata_dal) return 1;
  if (['nuovo', 'non_risponde', 'segreteria'].includes(a.esito)) return 2;
  if (a.richiamo_il) return 4;
  return 3;
}

function ultimoContatto(a) {
  return Math.max(a.ultima_chiamata_il ? new Date(a.ultima_chiamata_il) : 0, a.in_chiamata_dal ? new Date(a.in_chiamata_dal) : 0);
}

export function ordinaDaChiamare(lista) {
  return [...lista].sort((a, b) =>
    priorita(a) - priorita(b)
    || (a.richiamo_il && b.richiamo_il ? new Date(a.richiamo_il) - new Date(b.richiamo_il) : 0)
    || ultimoContatto(a) - ultimoContatto(b)
    || a.nome_azienda.localeCompare(b.nome_azienda, 'it'));
}

export function daChiamare({ comune = '', esito = '' } = {}) {
  return ordinaDaChiamare(stato.aziende.filter(a =>
    (!comune || a.comune === comune)
    && (esito ? a.esito === esito : !ESITI_NASCOSTI.includes(a.esito))));
}
