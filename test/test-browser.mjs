// Prova l'app nel browser con dati finti (telefono 390px) e salva gli screenshot.
// Uso: cd test && npm install && node test-browser.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cartellaFoto = path.join(radice, 'screenshot');
fs.mkdirSync(cartellaFoto, { recursive: true });

const tipi = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const file = path.join(radice, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(radice) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': tipi[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const indirizzo = `http://localhost:${server.address().port}/?demo`;

const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync(cache) ? cache : undefined) });
const contesto = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'it-IT', timezoneId: 'Europe/Rome', permissions: ['clipboard-read', 'clipboard-write'],
});
// Data fissa: 10 novembre 2026, ore 10 (così gli appuntamenti di prova del 17-18 sono nel futuro)
await contesto.addInitScript(() => {
  const vero = Date, inizio = new vero('2026-11-10T10:00:00+01:00').getTime(), partenza = vero.now();
  class FintaData extends vero {
    constructor(...a) { super(...(a.length ? a : [inizio + (vero.now() - partenza)])); }
    static now() { return inizio + (vero.now() - partenza); }
  }
  window.Date = FintaData;
  window.__chiamate = [];
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="tel:"]');
    if (a) { e.preventDefault(); window.__chiamate.push(a.getAttribute('href')); }
  });
});

const page = await contesto.newPage();
const erroriPagina = [];
page.on('pageerror', e => erroriPagina.push(e.message));
page.on('console', m => { if (m.type() === 'error') erroriPagina.push(m.text()); });
const domande = [];
page.on('dialog', d => { domande.push(d.message()); d.accept(); });

let ok = 0, ko = 0;
async function prova(nome, fn) {
  try { await fn(); ok++; console.log('OK  ', nome); }
  catch (e) { ko++; console.log('FAIL', nome, '-', e.message.split('\n')[0]); }
}
function verifica(cond, msg) { if (!cond) throw new Error(msg); }
const foto = nome => page.screenshot({ path: path.join(cartellaFoto, nome + '.png') });
const testo = () => page.locator('body').innerText();
const tocca = nome => page.getByRole('button', { name: nome, exact: true }).first().click();
const aspetta = ms => page.waitForTimeout(ms);
const finto = (codice, arg) => page.evaluate(codice, arg);

await prova('Apertura: compare subito la schermata di accesso (niente "Un attimo…" bloccato)', async () => {
  const pulito = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await pulito.newPage();
  await p2.goto(indirizzo);
  await p2.getByRole('button', { name: 'Entra' }).waitFor({ timeout: 3000 });
  await pulito.close();
});

await page.goto(indirizzo);

await prova('Accesso: password sbagliata mostra un messaggio chiaro', async () => {
  await foto('01-accesso');
  verifica(await page.getByLabel('Resta collegato').isChecked(), '"Resta collegato" non attivo');
  await page.getByLabel('Email').fill('benedetto@esempio.it');
  await page.getByLabel('Password', { exact: true }).fill('sbagliata');
  await tocca('Entra');
  await page.getByText('Email o password sbagliate').waitFor();
});

await prova('Accesso e scelta del nome', async () => {
  await page.getByLabel('Password', { exact: true }).fill('prova');
  await tocca('Entra');
  await page.getByText('Chi sei?').waitFor();
  await foto('02-chi-sei');
  await tocca('Benedetto');
  await page.getByRole('heading', { name: 'Ciao Benedetto' }).waitFor();
  await foto('00-oggi');
});

await prova('Oggi: cose da fare in ordine di precedenza, con mail da inviare', async () => {
  const t = await testo();
  const pos = ['Richiamare in ritardo', 'Richiamare oggi', 'Mail da inviare', 'Demo oggi e domani'].map(x => t.indexOf(x));
  verifica(pos.slice(0, 3).every(x => x >= 0) && pos[0] < pos[1] && pos[1] < pos[2], JSON.stringify(pos));
  verifica(t.includes('chiamate oggi') && t.includes('Inizia a chiamare'), 'mancano numeri o tasto');
  const mailto = await page.getByRole('link', { name: /Scrivi la mail/ }).first().getAttribute('href');
  verifica(mailto.startsWith('mailto:') && decodeURIComponent(mailto).includes('Aedify'), mailto);
});

