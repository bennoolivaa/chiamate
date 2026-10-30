import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { ESITI, ESITO_NUOVO, esito as datiEsito } from './config.js';
import {
  stato, esci, trovaPerTelefono, aggiungiAzienda, aggiornaAzienda, eliminaAzienda,
  importaAziende, cercaOnline, comuni,
} from './dati.js';
import { useDati, vai, indietro, avviso, errore, Intestazione, icone, nonSalvato } from './app.js';
import {
  normalizzaTelefono, telefonoLeggibile, dataOra, versoInput, daInput, leggiTestoCopiato, maiuscoleIniziali,
  leggiTabella, capisciColonne, creaCsv, scaricaFile, dataPerFile, messaggioErrore,
} from './utili.js';

function ricorda(chiave, valore) { try { localStorage.setItem(chiave, valore); } catch (_) { /* niente */ } }
function ricordato(chiave) { try { return localStorage.getItem(chiave) || ''; } catch (_) { return ''; } }

// Usa la stessa scrittura di un comune già presente ("BENEVENTO" -> "Benevento")
function comuneUniforme(nome) {
  if (!nome) return '';
  const esistente = comuni().find(c => c.toLowerCase() === nome.trim().toLowerCase());
  return esistente || maiuscoleIniziali(nome.trim());
}

function GiaPresente({ azienda }) {
  return html`<div class="banner banner-attenzione">
    <b>C'è già: ${azienda.nome_azienda}</b>${azienda.comune ? ` (${azienda.comune})` : ''}<br />
    ${azienda.ultima_chiamata_il
      ? html`Ultima chiamata: <b>${azienda.ultimo_chiamante}</b>, ${dataOra(azienda.ultima_chiamata_il)} – ${datiEsito(azienda.esito).nome}`
      : 'Non è ancora stata chiamata.'}
    <button class="pulsante secondario largo mt" onClick=${() => vai('/azienda/' + azienda.id)}>Apri il contatto</button>
  </div>`;
}

