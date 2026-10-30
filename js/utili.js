// Stessa regola di public.normalizza_telefono nello script SQL.
export function normalizzaTelefono(testo) {
  let s = String(testo || '').replace(/[^0-9+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) s = '+' + s.slice(1).replace(/\+/g, '');
  else if ((s.startsWith('390') && s.length >= 9) || (s.startsWith('393') && s.length >= 12)) s = '+' + s;
  else s = '+39' + s;
  return s.length >= 9 ? s : '';
}

export function telefonoLeggibile(t) {
  if (!t) return '';
  if (!t.startsWith('+39')) return t;
  const n = t.slice(3);
  return n.startsWith('3')
    ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
    : `${n.slice(0, 4)} ${n.slice(4)}`;
}

// ---- Date ----
const GIORNO = 86400000;

export function inizioGiorno(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}

export function stessoGiorno(a, b) {
  return inizioGiorno(a).getTime() === inizioGiorno(b).getTime();
}

function ora(d) {
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function giornoRelativo(data) {
  const d = new Date(data);
  const diff = Math.round((inizioGiorno(d) - inizioGiorno()) / GIORNO);
  if (diff === 0) return 'oggi';
  if (diff === 1) return 'domani';
  if (diff === -1) return 'ieri';
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function dataOra(data) {
  if (!data) return '';
  return `${giornoRelativo(data)} ${ora(new Date(data))}`;
}

export function soloOra(data) {
  return data ? ora(new Date(data)) : '';
}

export function giornoLungo(data) {
  const d = new Date(data);
  const testo = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const rel = giornoRelativo(d);
  return ['oggi', 'domani', 'ieri'].includes(rel) ? `${rel[0].toUpperCase() + rel.slice(1)} · ${testo}` : testo[0].toUpperCase() + testo.slice(1);
}

export function minutiFa(data) {
  return Math.max(0, Math.round((Date.now() - new Date(data)) / 60000));
}

// Per <input type="datetime-local">
export function versoInput(data) {
  if (!data) return '';
  const d = new Date(data);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function daInput(valore) {
  return valore ? new Date(valore).toISOString() : null;
}

export function scorciatoiaRichiamo(quale) {
  const d = new Date();
  if (quale === 'oggi') {
    d.setMinutes(d.getMinutes() + 60);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    return d.toISOString();
  }
  d.setDate(d.getDate() + (quale === 'domani' ? 1 : 3));
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

export function dataPerFile(data) {
  if (!data) return '';
  const d = new Date(data);
  return `${d.toLocaleDateString('it-IT')} ${ora(d)}`;
}

// ---- File CSV ----
export function leggiTabella(testo) {
  const righe = testo.replace(/^﻿/, '').split(/\r?\n/).filter(r => r.trim());
  if (!righe.length) return [];
  const prima = righe[0];
  const separatore = ['\t', ';', ','].map(s => [s, prima.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  return righe.map(r => dividiRiga(r, separatore));
}

function dividiRiga(riga, sep) {
  const celle = [];
  let cella = '', tra = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (tra) {
      if (c === '"' && riga[i + 1] === '"') { cella += '"'; i++; }
      else if (c === '"') tra = false;
      else cella += c;
    } else if (c === '"') tra = true;
    else if (c === sep) { celle.push(cella.trim()); cella = ''; }
    else cella += c;
  }
  celle.push(cella.trim());
  return celle;
}

const INTESTAZIONI = {
  nome_azienda: /azienda|ragione|nome|impresa|ditta/i,
  telefono: /tel|cell|numero|phone/i,
  comune: /comune|citt|localit|paese|city/i,
  email: /mail/i,
};

// Capisce quale colonna è cosa, con o senza riga di intestazione.
export function capisciColonne(righe) {
  const prima = righe[0] || [];
  const colonne = {};
  const primaHaNumeri = prima.some(c => c.replace(/\D/g, '').length >= 6);
  if (!primaHaNumeri) prima.forEach((cella, i) => {
    for (const [campo, regola] of Object.entries(INTESTAZIONI)) {
      if (colonne[campo] === undefined && regola.test(cella) && !Object.values(colonne).includes(i)) colonne[campo] = i;
    }
  });
  if (colonne.telefono !== undefined && colonne.nome_azienda !== undefined) return { colonne, intestazione: true };

  const esempio = righe.slice(0, 20);
  const quanti = (i, test) => esempio.filter(r => test(r[i] || '')).length;
  const indovina = {};
  const numColonne = Math.max(...esempio.map(r => r.length));
  for (let i = 0; i < numColonne; i++) {
    if (indovina.telefono === undefined && quanti(i, v => v.replace(/\D/g, '').length >= 6 && !/[a-z]/i.test(v)) > esempio.length / 2) indovina.telefono = i;
    else if (indovina.email === undefined && quanti(i, v => v.includes('@')) > esempio.length / 3) indovina.email = i;
    else if (indovina.nome_azienda === undefined) indovina.nome_azienda = i;
    else if (indovina.comune === undefined) indovina.comune = i;
  }
  return { colonne: indovina, intestazione: false };
}

export function creaCsv(intestazioni, righe) {
  const cella = v => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [intestazioni, ...righe].map(r => r.map(cella).join(';')).join('\r\n');
}

export function scaricaFile(nome, contenuto, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Testo copiato da Google Maps, Pagine Gialle, siti ecc. ----
const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RE_TELEFONO = /(?:\+|00)?[\d][\d\s.\-/()]{5,16}\d/g;
const RE_INDIRIZZO = /^(via|viale|v\.le|piazza|p\.zza|piazzale|corso|c\.so|contrada|c\.da|località|loc\.|strada|vico|largo|traversa|zona)\b/i;
const RE_ETICHETTA = /^(indirizzo|telefono|tel\.?|cellulare|cell\.?|email|e-mail|nome|sito( web)?|orari?)\s*:\s*/i;

function trovaTelefono(testo) {
  for (const m of testo.match(RE_TELEFONO) || []) {
    const cifre = m.replace(/\D/g, '');
    if (cifre.length >= 6 && cifre.length <= 13 && !/^\d{5}$/.test(cifre) && /^(\+|00|0|3)/.test(m.trim())) return m.trim();
  }
  return '';
}

export function maiuscoleIniziali(testo) {
  return testo.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

function trovaComune(indirizzo) {
  const conCap = indirizzo.match(/\b\d{5}\s+([^,()\d]+?)\s*(?:\(?\b[A-Z]{2}\b\)?)?\s*(?:,|-|$)/);
  if (conCap) return conCap[1].trim();
  const conProvincia = indirizzo.match(/([\p{L}'’ ]+?)\s*\([A-Z]{2}\)/u);
  return conProvincia ? conProvincia[1].split(/[,-]/).pop().trim() : '';
}

export function leggiTestoCopiato(testo) {
  const trovato = { telefono: '', nome_azienda: '', comune: '', indirizzo: '', email: '' };
  const righe = String(testo || '').split(/\r?\n/).map(r => r.trim()).filter(r => r && !/^https?:\/\//i.test(r));
  const tutto = righe.join('\n');
  trovato.email = (tutto.match(RE_EMAIL) || [''])[0];
  trovato.telefono = trovaTelefono(tutto.replace(RE_EMAIL, ''));
  for (const grezza of righe) {
    const riga = grezza.replace(RE_ETICHETTA, '');
    const eIndirizzo = RE_INDIRIZZO.test(riga) || /\b\d{5}\b\s+\p{L}/u.test(riga);
    if (eIndirizzo && !trovato.indirizzo) { trovato.indirizzo = riga; continue; }
    const soloNumeri = riga.replace(/[\d\s.+\-/()]/g, '') === '';
    const eValutazione = /^\d[,.]\d\s*(\(|★|stelle)/i.test(riga) || riga.includes('★');
    if (!trovato.nome_azienda && !eIndirizzo && !soloNumeri && !eValutazione && !RE_EMAIL.test(riga)
        && /\p{L}{2}/u.test(riga) && riga.length <= 80 && !RE_ETICHETTA.test(grezza.replace(/^nome\s*:\s*/i, ''))) {
      trovato.nome_azienda = riga;
    }
  }
  const comune = trovato.indirizzo ? trovaComune(trovato.indirizzo) : '';
  trovato.comune = comune ? maiuscoleIniziali(comune) : '';
  return trovato;
}

// ---- Messaggi di errore in italiano semplice ----
export function messaggioErrore(e) {
  const testo = `${e?.message || ''} ${e?.code || ''}`;
  if (!navigator.onLine || /fetch|network|load failed/i.test(testo)) return 'Manca internet, riprova tra poco.';
  if (/invalid login|credentials/i.test(testo)) return 'Email o password sbagliate. Riprova.';
  if (/23505|duplicate|unique/i.test(testo)) return 'Questo numero c\'è già.';
  if (/telefono non valido/i.test(testo)) return 'Il numero di telefono non sembra giusto.';
  if (/jwt|PGRST301|401/i.test(testo)) return 'Sei rimasto scollegato. Tocca "Altro" > "Esci" e rientra.';
  return 'Qualcosa non ha funzionato. Riprova tra poco.';
}