await prova('Oggi: "Solo miei" nasconde le cose da fare degli altri', async () => {
  const prima = await page.locator('.voce-mail').count();
  await tocca('Solo miei');
  const dopo = await page.locator('.voce-mail').count();
  verifica(dopo < prima, `mail: ${prima} -> ${dopo}`);
  await tocca('Tutti');
});

await prova('Oggi: "Mail inviata ✓" la toglie e la ripropone da richiamare tra 3 giorni', async () => {
  const prima = await page.locator('.voce-mail').count();
  await page.locator('.voce-mail').first().getByRole('button', { name: 'Mail inviata ✓' }).click();
  await page.getByText('Te la ripropongo da richiamare').first().waitFor();
  await page.waitForFunction(n => document.querySelectorAll('.voce-mail').length === n - 1, prima, { timeout: 3000 });
  const a = await finto(async () => (await window.__finto.from('aziende').select('*')).data.find(x => x.esito === 'manda_mail' && x.mail_inviata_il));
  verifica(a && a.richiamo_il && new Date(a.richiamo_il) > new Date(Date.now() + 2 * 86400000), JSON.stringify(a && { richiamo: a.richiamo_il }));
});

await prova('Oggi: "Inizia a chiamare" apre il contatto migliore', async () => {
  await tocca('Inizia a chiamare ›');
  await page.locator('.scheda-nome').waitFor();
  await page.getByRole('button', { name: 'Torna alla schermata Oggi' }).click();
  await page.getByRole('heading', { name: 'Ciao Benedetto' }).waitFor();
  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.getByRole('heading', { name: 'Da chiamare' }).waitFor();
});

await prova('Da chiamare: lista, badge "In chiamata: Luca", esiti nascosti', async () => {
  await page.locator('.riga').first().waitFor();
  await aspetta(300);
  await foto('03-da-chiamare');
  const t = await testo();
  verifica(t.includes('In chiamata: Luca'), 'manca il badge');
  verifica(!t.includes('Usa già Excel'), '');
  const nomi = await page.locator('.riga-nome').allInnerTexts();
  verifica(!nomi.some(n => n.includes('Modello Srl 8')), 'un "non interessato" è in lista');
  verifica((await page.locator('.riga').first().innerText()).includes('Richiamare'), 'il richiamo scaduto non è in cima');
});

await prova('Ricerca per nome e per numero', async () => {
  await page.getByPlaceholder('Cerca nome o numero').fill('0824555105');
  verifica((await page.locator('.riga').count()) === 1, 'ricerca per numero');
  await page.getByPlaceholder('Cerca nome o numero').fill('modello');
  verifica((await page.locator('.riga').count()) >= 1, 'ricerca per nome');
  await page.getByPlaceholder('Cerca nome o numero').fill('');
});

