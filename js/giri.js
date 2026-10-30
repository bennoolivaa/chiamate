// Consiglia giorno e ora per una nuova demo, in modo che Alessandro guidi il meno possibile.
// Gli appuntamenti hanno già un orario, quindi l'ordine del giro è fisso: per ogni giorno e per ogni
// buco tra due tappe proviamo a inserire la nuova demo e calcoliamo quanta strada in più costa.
import { GIRI } from './config.js';
import { inizioGiorno } from './utili.js';

let elenco = null;
let caricamento = null;

export function caricaComuni() {
  if (elenco) return Promise.resolve(elenco);
  caricamento ||= fetch('dati/comuni.json').then(r => r.json()).then(righe => {
    elenco = new Map();
    for (const [nome, sigla, lat, lon] of righe) {
      const k = chiave(nome);
      if (!elenco.has(k)) elenco.set(k, { nome, sigla, lat, lon });
    }
    return elenco;
  }).catch(() => { caricamento = null; return null; });
  return caricamento;
}

export function comuniPronti() { return !!elenco; }

function chiave(nome) {
  return (nome || '').replace(/\(.*?\)/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

export function trovaComune(nome) {
  return elenco?.get(chiave(nome)) || null;
}

const PROVINCE = {
  AV: 'Avellino', BN: 'Benevento', CE: 'Caserta', NA: 'Napoli', SA: 'Salerno',
  CB: 'Campobasso', IS: 'Isernia', PZ: 'Potenza', MT: 'Matera', FG: 'Foggia', BA: 'Bari', BT: 'Barletta-Andria-Trani',
  BR: 'Brindisi', LE: 'Lecce', TA: 'Taranto', RM: 'Roma', LT: 'Latina', FR: 'Frosinone', RI: 'Rieti', VT: 'Viterbo',
};

// Sigla della provincia di un comune ("BN"), vuota se il comune non è nell'elenco
export function provinciaDi(nomeComune) {
  return trovaComune(nomeComune)?.sigla || '';
}

export function nomeProvincia(sigla) {
  return PROVINCE[sigla] ? `${sigla} – ${PROVINCE[sigla]}` : sigla;
}

function km(a, b) {
  const r = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * r / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

export function kmStrada(a, b) {
  return Math.round(km(a, b) * GIRI.fattoreStrada);
}

// Minuti di macchina, arrotondati a 5. Comune sconosciuto: 45 minuti per prudenza.
export function minutiViaggio(a, b) {
  if (!a || !b) return 45;
  if (a.nome === b.nome) return 10;
  return Math.ceil(km(a, b) * GIRI.fattoreStrada / GIRI.velocita * 60 / 5) * 5;
}

const minuti = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const alle = (giorno, min) => { const d = new Date(giorno); d.setHours(0, min, 0, 0); return d; };
const minutiDelGiorno = d => d.getHours() * 60 + d.getMinutes();

function giorniPossibili(adesso) {
  const domani = inizioGiorno(adesso); domani.setDate(domani.getDate() + 1);
  const dal = new Date(`${GIRI.dal}T00:00`), al = new Date(`${GIRI.al}T00:00`);
  const giorni = [];
  for (let d = new Date(Math.max(domani, dal)); d <= al; d.setDate(d.getDate() + 1)) {
    if (!GIRI.weekend && (d.getDay() === 0 || d.getDay() === 6)) continue;
    giorni.push(new Date(d));
  }
  return giorni;
}

export function tappeDelGiorno(aziende, giorno, escludiId) {
  const fine = giorno.getTime() + 86400000;
  return aziende
    .filter(a => a.id !== escludiId && a.esito === 'demo_fissata' && a.appuntamento_il)
    .filter(a => { const t = new Date(a.appuntamento_il).getTime(); return t >= giorno.getTime() && t < fine; })
    .map(a => ({ azienda: a, comune: trovaComune(a.comune), inizio: minutiDelGiorno(new Date(a.appuntamento_il)) }))
    .sort((x, y) => x.inizio - y.inizio);
}

// Minuti di macchina totali di una giornata: partenza → tappe → ritorno
export function stradaDelGiorno(tappe) {
  const base = trovaComune(GIRI.partenza);
  const luoghi = [base, ...tappe.map(t => t.comune), base];
  let totale = 0;
  for (let i = 1; i < luoghi.length; i++) totale += minutiViaggio(luoghi[i - 1], luoghi[i]);
  return totale;
}

// Primo orario valido nel buco [da, a] per una demo, evitando la pausa pranzo; arrotondato al quarto d'ora
function orarioNelBuco(da, a) {
  let inizio = Math.ceil(da / 15) * 15;
  const [p1, p2] = GIRI.pausa.map(minuti);
  if (inizio < p2 && inizio + GIRI.durataDemo > p1) inizio = p2;
  return inizio <= a ? inizio : null;
}

export function consigliaDemo(nomeComune, aziende, { escludiId, adesso = new Date(), quante = 3 } = {}) {
  if (!elenco) return { attesa: true };
  const nuovo = trovaComune(nomeComune);
  if (!nuovo) return { problema: nomeComune ? `Non conosco il comune "${nomeComune}": controlla come è scritto.` : 'Manca il comune dell\'azienda.' };
  const base = trovaComune(GIRI.partenza);
  const giorni = giorniPossibili(adesso);
  if (!giorni.length) return { problema: 'Il periodo degli appuntamenti è finito (vedi GIRI in config.js).' };

  const apertura = minuti(GIRI.inizio), chiusura = minuti(GIRI.fine);
  const proposte = [];
  for (const giorno of giorni) {
    const tappe = tappeDelGiorno(aziende, giorno, escludiId);
    if (tappe.length >= GIRI.massimoAlGiorno) continue;
    let migliore = null;
    for (let i = 0; i <= tappe.length; i++) {
      const prima = tappe[i - 1], dopo = tappe[i];
      const luogoPrima = prima ? prima.comune : base, luogoDopo = dopo ? dopo.comune : base;
      const andata = minutiViaggio(luogoPrima, nuovo), ritorno = minutiViaggio(nuovo, luogoDopo);
      const da = prima ? Math.max(apertura, prima.inizio + GIRI.durataDemo + GIRI.margine + andata) : apertura;
      const ultimoInizio = (dopo ? dopo.inizio - GIRI.margine - ritorno : chiusura) - GIRI.durataDemo;
      const inizio = orarioNelBuco(da, ultimoInizio);
      if (inizio === null) continue;
      const strada = andata + ritorno - minutiViaggio(luogoPrima, luogoDopo);
      if (!migliore || strada < migliore.strada) migliore = { inizio, strada };
    }
    if (!migliore) continue;
    const vicina = tappe.filter(t => t.comune).sort((x, y) => km(x.comune, nuovo) - km(y.comune, nuovo))[0];
    proposte.push({
      quando: alle(giorno, migliore.inizio),
      stradaInPiu: migliore.strada,
      demoQuelGiorno: tappe.length,
      vicina: vicina ? { comune: vicina.comune.nome, km: kmStrada(vicina.comune, nuovo) } : null,
      kmDaBase: kmStrada(base, nuovo),
    });
  }
  // meno strada in più; a parità meglio un giorno già avviato, poi il più vicino nel tempo
  proposte.sort((a, b) => a.stradaInPiu - b.stradaInPiu || b.demoQuelGiorno - a.demoQuelGiorno || a.quando - b.quando);
  if (!proposte.length) return { problema: 'Tutti i giorni sono pieni: niente orari liberi nel periodo.' };
  return { proposte: proposte.slice(0, quante), comune: nuovo };
}
