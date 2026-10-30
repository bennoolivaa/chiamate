// Prova della logica dei giri: node test/test-giri.mjs (dalla cartella del progetto)
import fs from 'fs';
globalThis.fetch = async u => ({ json: async () => JSON.parse(fs.readFileSync(new URL('../' + u, import.meta.url))) });
const { caricaComuni, consigliaDemo, minutiViaggio, trovaComune } = await import('../js/giri.js');
await caricaComuni();

let ok = 0, ko = 0;
const check = (nome, cond, info) => { cond ? ok++ : ko++; console.log(cond ? 'OK  ' : 'FAIL', nome, cond ? '' : JSON.stringify(info, null, 1)); };
const adesso = new Date('2026-11-10T10:00');
let id = 1;
const demo = (comune, quando) => ({ id: id++, esito: 'demo_fissata', comune, appuntamento_il: new Date(quando).toISOString() });
const giorno = d => d.toISOString ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : d;
const ora = d => d.toTimeString().slice(0, 5);

const base = [
  demo('Avellino', '2026-11-17T09:30'), demo('Avellino', '2026-11-17T11:30'), demo('Avellino', '2026-11-17T15:00'),
  demo('Caserta', '2026-11-18T10:00'), demo('Caserta', '2026-11-18T15:00'),
];
let r = consigliaDemo('Atripalda', base, { adesso });   // a 4 km da Avellino
check('vicino ad Avellino -> 17 novembre', giorno(r.proposte?.[0]?.quando) === '2026-11-17', r);
check('orario non sovrapposto alle demo del 17', r.proposte && !['09:30', '11:30', '15:00'].includes(ora(r.proposte[0].quando)), r.proposte?.[0]);
r = consigliaDemo('Maddaloni', base, { adesso });       // vicino a Caserta
check('vicino a Caserta -> 18 novembre', giorno(r.proposte?.[0]?.quando) === '2026-11-18', r);

// Orari: tra le demo deve starci viaggio + margine + durata
const p = consigliaDemo('Atripalda', base, { adesso }).proposte[0];
const inizio = p.quando.getHours() * 60 + p.quando.getMinutes();
const fineDemoPrima = 11 * 60 + 30 + 60 + 15 + minutiViaggio(trovaComune('Avellino'), trovaComune('Atripalda'));
const ok17 = (inizio >= fineDemoPrima && inizio + 60 + 15 + 10 <= 15 * 60) || inizio + 60 + 15 + 10 <= 9 * 60 + 30 || inizio >= 16 * 60 + 15;
check('orario compatibile con viaggi e margini', ok17, { proposta: ora(p.quando) });
check('niente demo durante la pausa pranzo', !(inizio < 14 * 60 && inizio + 60 > 13 * 60), ora(p.quando));

// Giornata piena: 5 demo -> non propone quel giorno
const pieno = [9, 10.5, 12, 15, 16.5].map(h => demo('Avellino', `2026-11-17T${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`));
r = consigliaDemo('Atripalda', pieno, { adesso, quante: 20 });
check('giorno pieno escluso', r.proposte && !r.proposte.some(x => giorno(x.quando) === '2026-11-17'), r.proposte?.map(x => giorno(x.quando)));

// Weekend esclusi, passato escluso
r = consigliaDemo('Benevento', [], { adesso, quante: 50 });
check('niente sabato e domenica', r.proposte.every(x => ![0, 6].includes(x.quando.getDay())), null);
check('niente oggi o giorni passati', r.proposte.every(x => x.quando > new Date('2026-11-11T00:00')), null);
check('niente prima delle 9 o dopo le 18', r.proposte.every(x => x.quando.getHours() >= 9 && x.quando.getHours() * 60 + x.quando.getMinutes() + 60 <= 19 * 60), null);

// Comune sconosciuto / mancante / periodo finito
check('comune sconosciuto', !!consigliaDemo('Paperopoli', base, { adesso }).problema, null);
check('comune mancante', !!consigliaDemo('', base, { adesso }).problema, null);
check('periodo finito', !!consigliaDemo('Avellino', base, { adesso: new Date('2026-12-15') }).problema, null);
check('scrittura diversa: "SANT\'AGATA DE\' GOTI (BN)"', !!trovaComune("SANT'AGATA DE' GOTI (BN)"), null);

// Demo lontana nel pomeriggio: la nuova a Caserta non può stare a ridosso di una demo ad Ariano Irpino
const lontano = [demo('Ariano Irpino', '2026-11-12T14:00')];
r = consigliaDemo('Caserta', lontano, { adesso, quante: 10 });
const g12 = r.proposte.find(x => giorno(x.quando) === '2026-11-12');
const viaggio = minutiViaggio(trovaComune('Caserta'), trovaComune('Ariano Irpino'));
const i12 = g12 && g12.quando.getHours() * 60 + g12.quando.getMinutes();
check(`demo lontana: rispetta ${viaggio} min di viaggio`, !g12 || i12 + 60 + 15 + viaggio <= 14 * 60 || i12 >= 15 * 60 + 15 + viaggio, g12 && ora(g12.quando));
check('demo lontana: preferisce un giorno libero o tappa compatibile', r.proposte[0].stradaInPiu <= 2 * minutiViaggio(trovaComune('Benevento'), trovaComune('Caserta')), r.proposte[0]);

console.log(`\n${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);