// ---- Test di usabilità: registrare una chiamata ----
let secondi = 0, tocchi = 0;
await prova('Usabilità: registrare una chiamata "Non risponde" (tocchi e tempo)', async () => {
  const pausa = 1500; // tempo di lettura stimato di una persona prima di ogni tocco
  let fermo = 0; // il tempo degli screenshot non conta
  const fotoFuoriTempo = async nome => { const t = Date.now(); await foto(nome); fermo += Date.now() - t; };
  const t0 = Date.now();
  const tappe = [];
  const tappa = nome => tappe.push(`${nome} ${((Date.now() - t0 - fermo) / 1000).toFixed(1)}s`);
  const primo = await page.locator('.riga-nome').first().innerText();
  await aspetta(pausa); await page.locator('.riga-testo').first().click(); tocchi++;
  await page.locator('.scheda-nome').waitFor();
  tappa('scheda aperta');
  await fotoFuoriTempo('04-scheda');
  await aspetta(pausa); await page.locator('.barra-fissa a[href^="tel:"]').click(); tocchi++;
  verifica((await page.evaluate(() => window.__chiamate.length)) === 1, 'il tasto Chiama non ha aperto il telefono');
  // torna dalla telefonata: l'app deve mostrare "Com'è andata?"
  await page.evaluate(() => { window.scrollTo(0, 0); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => { const r = document.querySelector('.griglia-esiti').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 200; }, null, { timeout: 3000 })
    .catch(() => { throw new Error('tornando dalla chiamata gli esiti non sono in vista'); });
  tappa('ritorno dalla chiamata');
  await aspetta(pausa); await tocca('Non risponde'); tocchi++;
  tappa('esito scelto');
  await fotoFuoriTempo('05-scheda-esito-scelto');
  await aspetta(pausa); await tocca('Salva e passa al prossimo'); tocchi++;
  await page.getByText('Salvato ✓ Ora:').first().waitFor();
  tappa('salvato');
  await page.waitForFunction(n => document.querySelector('.scheda-nome')?.innerText !== n, primo);
  secondi = (Date.now() - t0 - fermo) / 1000;
  console.log('      ' + tappe.join(' | '));
  verifica(secondi < 15, `ci ha messo ${secondi}s`);
});

await prova('Storico: la chiamata appena fatta è registrata con nome e esito', async () => {
  await page.goBack();
  await page.locator('.storico li').first().waitFor();
  const t = await page.locator('.storico').innerText();
  verifica(t.includes('Benedetto') && t.includes('Non risponde'), t);
});

await prova('Uscire senza salvare l\'esito: l\'app chiede conferma', async () => {
  await tocca('Segreteria');
  domande.length = 0;
  await page.getByRole('link', { name: /Numeri/ }).click();
  verifica(domande.some(d => d.includes('Non hai ancora salvato')), 'nessuna domanda: ' + domande.join());
  await page.getByRole('heading', { name: 'Numeri' }).waitFor();
  await page.goBack();
  await page.locator('.scheda-nome').waitFor();
});

await prova('Tornando alla lista riparte da dove ero', async () => {
  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.locator('.riga').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 900));
  await aspetta(200);
  await page.locator('.riga-testo').nth(6).click();
  await page.locator('.scheda-nome').waitFor();
  await page.locator('.indietro').click();
  await page.locator('.riga').first().waitFor();
  await aspetta(300);
  const y = await page.evaluate(() => window.scrollY);
  verifica(y > 600, 'posizione persa: ' + y);
});

await prova('Richiamare: passo 3 obbligatorio, scorciatoia "Domani"', async () => {
  await page.getByPlaceholder('Cerca nome o numero').fill('Sannio Lavori Demo Sas 4');
  await page.locator('.riga-testo').first().click();
  await tocca('Richiamare');
  await tocca('Salva e passa al prossimo');
  await page.getByText('Scegli quando richiamare').waitFor();
  await page.getByPlaceholder('Es. Mario Rossi, titolare').fill('Sig.ra Russo');
  await page.getByPlaceholder('Es. ha già un gestionale').fill('Richiamare dopo le 10');
  await tocca('Domani');
  await page.getByText('Richiamare domani 10:00').waitFor();
  await foto('06-scheda-richiamare');
  verifica(!(await page.getByText('Scegli quando richiamare').count()), 'il messaggio rosso resta dopo aver scelto la data');
  await tocca('Salva e resta qui');
  await page.locator('.info', { hasText: 'Sig.ra Russo' }).waitFor({ timeout: 3000 });
  await page.getByPlaceholder('Cerca nome o numero').fill('').catch(() => {});
});

await prova('Richiami: scaduti in rosso e ordinati per ora', async () => {
  await page.getByRole('link', { name: /Oggi/ }).click();
  await tocca('Tutti i richiami, anche dei prossimi giorni');
  await page.getByText('In ritardo').waitFor();
  await foto('07-richiami');
  const t = await testo();
  verifica(t.indexOf('In ritardo') < t.indexOf('Oggi') && t.includes('Prossimi giorni'), t.slice(0, 300));
});

await prova('Demo: consiglio per il giro (azienda ad Atripalda -> 17 novembre)', async () => {
  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.getByPlaceholder('Cerca nome o numero').fill('Costruzioni Prova Snc 18');
  await page.locator('.riga-testo').first().click();
  await page.locator('.consiglio-breve').waitFor();
  verifica((await page.locator('.consiglio-breve').innerText()).includes('17 novembre'), await page.locator('.consiglio-breve').innerText());
  await tocca('Demo fissata');
  verifica((await page.locator('.consiglio .proposta').first().innerText()).includes('17 novembre'), await page.locator('.consiglio').innerText());
  await page.locator('.consiglio button.proposta').first().click();
  await foto('08-scheda-demo-consiglio');
  await tocca('Salva e resta qui');
  await page.getByText('Salvato ✓').first().waitFor();
});