// ---- Aggiungi un numero ----
export function Aggiungi() {
  useDati();
  const [telefono, setTelefono] = useState('');
  const [nome, setNome] = useState('');
  const [comune, setComune] = useState(ricordato('ultimoComune'));
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [ricerca, setRicerca] = useState('');      // '', 'cerco', 'trovato', 'niente'
  const [risultati, setRisultati] = useState([]);
  const [incolla, setIncolla] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const toccati = useRef({});
  const cercato = useRef('');

  const normalizzato = normalizzaTelefono(telefono);
  const esistente = normalizzato ? trovaPerTelefono(normalizzato) : null;

  useEffect(() => {
    nonSalvato.messaggio = normalizzato && !esistente && !salvo ? 'Il numero non è ancora stato aggiunto: gli altri non lo vedono. Vuoi uscire lo stesso?' : '';
    return () => { nonSalvato.messaggio = ''; };
  }, [normalizzato, !!esistente, salvo]);

  function usaRisultato(r, sovrascrivi) {
    const riempi = (campo, valore, imposta) => { if (valore && (sovrascrivi || !toccati.current[campo])) imposta(valore); };
    riempi('nome', r.nome_azienda, setNome);
    riempi('comune', comuneUniforme(r.comune), setComune);
    riempi('email', r.email, setEmail);
    const righe = [r.indirizzo && `Indirizzo: ${r.indirizzo}`, r.categoria && `Attività: ${r.categoria}`, r.sito && `Sito: ${r.sito}`].filter(Boolean);
    riempi('note', righe.join('\n'), setNote);
  }

  // Appena il numero è completo e nuovo, cerchiamo online nome e comune
  useEffect(() => {
    if (!normalizzato || esistente || cercato.current === normalizzato) return;
    const t = setTimeout(async () => {
      cercato.current = normalizzato;
      setRicerca('cerco');
      const trovati = await cercaOnline(normalizzato);
      if (cercato.current !== normalizzato) return;
      setRisultati(trovati);
      setRicerca(trovati.length ? 'trovato' : 'niente');
      if (trovati.length) usaRisultato(trovati[0]);
    }, 500);
    return () => clearTimeout(t);
  }, [normalizzato, !!esistente]);

  function campo(nomeCampo, imposta) {
    return ev => { toccati.current[nomeCampo] = true; imposta(ev.target.value); };
  }

  function daTestoCopiato(testo) {
    const t = leggiTestoCopiato(testo);
    if (t.telefono && !normalizzato) setTelefono(t.telefono);
    usaRisultato({ nome_azienda: t.nome_azienda, comune: t.comune, email: t.email, indirizzo: t.indirizzo }, true);
    setIncolla(false);
    if (!t.telefono && !t.nome_azienda) avviso('Non ho trovato dati nel testo copiato. Scrivili a mano.', 'errore');
    else avviso('Dati inseriti ✓ Controllali');
  }

  async function incollaDagliAppunti() {
    try {
      const testo = await navigator.clipboard.readText();
      if (testo) { daTestoCopiato(testo); return; }
    } catch (_) { /* il browser non lo permette: mostriamo il riquadro */ }
    setIncolla(true);
  }

  const problema = !telefono ? '' : !normalizzato ? 'Il numero sembra incompleto.' : '';
  const pronto = normalizzato && !esistente && nome.trim();

  async function salva(chiamo) {
    setSalvo(true);
    try {
      const nuova = await aggiungiAzienda({ nome_azienda: nome, telefono: normalizzato, comune: comuneUniforme(comune), email, note }, { chiamo });
      ricorda('ultimoComune', comuneUniforme(comune));
      avviso(chiamo ? 'Aggiunto ✓ Gli altri vedono che lo stai chiamando' : 'Aggiunto ✓');
      vai('/azienda/' + nuova.id);
    } catch (e) {
      errore(e);
      setSalvo(false);
    }
  }

  function clicChiama(ev) {
    if (!pronto || salvo) { ev.preventDefault(); return; }
    salva(true);  // il telefono parte subito, il salvataggio intanto continua
  }

  return html`<main class="schermata scheda">
    <${Intestazione} conIndietro titolo="Nuovo numero" destra=${null} />

    <button class="pulsante secondario largo" onClick=${incollaDagliAppunti}>📋 Incolla dati copiati (Google Maps, Pagine Gialle…)</button>
    ${incolla && html`<label class="mt">Incolla qui il testo copiato
      <textarea rows="4" autofocus onInput=${ev => ev.target.value.length > 5 && daTestoCopiato(ev.target.value)} placeholder="Tieni premuto qui e scegli Incolla" />
    </label>`}

    <label class="mt">Numero di telefono
      <input type="tel" inputmode="tel" autocomplete="off" value=${telefono} onInput=${ev => setTelefono(ev.target.value)} placeholder="Es. 0824 123456" autofocus />
    </label>
    ${problema && html`<p class="aiuto rosso">${problema}</p>`}
    ${esistente && html`<${GiaPresente} azienda=${esistente} />`}
    ${normalizzato && !esistente && html`<p class="aiuto verde">✓ Numero nuovo, nessuno l'ha ancora chiamato</p>`}

    ${!esistente && html`
      ${ricerca === 'cerco' && html`<p class="aiuto">🔎 Cerco il numero su Pagine Gialle…</p>`}
      ${ricerca === 'trovato' && html`<p class="aiuto verde">✓ Trovato online: controlla che i dati siano giusti</p>`}
      ${ricerca === 'niente' && html`<p class="aiuto">Online non ho trovato nulla: scrivi il nome a mano.</p>`}
      ${risultati.length > 1 && html`<div class="scorciatoie">
        <span class="tenue">Altri risultati:</span>
        ${risultati.map(r => html`<button class="pulsante secondario" onClick=${() => usaRisultato(r, true)}>${r.nome_azienda}</button>`)}
      </div>`}

      <label>Nome azienda
        <input value=${nome} onInput=${campo('nome', setNome)} placeholder="Es. Edil Rossi Srl" />
      </label>
      <label>Comune
        <input value=${comune} onInput=${campo('comune', setComune)} list="elenco-comuni" />
        <datalist id="elenco-comuni">${comuni().map(c => html`<option value=${c} />`)}</datalist>
      </label>
      <label>Email <span class="tenue">(facoltativa)</span>
        <input type="email" inputmode="email" value=${email} onInput=${campo('email', setEmail)} />
      </label>
      <label>Note <span class="tenue">(facoltative)</span>
        <textarea rows="3" value=${note} onInput=${campo('note', setNote)} />
      </label>

      <div class="barra-fissa">
        ${!pronto && normalizzato && html`<p class="aiuto centrato">Manca il nome dell'azienda.</p>`}
        <div class="riga-pulsanti">
          <a class=${'pulsante pulsante-chiama grande doppio' + (pronto && !salvo ? '' : ' disattivo')} href=${pronto ? 'tel:' + normalizzato : undefined}
            onClick=${clicChiama} aria-disabled=${!pronto}>${icone.telefono}<span>Aggiungi e chiama</span></a>
          <button class="pulsante secondario grande" disabled=${!pronto || salvo} onClick=${() => salva(false)}>Solo aggiungi</button>
        </div>
      </div>`}
  </main>`;
}

// ---- Modifica tutti i dati ----
export function Modifica({ id }) {
  const s = useDati();
  const a = s.aziende.find(x => x.id === id);
  const [d, setD] = useState(a ? { ...a } : null);
  const [salvo, setSalvo] = useState(false);
  if (!a || !d) return html`<main class="schermata"><${Intestazione} conIndietro destra=${null} /><div class="vuoto">Questo contatto non c'è più.</div></main>`;

  const imposta = campo => ev => setD({ ...d, [campo]: ev.target.value });
  const doppione = normalizzaTelefono(d.telefono) && trovaPerTelefono(d.telefono);
  const altroConStessoNumero = doppione && doppione.id !== a.id ? doppione : null;

  async function salva() {
    if (!d.nome_azienda?.trim()) { avviso('Manca il nome dell\'azienda.', 'errore'); return; }
    if (!normalizzaTelefono(d.telefono)) { avviso('Il numero di telefono non sembra giusto.', 'errore'); return; }
    setSalvo(true);
    try {
      await aggiornaAzienda(a.id, {
        nome_azienda: d.nome_azienda, telefono: d.telefono, comune: comuneUniforme(d.comune || ''), email: d.email,
        referente: d.referente, esito: d.esito, note: d.note,
        richiamo_il: d.richiamo_il || null, appuntamento_il: d.appuntamento_il || null, appuntamento_luogo: d.appuntamento_luogo,
      });
      avviso('Salvato ✓');
      indietro();
    } catch (e) { errore(e); }
    setSalvo(false);
  }

  async function elimina() {
    if (!confirm(`Vuoi davvero eliminare "${a.nome_azienda}" e tutte le sue chiamate? Non si può annullare.`)) return;
    try { await eliminaAzienda(a.id); avviso('Contatto eliminato'); vai('/'); } catch (e) { errore(e); }
  }

  return html`<main class="schermata">
    <${Intestazione} conIndietro titolo="Modifica" destra=${null} />
    <label>Nome azienda <input value=${d.nome_azienda || ''} onInput=${imposta('nome_azienda')} /></label>
    <label>Telefono <input type="tel" value=${d.telefono || ''} onInput=${imposta('telefono')} /></label>
    ${altroConStessoNumero && html`<${GiaPresente} azienda=${altroConStessoNumero} />`}
    <label>Comune <input value=${d.comune || ''} onInput=${imposta('comune')} list="elenco-comuni" />
      <datalist id="elenco-comuni">${comuni().map(c => html`<option value=${c} />`)}</datalist></label>
    <label>Email <input type="email" value=${d.email || ''} onInput=${imposta('email')} /></label>
    <label>Referente <input value=${d.referente || ''} onInput=${imposta('referente')} /></label>
    <label>Esito
      <select value=${d.esito} onChange=${imposta('esito')}>
        ${[ESITO_NUOVO, ...ESITI].map(e => html`<option value=${e.id}>${e.nome}</option>`)}
      </select>
    </label>
    <label>Richiamare il
      <div class="con-pulsante">
        <input type="datetime-local" value=${versoInput(d.richiamo_il)} onInput=${ev => setD({ ...d, richiamo_il: daInput(ev.target.value) })} />
        ${d.richiamo_il && html`<button class="pulsante secondario" onClick=${() => setD({ ...d, richiamo_il: null })}>Togli</button>`}
      </div>
    </label>
    <label>Demo il
      <div class="con-pulsante">
        <input type="datetime-local" value=${versoInput(d.appuntamento_il)} onInput=${ev => setD({ ...d, appuntamento_il: daInput(ev.target.value) })} />
        ${d.appuntamento_il && html`<button class="pulsante secondario" onClick=${() => setD({ ...d, appuntamento_il: null })}>Togli</button>`}
      </div>
    </label>
    <label>Luogo della demo <input value=${d.appuntamento_luogo || ''} onInput=${imposta('appuntamento_luogo')} /></label>
    <label>Note <textarea rows="4" value=${d.note || ''} onInput=${imposta('note')} /></label>
    <button class="pulsante primario grande largo" disabled=${salvo || altroConStessoNumero} onClick=${salva}>Salva</button>
    <button class="pulsante pericolo largo mt-grande" onClick=${elimina}>Elimina contatto</button>
  </main>`;
}

// ---- Altro ----
const ETICHETTE = { nome_azienda: 'Nome azienda', telefono: 'Telefono', comune: 'Comune', email: 'Email' };

function scaricaContatti() {
  const ultimaNota = {};
  [...stato.storico].sort((a, b) => new Date(a.chiamata_il) - new Date(b.chiamata_il))
    .forEach(c => { if (c.nota) ultimaNota[c.azienda_id] = c.nota; });
  const righe = [...stato.aziende].sort((a, b) => a.nome_azienda.localeCompare(b.nome_azienda, 'it')).map(a => [
    a.nome_azienda, telefonoLeggibile(a.telefono), a.comune, a.email, a.referente, datiEsito(a.esito).nome,
    dataPerFile(a.richiamo_il), dataPerFile(a.appuntamento_il), a.appuntamento_luogo, a.note, ultimaNota[a.id],
    a.tentativi, a.ultimo_chiamante, dataPerFile(a.ultima_chiamata_il),
  ]);
  scaricaFile(`contatti-${new Date().toISOString().slice(0, 10)}.csv`, creaCsv(
    ['Nome azienda', 'Telefono', 'Comune', 'Email', 'Referente', 'Esito', 'Richiamare il', 'Demo il', 'Luogo demo', 'Note', 'Ultima nota chiamata', 'Chiamate', 'Ultimo a chiamare', 'Ultima chiamata il'],
    righe));
  avviso('File scaricato ✓');
}

function scaricaStorico() {
  const nomi = Object.fromEntries(stato.aziende.map(a => [a.id, a]));
  const righe = [...stato.storico].sort((a, b) => new Date(b.chiamata_il) - new Date(a.chiamata_il)).map(c => [
    dataPerFile(c.chiamata_il), c.utente_nome, nomi[c.azienda_id]?.nome_azienda, telefonoLeggibile(nomi[c.azienda_id]?.telefono),
    nomi[c.azienda_id]?.comune, datiEsito(c.esito).nome, c.nota,
  ]);
  scaricaFile(`chiamate-${new Date().toISOString().slice(0, 10)}.csv`, creaCsv(
    ['Quando', 'Chi ha chiamato', 'Azienda', 'Telefono', 'Comune', 'Esito', 'Nota'], righe));
  avviso('File scaricato ✓');
}

export function Altro() {
  const s = useDati();
  return html`<main class="schermata">
    <${Intestazione} conIndietro titolo="Altro" destra=${null} />
    <div class="colonna">
      <button class="pulsante secondario grande" onClick=${() => vai('/importa')}>📥 Importa una lista di contatti</button>
      <button class="pulsante secondario grande" onClick=${scaricaContatti}>📤 Scarica i contatti (Excel)</button>
      <button class="pulsante secondario grande" onClick=${scaricaStorico}>📤 Scarica tutte le chiamate (Excel)</button>
      <button class="pulsante secondario grande" onClick=${() => vai('/nome')}>👤 Sei ${s.nome}: cambia nome</button>
      <button class="pulsante secondario grande" onClick=${esci}>🚪 Esci</button>
    </div>
    <p class="tenue mt-grande">Per mettere l'app sulla schermata Home: su iPhone tocca Condividi › "Aggiungi alla schermata Home"; su Android menu ⋮ › "Installa app".</p>
  </main>`;
}

// ---- Importa: 1 scegli, 2 controlla, 3 fatto ----
const ESEMPIO = 'Nome azienda;Telefono;Comune;Email\nEdil Esempio Srl;0824 000001;Benevento;info@esempio.it\nCostruzioni Prova;333 0000002;Montesarchio;';

export function Importa() {
  useDati();
  const [passo, setPasso] = useState(1);
  const [testo, setTesto] = useState('');
  const [comunePerTutti, setComunePerTutti] = useState('');
  const [esame, setEsame] = useState(null);
  const [fatto, setFatto] = useState(0);
  const [avanzamento, setAvanzamento] = useState(0);

  async function daFile(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) { avviso('Da Excel: seleziona le righe, copia e incollale qui sotto. Oppure salva il file come CSV.', 'errore'); return; }
    setTesto(await file.text());
  }

  function controlla() {
    const righe = leggiTabella(testo);
    if (!righe.length) { avviso('Non vedo nessuna riga. Incolla la lista o scegli un file.', 'errore'); return; }
    const { colonne, intestazione } = capisciColonne(righe);
    if (colonne.telefono === undefined) { avviso('Non trovo la colonna dei numeri di telefono.', 'errore'); return; }
    const visti = new Set();
    const nuove = [], giaPresenti = [], doppie = [], senzaNumero = [];
    for (const r of intestazione ? righe.slice(1) : righe) {
      const prendi = campo => colonne[campo] !== undefined ? (r[colonne[campo]] || '').trim() : '';
      const telefono = normalizzaTelefono(prendi('telefono'));
      const riga = { nome_azienda: prendi('nome_azienda'), telefono, comune: comuneUniforme(prendi('comune') || comunePerTutti), email: prendi('email') };
      if (!telefono) senzaNumero.push(riga);
      else if (trovaPerTelefono(telefono)) giaPresenti.push(riga);
      else if (visti.has(telefono)) doppie.push(riga);
      else { visti.add(telefono); nuove.push({ ...riga, nome_azienda: riga.nome_azienda || 'Senza nome' }); }
    }
    setEsame({ colonne, nuove, giaPresenti, doppie, senzaNumero });
    setPasso(2);
  }

  async function importa() {
    setPasso(3);
    try {
      const n = await importaAziende(esame.nuove, setAvanzamento);
      setFatto(n);
      setPasso(4);
    } catch (e) {
      avviso(messaggioErrore(e), 'errore');
      setPasso(2);
    }
  }

  return html`<main class="schermata">
    <${Intestazione} conIndietro titolo="Importa contatti" destra=${null} />
    <p class="passi">${['Scegli', 'Controlla', 'Fatto'].map((t, i) => html`<span class=${passo === i + 1 || (passo > 2 && i === 2) ? 'attivo' : ''}>${i + 1}. ${t}</span>`)}</p>

    ${passo === 1 && html`
      <p>Incolla qui la lista (anche copiata da Excel) oppure scegli un file CSV. Servono almeno <b>nome</b> e <b>telefono</b>.</p>
      <label>Lista dei contatti
        <textarea rows="7" value=${testo} onInput=${e => setTesto(e.target.value)} placeholder=${ESEMPIO} />
      </label>
      <label class="pulsante secondario largo file">📄 Scegli un file<input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange=${daFile} /></label>
      <label class="mt">Se manca il comune, usa questo <span class="tenue">(facoltativo)</span>
        <input value=${comunePerTutti} onInput=${e => setComunePerTutti(e.target.value)} list="elenco-comuni" placeholder="Es. Benevento" />
        <datalist id="elenco-comuni">${comuni().map(c => html`<option value=${c} />`)}</datalist>
      </label>
      <details class="esempio"><summary>Vedi un esempio di file</summary><pre>${ESEMPIO}</pre>
        <button class="pulsante secondario" onClick=${() => scaricaFile('esempio-contatti.csv', '﻿' + ESEMPIO)}>Scarica l'esempio</button>
      </details>
      <button class="pulsante primario grande largo mt" disabled=${!testo.trim()} onClick=${controlla}>Avanti</button>`}

    ${passo === 2 && esame && html`
      <div class="riquadro info">
        <div class="verde"><b>${esame.nuove.length}</b> contatti nuovi da aggiungere</div>
        ${esame.giaPresenti.length > 0 && html`<div><b>${esame.giaPresenti.length}</b> già presenti: li salto</div>`}
        ${esame.doppie.length > 0 && html`<div><b>${esame.doppie.length}</b> ripetuti nella lista: li salto</div>`}
        ${esame.senzaNumero.length > 0 && html`<div class="rosso"><b>${esame.senzaNumero.length}</b> senza un numero valido: li salto</div>`}
      </div>
      <p class="tenue">Ho letto le colonne così: ${Object.entries(esame.colonne).map(([k, i]) => `${ETICHETTE[k]} = colonna ${i + 1}`).join(', ')}</p>
      ${esame.nuove.length > 0 && html`<div class="tabella-scorre"><table class="anteprima">
        <thead><tr><th>Nome</th><th>Telefono</th><th>Comune</th></tr></thead>
        <tbody>${esame.nuove.slice(0, 8).map(r => html`<tr><td>${r.nome_azienda}</td><td>${telefonoLeggibile(r.telefono)}</td><td>${r.comune}</td></tr>`)}</tbody>
      </table></div>
      ${esame.nuove.length > 8 && html`<p class="tenue">…e altri ${esame.nuove.length - 8}</p>`}`}
      <div class="colonna mt">
        <button class="pulsante primario grande" disabled=${!esame.nuove.length} onClick=${importa}>Aggiungi ${esame.nuove.length} contatti</button>
        <button class="pulsante secondario" onClick=${() => setPasso(1)}>Indietro</button>
      </div>`}

    ${passo === 3 && html`<div class="vuoto">Sto aggiungendo… ${avanzamento} di ${esame.nuove.length}</div>`}

    ${passo === 4 && html`
      <div class="vuoto"><p class="grande-testo">✓ Aggiunti ${fatto} contatti</p>
        ${fatto < esame.nuove.length && html`<p>${esame.nuove.length - fatto} li aveva appena aggiunti qualcun altro.</p>`}</div>
      <button class="pulsante primario grande largo" onClick=${() => vai('/')}>Vai a "Da chiamare"</button>`}
  </main>`;
}