await prova('Appuntamenti: raggruppati per giorno e comune, con strada stimata', async () => {
  await page.getByRole('link', { name: /Appuntamenti/ }).click();
  await page.getByText('Martedì 17 novembre').waitFor();
  await aspetta(300);
  await foto('09-appuntamenti');
  const t = await testo();
  verifica(t.includes('Atripalda (1)') && t.includes('Avellino (3)') && t.includes('di strada'), t.slice(0, 500));
});

await prova('Tempo reale: Luca inizia a chiamare e il badge compare senza ricaricare', async () => {
  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.getByPlaceholder('Cerca nome o numero').fill('Cantieri Finti Srl 5');
  await page.locator('.riga').first().waitFor();
  await finto(() => window.__finto.rpc('segna_in_chiamata', { p_azienda_id: 5, p_nome: 'Luca' }));
  await page.getByText('In chiamata: Luca').waitFor({ timeout: 3000 });
  await page.locator('.riga-testo').first().click();
  await page.getByText('Luca la sta chiamando adesso').waitFor();
  verifica((await page.locator('.barra-fissa').innerText()).includes('Chiama lo stesso'), 'tasto non cambiato');
  await foto('10-scheda-luca-sta-chiamando');
});

await prova('"Sto chiamando" scade da solo dopo 10 minuti', async () => {
  await finto(() => window.__finto.from('aziende').update({ in_chiamata_dal: new Date(Date.now() - 11 * 60000).toISOString() }).eq('id', 5));
  await page.waitForFunction(() => !document.body.innerText.includes('la sta chiamando adesso'), null, { timeout: 3000 });
});

await prova('Tempo reale: Luca registra una chiamata mentre guardo la scheda', async () => {
  await finto(() => window.__finto.rpc('registra_chiamata', { p_azienda_id: 5, p_esito: 'segreteria', p_nome: 'Luca', p_nota: 'Lasciato messaggio' }));
  await page.getByText('ha appena registrato').waitFor({ timeout: 3000 });
});

await prova('Due finestre: premo Chiama, io vedo "Stai chiamando tu", Luca vede "In chiamata: Benedetto"', async () => {
  const luca = await contesto.newPage();
  await luca.goto(indirizzo);
  await luca.getByLabel('Email').fill('luca@esempio.it');
  await luca.getByLabel('Password', { exact: true }).fill('prova');
  await luca.getByRole('button', { name: 'Entra' }).click();
  await luca.getByRole('button', { name: 'Luca', exact: true }).click();
  await luca.getByRole('link', { name: /Da chiamare/ }).click();
  await luca.getByPlaceholder('Cerca nome o numero').fill('Murature Campione Sas 24');
  await luca.locator('.riga').first().waitFor();

  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.getByPlaceholder('Cerca nome o numero').fill('Murature Campione Sas 24');
  await page.locator('.riga .tondo-chiama').first().click();
  const t0 = Date.now();
  await page.getByText('Stai chiamando tu').first().waitFor({ timeout: 1000 });
  const mio = Date.now() - t0;
  await luca.getByText('In chiamata: Benedetto').waitFor({ timeout: 2000 });
  const suo = Date.now() - t0;
  console.log(`      (io lo vedo dopo ${mio} ms, Luca dopo ${suo} ms)`);
  await page.getByText('Stai chiamando').first().waitFor();
  verifica((await page.locator('.numero-grande').innerText()).includes('0824'), 'manca il numero grande');
  await foto('16-scheda-sto-chiamando');
  await luca.screenshot({ path: path.join(cartellaFoto, '17-luca-vede-in-chiamata.png') });

  // "Non l'ho chiamato" toglie il segnale anche per Luca
  await tocca("Non l'ho chiamato");
  await luca.waitForFunction(() => !document.body.innerText.includes('In chiamata: Benedetto'), null, { timeout: 2000 })
    .catch(() => { throw new Error('"Non l\'ho chiamato" non arriva a Luca'); });

  // chiamata senza esito: dopo 10 minuti resta "esito non salvato"
  await page.locator('.barra-fissa a[href^="tel:"]').click();
  await luca.getByText('In chiamata: Benedetto').waitFor({ timeout: 2000 });
  await finto(() => window.__finto.from('aziende').update({ in_chiamata_dal: new Date(Date.now() - 20 * 60000).toISOString() }).eq('id', 24));
  await luca.getByText('esito non salvato').waitFor({ timeout: 2000 })
    .catch(() => { throw new Error('Luca non vede "esito non salvato"'); });
  await luca.close();
});

await prova('Sincronizzazione: un aggiornamento arrivato in ritardo non sovrascrive dati più nuovi', async () => {
  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.getByPlaceholder('Cerca nome o numero').fill('Edilizia Modello Snc 22');
  await page.locator('.riga').first().waitFor();
  const prima = await page.locator('.riga').first().innerText();
  await page.evaluate(async () => {
    const { data } = await window.__finto.from('aziende').select('*').eq('id', 22);
    const vecchia = { ...data[0], esito: 'non_interessato', aggiornato_il: new Date(new Date(data[0].aggiornato_il) - 3600000).toISOString() };
    new BroadcastChannel('chiamate-demo').postMessage({ table: 'aziende', eventType: 'UPDATE', riga: vecchia });
  });
  await aspetta(600);
  const dopo = await page.locator('.riga').first().innerText();
  verifica(prima === dopo && !dopo.includes('Non interessato'), JSON.stringify({ prima, dopo }));
});

await prova('Sincronizzazione: "Modifica" non cancella l\'esito salvato da Luca nel frattempo', async () => {
  await page.locator('.riga-testo').first().click();
  await page.locator('.pulsante-altro', { hasText: 'Modifica' }).click();
  await page.getByLabel('Note').waitFor();
  await finto(() => window.__finto.rpc('registra_chiamata', { p_azienda_id: 22, p_esito: 'richiamare', p_nome: 'Luca', p_richiamo_il: new Date(Date.now() + 86400000).toISOString() }));
  await page.getByText('ha appena aggiornato questo contatto').waitFor({ timeout: 3000 });
  await page.getByLabel('Note').fill('Chiedere del geometra');
  await tocca('Salva');
  await page.getByText('Salvato ✓').first().waitFor();
  const a = await finto(async () => (await window.__finto.from('aziende').select('*').eq('id', 22)).data[0]);
  verifica(a.esito === 'richiamare' && a.richiamo_il && a.note === 'Chiedere del geometra', JSON.stringify({ esito: a.esito, note: a.note, richiamo: a.richiamo_il }));
});

await prova('Atomicità: doppio tocco su "Salva" registra la chiamata una volta sola', async () => {
  const conta = () => finto(async () => (await window.__finto.from('storico_chiamate').select('*').eq('azienda_id', 22)).data.length);
  const prima = await conta();
  await page.locator('.scheda-nome').waitFor();
  await tocca('Segreteria');
  await page.getByRole('button', { name: 'Salva e resta qui' }).dblclick();
  await page.getByText('Salvato ✓').first().waitFor();
  await aspetta(500);
  const dopo = await conta();
  verifica(dopo === prima + 1, `righe aggiunte: ${dopo - prima}`);
});

await prova('Vince il primo: se Luca ha già preso la chiamata, Benedetto viene avvisato', async () => {
  // Luca prende la chiamata "di nascosto" (il telefono di Benedetto non lo sa ancora)
  const chi = await finto(async () => {
    const r = await window.__finto.rpc('segna_in_chiamata', { p_azienda_id: 23, p_nome: 'Luca' });
    const r2 = await window.__finto.rpc('segna_in_chiamata', { p_azienda_id: 23, p_nome: 'Benedetto' });
    return [r.data, r2.data];
  });
  verifica(chi[0] === 'Luca' && chi[1] === 'Luca', JSON.stringify(chi));
});

await prova('Aggiungi: numero già presente -> chi l\'ha chiamata, niente doppione', async () => {
  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.getByPlaceholder('Cerca nome o numero').fill('');
  await tocca('＋ Aggiungi un numero');
  await page.getByLabel('Numero di telefono').fill('+39 0824 555 108');
  await page.getByText("C'è già").waitFor();
  verifica((await testo()).includes('Ultima chiamata: Luca'), 'manca chi l\'ha chiamata');
  verifica(!(await page.getByRole('button', { name: 'Solo aggiungi' }).count()), 'si può ancora aggiungere');
  await foto('11-aggiungi-gia-presente');
});

await prova('Aggiungi: ricerca online compila nome e comune, "Aggiungi e chiama" segnala agli altri', async () => {
  await page.getByLabel('Numero di telefono').fill('0824 123777');
  await page.getByText('Trovato online').waitFor({ timeout: 4000 });
  verifica((await page.getByLabel('Nome azienda').inputValue()) === 'Edil Trovata Online Srl', 'nome non compilato');
  verifica((await page.getByLabel('Comune').inputValue()) === 'San Giorgio del Sannio', 'comune non compilato');
  await foto('12-aggiungi-trovato-online');
  await page.getByRole('link', { name: 'Aggiungi e chiama' }).click();
  await page.locator('.scheda-nome', { hasText: 'Edil Trovata Online Srl' }).waitFor();
  const tel = await page.evaluate(() => window.__chiamate.at(-1));
  verifica(tel === 'tel:+390824123777', tel);
  const a = await finto(async () => (await window.__finto.from('aziende').select('*').eq('telefono', '+390824123777')).data[0]);
  verifica(a.in_chiamata_da === 'Benedetto', 'non segnato come "in chiamata"');
});

await prova('Aggiungi: incolla testo copiato da Google Maps', async () => {
  await page.goto(indirizzo.replace('?demo', '?demo#/aggiungi'));
  await page.getByLabel('Numero di telefono').waitFor();
  await page.evaluate(() => navigator.clipboard.writeText('Costruzioni Incollate Srl\n4,6(23)\nImpresa edile\nVia Napoli, 45, 82016 Montesarchio BN\n0824 834 999\nhttps://maps.app.goo.gl/esempio'));
  await page.getByRole('button', { name: /Incolla dati copiati/ }).click();
  await page.waitForFunction(() => document.querySelector('input[type=tel]').value.length > 5);
  verifica((await page.getByLabel('Nome azienda').inputValue()) === 'Costruzioni Incollate Srl', await page.getByLabel('Nome azienda').inputValue());
  verifica((await page.getByLabel('Comune').inputValue()) === 'Montesarchio', await page.getByLabel('Comune').inputValue());
  verifica((await page.getByLabel(/Note/).inputValue()).includes('Via Napoli, 45'), 'indirizzo non nelle note');
  await tocca('Solo aggiungi');
  await page.locator('.scheda-nome', { hasText: 'Costruzioni Incollate Srl' }).waitFor();
});

await prova('Modifica: numero di un\'altra azienda -> avviso e Salva bloccato', async () => {
  await page.locator('.pulsante-altro', { hasText: 'Modifica' }).click();
  await page.getByLabel('Telefono').fill('0824555100');
  await page.getByText("C'è già").waitFor();
  verifica(await page.getByRole('button', { name: 'Salva', exact: true }).isDisabled(), 'Salva non bloccato');
  await page.getByLabel('Telefono').fill('0824834999');
  await page.getByLabel('Referente').fill('Sig. Prova');
  await tocca('Salva');
  await page.getByText('Salvato ✓').first().waitFor();
});

await prova('Importa: anteprima con doppioni scartati, poi importazione', async () => {
  await page.goto(indirizzo.replace('?demo', '?demo#/altro'));
  await page.getByText('Importa una lista di contatti').click();
  const csv = 'Ragione sociale;Telefono;Città\nNuova Edile Uno;0824 900001;Benevento\nNuova Edile Due;333 9000002;Airola\nDoppia nel file;0824 900001;Benevento\nGià presente;0824 555100;Benevento\nSenza numero;;Benevento';
  await page.getByLabel('Lista dei contatti').fill(csv);
  await tocca('Avanti');
  await page.getByText('contatti nuovi da aggiungere').waitFor();
  await foto('13-importa-anteprima');
  const t = await testo();
  verifica(/2\s*contatti nuovi/.test(t) && /1\s*già presenti/.test(t) && /1\s*ripetuti/.test(t) && /1\s*senza un numero/.test(t), t);
  await tocca('Aggiungi 2 contatti');
  await page.getByText('Aggiunti 2 contatti').waitFor();
});

await prova('Importa: righe copiate da Excel (con tabulazioni, senza intestazione)', async () => {
  await page.evaluate(() => { location.hash = '#/'; }); await aspetta(100); await page.evaluate(() => { location.hash = '#/importa'; });
  await page.getByLabel('Lista dei contatti').fill('Ditta Excel A\t0824 910001\tTelese Terme\nDitta Excel B\t0824 910002\tTelese Terme');
  await tocca('Avanti');
  await page.getByText('contatti nuovi da aggiungere').waitFor();
  verifica((await page.locator('.anteprima').innerText()).includes('Ditta Excel A'), 'colonne non riconosciute');
});

await prova('Esporta: file CSV per Excel', async () => {
  await page.goto(indirizzo.replace('?demo', '?demo#/altro'));
  const [scarico] = await Promise.all([page.waitForEvent('download'), page.getByText('Scarica i contatti').click()]);
  const contenuto = fs.readFileSync(await scarico.path(), 'utf8');
  verifica(contenuto.startsWith('﻿Nome azienda;Telefono;Comune'), contenuto.slice(0, 80));
  verifica(contenuto.includes('Non risponde'), 'esiti non leggibili');
  await foto('14-altro');
});

await prova('Numeri: contatori per persona', async () => {
  await page.goto(indirizzo.replace('?demo', '?demo#/numeri'));
  await page.locator('table.numeri').first().waitFor();
  await foto('15-numeri');
  const riga = await page.locator('table.numeri').first().locator('tr', { hasText: 'Luca' }).innerText();
  const atteso = await finto(async () => {
    const inizio = new Date(); inizio.setHours(0, 0, 0, 0);
    const sue = (await window.__finto.from('storico_chiamate').select('*')).data.filter(c => c.utente_nome === 'Luca' && new Date(c.chiamata_il) >= inizio);
    return [sue.length, sue.filter(c => c.esito === 'parlato_titolare').length, sue.filter(c => c.esito === 'demo_fissata').length];
  });
  verifica(riga.split(/\s+/).slice(1).join(' ') === atteso.join(' '), `${riga} invece di ${atteso}`);
});

await prova('Tasto Home: dalla scheda torna a "Da chiamare"', async () => {
  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.getByPlaceholder('Cerca nome o numero').fill('');
  await page.locator('.riga-testo').first().click();
  await page.locator('.scheda-nome').waitFor();
  await page.getByRole('button', { name: 'Torna alla schermata Oggi' }).click();
  await page.getByRole('heading', { name: 'Ciao Benedetto' }).waitFor({ timeout: 3000 });
  await page.getByRole('link', { name: /Da chiamare/ }).click();
});

await prova('Scheda: tasto "Chiedi a Google" con nome, numero e domanda', async () => {
  await page.locator('.riga-testo').first().click();
  const link = page.getByRole('link', { name: /Chiedi a Google/ });
  const href = await link.getAttribute('href');
  const nome = await page.locator('.scheda-nome').innerText();
  const q = new URL(href).searchParams;
  verifica(href.startsWith('https://www.google.com/search') && q.get('udm') === '50' && q.get('q').includes(nome) && q.get('q').includes('fatturato'), href);
  verifica((await link.getAttribute('target')) === '_blank', 'non apre una nuova scheda');
  await page.getByRole('button', { name: 'Torna alla schermata Oggi' }).click();
});

await prova('Salta: passa al prossimo senza cambiare nulla, e non ripropone i saltati', async () => {
  await page.locator('.riga-testo').first().click();
  const primo = await page.locator('.scheda-nome').innerText();
  const id = Number(await page.evaluate(() => location.hash.split('/')[2]));
  const prima = await finto(async id => JSON.stringify((await window.__finto.from('aziende').select('*').eq('id', id)).data[0]), id);
  await tocca('Salta ›');
  await page.getByText('Saltata. Ora:').first().waitFor();
  await page.waitForFunction(n => document.querySelector('.scheda-nome')?.innerText !== n, primo, { timeout: 3000 })
    .catch(() => { throw new Error('non è passato al prossimo'); });
  const secondo = await page.locator('.scheda-nome').innerText();
  await tocca('Salta ›');
  await page.waitForFunction(n => document.querySelector('.scheda-nome')?.innerText !== n, secondo);
  const terzo = await page.locator('.scheda-nome').innerText();
  verifica(terzo !== primo, 'ha riproposto quello appena saltato');
  const dopo = await finto(async id => JSON.stringify((await window.__finto.from('aziende').select('*').eq('id', id)).data[0]), id);
  verifica(prima === dopo, 'la scheda saltata è cambiata');
  await page.getByRole('button', { name: 'Torna alla schermata Oggi' }).click();
});

await prova('Dal PC: "Sto chiamando" segnala agli altri senza far partire la chiamata', async () => {
  const pc = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'it-IT', timezoneId: 'Europe/Rome' });
  await pc.addInitScript(() => {
    window.__chiamate = [];
    document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"]'); if (a) { e.preventDefault(); window.__chiamate.push(a.href); } });
  });
  const p = await pc.newPage();
  await p.goto(indirizzo);
  await p.getByLabel('Email').fill('benedetto@esempio.it');
  await p.getByLabel('Password', { exact: true }).fill('prova');
  await p.getByRole('button', { name: 'Entra' }).click();
  await p.getByRole('button', { name: 'Benedetto', exact: true }).click();
  await p.getByRole('link', { name: /Da chiamare/ }).click();
  await p.locator('.riga-testo').first().click();
  const id = Number(await p.evaluate(() => location.hash.split('/')[2]));
  await p.getByRole('button', { name: 'Sto chiamando' }).click();
  await p.getByText('Stai chiamando').first().waitFor({ timeout: 2000 });
  verifica((await p.evaluate(() => window.__chiamate.length)) === 0, 'è partita una chiamata');
  await p.waitForTimeout(400);
  const chi = await p.evaluate(async id => (await window.__finto.from('aziende').select('*').eq('id', id)).data[0].in_chiamata_da, id);
  verifica(chi === 'Benedetto', 'gli altri non lo vedono: ' + chi);
  await p.screenshot({ path: path.join(cartellaFoto, '18-pc-sto-chiamando.png') });
  // sul telefono invece il tasto non c'è
  verifica(!(await page.getByRole('button', { name: 'Sto chiamando' }).count()), 'sul telefono compare "Sto chiamando"');
  await pc.close();
});

await prova('Filtro per provincia: AV mostra solo i comuni irpini', async () => {
  await page.getByRole('link', { name: /Da chiamare/ }).click();
  await page.getByPlaceholder('Cerca nome o numero').fill('');
  await page.getByLabel('Esito').selectOption('demo_fissata');
  await page.getByLabel('Provincia').selectOption('AV');
  await aspetta(200);
  const comuni = await page.locator('.riga-sotto').allInnerTexts();
  verifica(comuni.length > 0 && comuni.every(c => /Avellino|Atripalda/.test(c)), comuni.join(' | '));
  const opzioni = await page.getByLabel('Comune').locator('option').allInnerTexts();
  verifica(!opzioni.includes('Benevento'), opzioni.join(','));
  await foto('19-filtro-provincia');
  await page.getByLabel('Provincia').selectOption('');
  await page.getByLabel('Esito').selectOption('');
});

await prova('Manca internet: messaggio chiaro', async () => {
  await contesto.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByText('Manca internet').first().waitFor();
  await contesto.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
});

await prova('Nessun errore nella console', async () => {
  verifica(!erroriPagina.length, erroriPagina.join(' | '));
});

console.log(`\nUsabilità: ${tocchi} tocchi, ${secondi.toFixed(1)} secondi (con 1,5 s di lettura prima di ogni tocco)`);
console.log(`${ok} ok, ${ko} falliti. Screenshot in ${cartellaFoto}`);
await browser.close();
server.close();
process.exit(ko ? 1 : 0);
