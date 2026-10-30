import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { ESITI, ESITI_NASCOSTI, NOMI, GIRI, esito as datiEsito } from './config.js';
import { stato, daChiamare, comuni, storicoDi, registraChiamata, chiamaUnAltro, chiChiama } from './dati.js';
import {
  useDati, vai, avviso, errore, Intestazione, PulsanteChiama, PulsanteSegna, BadgeInChiamata, AvvisoInChiamata,
  nonSalvato, puoiUscire, daPc,
} from './app.js';
import { caricaComuni, comuniPronti, consigliaDemo, tappeDelGiorno, stradaDelGiorno } from './giri.js';
import {
  dataOra, soloOra, giornoLungo, telefonoLeggibile, inizioGiorno, stessoGiorno,
  scorciatoiaRichiamo, versoInput, daInput,
} from './utili.js';

function useComuni() {
  const [, ridisegna] = useState(0);
  useEffect(() => { if (!comuniPronti()) caricaComuni().then(() => ridisegna(n => n + 1)); }, []);
}

function oreMinuti(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ' ' + m : ''}` : `${m} min`;
}

function motivoProposta(p) {
  if (p.vicina && p.demoQuelGiorno) {
    const dove = p.vicina.km <= 3 ? `è già a ${p.vicina.comune}` : `è a ${p.vicina.km} km, a ${p.vicina.comune}`;
    const strada = p.stradaInPiu > 0 ? `+${oreMinuti(p.stradaInPiu)} di strada` : 'nessuna strada in più';
    return `${dove} (${p.demoQuelGiorno} demo quel giorno) · ${strada}`;
  }
  return `giornata libera · ${oreMinuti(p.stradaInPiu)} di strada tra andata e ritorno`;
}

// Consiglio per il giro di Alessandro: quando proporre la demo
function ConsiglioDemo({ azienda, scegli, scelto }) {
  useComuni();
  const s = useDati();
  const c = consigliaDemo(azienda.comune, s.aziende, { escludiId: azienda.id });
  if (c.attesa) return null;
  if (c.problema) return scegli ? html`<p class="aiuto tenue">💡 ${c.problema}</p>` : null;
  if (!scegli) {
    const p = c.proposte[0];
    return html`<p class="consiglio-breve">💡 Se vuole una demo, proponi <b>${giornoLungo(p.quando)} alle ${soloOra(p.quando)}</b>: ${motivoProposta(p)}</p>`;
  }
  return html`<div class="consiglio">
    <p class="consiglio-titolo">💡 Proponi per il giro di Alessandro:</p>
    ${c.proposte.map((p, i) => {
      const testo = html`<b>${i === 0 ? '⭐ ' : ''}${giornoLungo(p.quando)}, ore ${soloOra(p.quando)}</b><span>${motivoProposta(p)}</span>`;
      return scegli
        ? html`<button class=${'proposta' + (scelto === p.quando.toISOString() ? ' scelta' : '')} onClick=${() => scegli(p.quando.toISOString())}>${testo}</button>`
        : html`<div class="proposta">${testo}</div>`;
    })}
  </div>`;
}

// Filtri di "Da chiamare", ricordati finché l'app resta aperta (servono anche a "passa al prossimo")
const filtri = { comune: '', esito: '', cerca: '' };
try { Object.assign(filtri, JSON.parse(sessionStorage.getItem('filtri') || '{}')); } catch (_) { /* niente */ }
function salvaFiltri() { try { sessionStorage.setItem('filtri', JSON.stringify(filtri)); } catch (_) { /* niente */ } }

const senzaAccenti = t => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function BadgeEsito({ id }) {
  const e = datiEsito(id);
  return html`<span class=${'badge esito-' + e.colore}>${e.nome}</span>`;
}

function Riga({ azienda, dettaglio }) {
  const apri = () => vai('/azienda/' + azienda.id);
  return html`<li class="riga">
    <button class="riga-testo" onClick=${apri}>
      <span class="riga-nome">${azienda.nome_azienda}</span>
      <span class="riga-sotto">${azienda.comune || 'Comune?'} · <${BadgeEsito} id=${azienda.esito} /></span>
      ${dettaglio && html`<span class="riga-dettaglio">${dettaglio}</span>`}
      <${BadgeInChiamata} azienda=${azienda} />
    </button>
    <${PulsanteChiama} azienda=${azienda} poi=${apri} />
  </li>`;
}

function dettaglioRiga(a) {
  if (a.richiamo_il) {
    const scaduto = new Date(a.richiamo_il) < new Date();
    return html`<span class=${scaduto ? 'rosso' : ''}>Richiamare ${dataOra(a.richiamo_il)}</span>`;
  }
  if (a.ultima_chiamata_il) return `${a.tentativi} ${a.tentativi === 1 ? 'chiamata' : 'chiamate'} · ultima ${dataOra(a.ultima_chiamata_il)}, ${a.ultimo_chiamante}`;
  return a.in_chiamata_dal ? null : 'Mai chiamata';
}

// ---- Da chiamare ----
export function DaChiamare() {
  const s = useDati();
  const [, ridisegna] = useState(0);
  const [quanti, setQuanti] = useState(60);
  const imposta = (campo, valore) => { filtri[campo] = valore; salvaFiltri(); setQuanti(60); ridisegna(n => n + 1); };

  let lista;
  const cerca = filtri.cerca.trim();
  if (cerca) {
    const testo = senzaAccenti(cerca);
    const cifre = cerca.replace(/\D/g, '');
    lista = s.aziende.filter(a => senzaAccenti(a.nome_azienda).includes(testo)
      || (cifre.length >= 3 && a.telefono.includes(cifre.replace(/^0039|^39(?=[03])/, ''))));
  } else {
    lista = daChiamare(filtri);
  }

  return html`<main class="schermata">
    <${Intestazione} titolo="Da chiamare" />
    <div class="barra-cerca">
      <input type="search" placeholder="🔍 Cerca nome o numero" value=${filtri.cerca} onInput=${e => imposta('cerca', e.target.value)} aria-label="Cerca nome o numero" />
    </div>
    <button class="pulsante primario grande largo" onClick=${() => vai('/aggiungi')}>＋ Aggiungi un numero</button>
    ${!cerca && html`<div class="filtri">
      <label>Comune
        <select value=${filtri.comune} onChange=${e => imposta('comune', e.target.value)}>
          <option value="">Tutti</option>
          ${comuni().map(c => html`<option value=${c}>${c}</option>`)}
        </select>
      </label>
      <label>Esito
        <select value=${filtri.esito} onChange=${e => imposta('esito', e.target.value)}>
          <option value="">Da lavorare</option>
          <option value="nuovo">Nuovo</option>
          ${ESITI.map(e => html`<option value=${e.id}>${e.nome}</option>`)}
        </select>
      </label>
    </div>`}
    <p class="conteggio">${cerca ? `${lista.length} trovate` : `${lista.length} da chiamare`}
      ${!cerca && !filtri.esito ? html` · <span class="tenue">nascoste: demo, non interessati, fuori target</span>` : ''}</p>
    ${s.caricamento && !s.aziende.length ? html`<p class="vuoto">Carico i contatti…</p>`
      : !lista.length ? html`<div class="vuoto">${cerca ? 'Nessun contatto con questo nome o numero.' : s.aziende.length ? 'Nessuno da chiamare con queste scelte.' : 'Ancora nessun contatto. Tocca "Aggiungi un numero" oppure importa una lista da "Altro".'}</div>`
      : html`<ul class="lista">${lista.slice(0, quanti).map(a => html`<${Riga} key=${a.id} azienda=${a} dettaglio=${dettaglioRiga(a)} />`)}</ul>`}
    ${lista.length > quanti && html`<button class="pulsante secondario largo" onClick=${() => setQuanti(quanti + 100)}>Mostra altri</button>`}
  </main>`;
}

// ---- Scheda azienda + registrazione della chiamata ----
// Apre la modalità IA di Google (udm=50) con la domanda già scritta; se non c'è, Google fa una ricerca normale
function linkGoogleIA(a) {
  const domanda = `${a.nome_azienda}${a.comune ? ' ' + a.comune : ''} tel. ${telefonoLeggibile(a.telefono)}: di cosa si occupa questa azienda, quanti dipendenti ha e che fatturato ha?`;
  return 'https://www.google.com/search?udm=50&q=' + encodeURIComponent(domanda);
}

// Quelli saltati con "Salta" non vengono riproposti finché la lista non finisce
const saltati = new Set();
function prossimoDopo(id) {
  const libera = a => a.id !== id && !chiamaUnAltro(a);
  const lista = daChiamare(filtri);
  let prossimo = lista.find(a => libera(a) && !saltati.has(a.id));
  if (!prossimo && saltati.size) { saltati.clear(); prossimo = lista.find(libera); }
  return prossimo;
}

export function Scheda({ id }) {
  const s = useDati();
  const a = s.aziende.find(x => x.id === id);
  const [scelta, setScelta] = useState('');
  const [referente, setReferente] = useState(a?.referente || '');
  const [nota, setNota] = useState('');
  const [email, setEmail] = useState(a?.email || '');
  const [richiamo, impostaRichiamo] = useState('');
  const [appuntamento, impostaAppuntamento] = useState(a?.appuntamento_il || '');
  const [luogo, setLuogo] = useState(a?.appuntamento_luogo || a?.comune || '');
  const [salvo, setSalvo] = useState(false);
  const [problema, setProblema] = useState('');
  const setRichiamo = v => { impostaRichiamo(v); setProblema(''); };
  const setAppuntamento = v => { impostaAppuntamento(v); setProblema(''); };
  const passo1 = useRef(null);
  const salvataggio = useRef(false);
  const passo2 = useRef(null);
  const storico = a ? storicoDi(a.id) : [];
  const vaiAgliEsiti = () => passo1.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Tornando nell'app dopo la chiamata, si apre su "Com'è andata?"
  const sceltaAttuale = useRef('');
  sceltaAttuale.current = scelta;
  useEffect(() => {
    const ritorno = () => {
      const qui = stato.aziende.find(x => x.id === id);
      if (document.visibilityState === 'visible' && !sceltaAttuale.current && chiChiama(qui) === stato.nome) setTimeout(vaiAgliEsiti, 300);
    };
    document.addEventListener('visibilitychange', ritorno);
    return () => document.removeEventListener('visibilitychange', ritorno);
  }, [id]);

  useEffect(() => {
    nonSalvato.messaggio = scelta ? 'Non hai ancora salvato com\'è andata la chiamata. Vuoi uscire lo stesso?' : '';
    return () => { nonSalvato.messaggio = ''; };
  }, [scelta]);

  // Se un altro registra una chiamata mentre sei qui, te lo diciamo
  const visti = useRef(storico.length);
  const nuovaDiAltri = storico.length > visti.current && storico[0].utente_nome !== s.nome ? storico[0] : null;

  if (!a) {
    return html`<main class="schermata"><${Intestazione} conIndietro />
      <div class="vuoto">${s.caricamento ? 'Carico…' : 'Questo contatto non c\'è più.'}</div></main>`;
  }

  const e = scelta && datiEsito(scelta);

  function scegli(idEsito) {
    setScelta(idEsito);
    setProblema('');
    if (idEsito !== 'richiamare' && idEsito !== 'parlato_altri' && idEsito !== 'manda_mail') setRichiamo('');
    setTimeout(() => passo2.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  // Passa al prossimo senza cambiare nulla di questa azienda
  function salta() {
    if (!puoiUscire()) return;
    saltati.add(a.id);
    const prossimo = prossimoDopo(a.id);
    if (prossimo) { avviso(`Saltata. Ora: ${prossimo.nome_azienda}`); vai('/azienda/' + prossimo.id); }
    else avviso('Non ci sono altri numeri da chiamare.');
  }

  async function salva(eProssimo) {
    if (e.chiede === 'richiamo' && !richiamo) { setProblema('Scegli quando richiamare.'); return; }
    if (e.chiede === 'appuntamento' && !appuntamento) { setProblema('Scegli giorno e ora della demo.'); return; }
    if (salvataggio.current) return;  // doppio tocco: si salva una volta sola
    salvataggio.current = true;
    setSalvo(true);
    try {
      await registraChiamata(a.id, {
        esito: scelta, nota, referente, email,
        richiamo_il: richiamo || null,
        appuntamento_il: e.chiede === 'appuntamento' ? appuntamento : null,
        appuntamento_luogo: luogo,
      });
      avviso('Salvato ✓');
      visti.current += 1;
      nonSalvato.messaggio = '';
      if (eProssimo) {
        const prossimo = prossimoDopo(a.id);
        if (prossimo) { avviso(`Salvato ✓ Ora: ${prossimo.nome_azienda}`); vai('/azienda/' + prossimo.id); }
        else { avviso('Salvato ✓ Hai finito la lista!'); vai('/'); }
      } else {
        setScelta(''); setNota(''); setRichiamo('');
      }
    } catch (err) { errore(err); }
    salvataggio.current = false;
    setSalvo(false);
  }

  return html`<main class="schermata scheda ${scelta ? 'con-salva' : ''}">
    <div class="scheda-testa">
      <${Intestazione} conIndietro destra=${html`<button class="pulsante-altro" onClick=${() => puoiUscire() && vai('/modifica/' + a.id)}>✏️ Modifica</button>`} />
      <h1 class="scheda-nome">${a.nome_azienda}</h1>
      <div class="scheda-sotto">
        <span>${a.comune || 'Comune?'} · ${telefonoLeggibile(a.telefono)}</span>
        <a class="chiedi-google" href=${linkGoogleIA(a)} target="_blank" rel="noopener" aria-label="Chiedi a Google cosa fanno e che fatturato hanno">✨ Chiedi a Google</a>
      </div>
    </div>
    <${AvvisoInChiamata} azienda=${a} />
    ${nuovaDiAltri && html`<div class="banner banner-info"><b>${nuovaDiAltri.utente_nome}</b> ha appena registrato: ${datiEsito(nuovaDiAltri.esito).nome}${nuovaDiAltri.nota ? ` – “${nuovaDiAltri.nota}”` : ''}</div>`}

    <section class="riquadro info">
      <div><span class="etichetta">Esito</span> <${BadgeEsito} id=${a.esito} /></div>
      ${a.referente && html`<div><span class="etichetta">Referente</span> ${a.referente}</div>`}
      ${a.richiamo_il && html`<div><span class="etichetta">Richiamare</span> <span class=${new Date(a.richiamo_il) < new Date() ? 'rosso' : ''}>${dataOra(a.richiamo_il)}</span></div>`}
      ${a.esito === 'demo_fissata' && a.appuntamento_il && html`<div><span class="etichetta">Demo</span> ${dataOra(a.appuntamento_il)}${a.appuntamento_luogo ? ` · ${a.appuntamento_luogo}` : ''}</div>`}
      ${a.email && html`<div><span class="etichetta">Email</span> <a href=${'mailto:' + a.email}>${a.email}</a></div>`}
      ${a.note && html`<div class="note">${a.note}</div>`}
    </section>
    ${!scelta && !['demo_fissata', 'non_interessato', 'fuori_target'].includes(a.esito) && html`<${ConsiglioDemo} azienda=${a} />`}

    <section class="passo" ref=${passo1}>
      <h2><span class="numero-passo">1</span> Com'è andata?</h2>
      <div class="griglia-esiti">
        ${ESITI.map(x => html`<button class=${`esito-pulsante esito-${x.colore} ${scelta === x.id ? 'scelto' : ''} ${scelta && scelta !== x.id ? 'spento' : ''} ${x.id === 'demo_fissata' ? 'largo' : ''}`}
          aria-pressed=${scelta === x.id} onClick=${() => scegli(x.id)}>${scelta === x.id ? '✓ ' : ''}${x.nome}</button>`)}
      </div>
    </section>

    ${scelta && html`
      <section class="passo" ref=${passo2}>
        <h2><span class="numero-passo">2</span> Aggiungi se serve</h2>
        <label>Con chi hai parlato?
          <input value=${referente} onInput=${ev => setReferente(ev.target.value)} placeholder="Es. Mario Rossi, titolare" />
        </label>
        <label>Nota
          <textarea rows="2" value=${nota} onInput=${ev => setNota(ev.target.value)} placeholder="Es. ha già un gestionale, scade a marzo" />
        </label>
        ${e.chiede === 'email' && html`<label>Email a cui scrivere
          <input type="email" inputmode="email" value=${email} onInput=${ev => setEmail(ev.target.value)} />
        </label>`}
      </section>

      ${(e.chiede === 'richiamo' || e.chiede === 'richiamo-facoltativo' || e.chiede === 'email') && html`
        <section class="passo">
          <h2><span class="numero-passo">3</span> Quando richiamare?${e.chiede !== 'richiamo' ? html` <span class="tenue">(se serve)</span>` : ''}</h2>
          <div class="scorciatoie">
            ${[['oggi', 'Oggi'], ['domani', 'Domani'], ['tre', 'Tra 3 giorni']].map(([k, t]) =>
              html`<button class="pulsante secondario" onClick=${() => setRichiamo(scorciatoiaRichiamo(k))}>${t}</button>`)}
          </div>
          <label>Giorno e ora
            <input type="datetime-local" value=${versoInput(richiamo)} onInput=${ev => setRichiamo(daInput(ev.target.value))} />
          </label>
          ${richiamo && html`<p class="conferma-data">📅 Richiamare <b>${dataOra(richiamo)}</b></p>`}
        </section>`}

      ${e.chiede === 'appuntamento' && html`
        <section class="passo">
          <h2><span class="numero-passo">3</span> Quando e dove è la demo?</h2>
          <${ConsiglioDemo} azienda=${a} scegli=${setAppuntamento} scelto=${appuntamento} />
          <label>Giorno e ora
            <input type="datetime-local" value=${versoInput(appuntamento)} onInput=${ev => setAppuntamento(daInput(ev.target.value))} />
          </label>
          <label>Dove
            <input value=${luogo} onInput=${ev => setLuogo(ev.target.value)} placeholder="Indirizzo o comune" />
          </label>
        </section>`}

      <button class="pulsante secondario largo" disabled=${salvo} onClick=${() => salva(false)}>Salva e resta qui</button>`}

    <section class="storico">
      <h2>Chiamate fatte</h2>
      ${!storico.length ? html`<p class="tenue">Ancora nessuna chiamata.</p>` : html`<ul>
        ${storico.map(c => html`<li>
          <div><b>${c.utente_nome}</b> · ${dataOra(c.chiamata_il)} · <${BadgeEsito} id=${c.esito} /></div>
          ${c.nota && html`<div class="nota-storico">${c.nota}</div>`}
        </li>`)}
      </ul>`}
    </section>

    <div class="barra-fissa">
      ${problema && html`<p class="banner banner-errore">${problema}</p>`}
      ${scelta
        ? html`<div class="riga-pulsanti">
            <${PulsanteChiama} azienda=${a} poi=${vaiAgliEsiti} />
            <button class="pulsante primario grande" disabled=${salvo} onClick=${() => salva(true)}>${salvo ? 'Salvo…' : 'Salva e passa al prossimo'}</button>
          </div>`
        : html`<div class="riga-pulsanti">
            ${daPc
              ? html`<${PulsanteSegna} azienda=${a} poi=${vaiAgliEsiti} /><${PulsanteChiama} azienda=${a} poi=${vaiAgliEsiti} />`
              : html`<${PulsanteChiama} azienda=${a} grande poi=${vaiAgliEsiti} />`}
            <button class="pulsante secondario grande salta" onClick=${salta}>Salta ›</button>
          </div>`}
    </div>
  </main>`;
}

// ---- Richiami ----
export function richiamiDaFare(s) {
  const fineOggi = inizioGiorno().getTime() + 86400000;
  return s.aziende.filter(a => a.richiamo_il && !ESITI_NASCOSTI.includes(a.esito) && new Date(a.richiamo_il) < fineOggi);
}

export function Richiami() {
  const s = useDati();
  const tutti = s.aziende.filter(a => a.richiamo_il && !ESITI_NASCOSTI.includes(a.esito))
    .sort((a, b) => new Date(a.richiamo_il) - new Date(b.richiamo_il));
  const adesso = new Date();
  const fineOggi = inizioGiorno().getTime() + 86400000;
  const scaduti = tutti.filter(a => new Date(a.richiamo_il) < adesso);
  const oggi = tutti.filter(a => new Date(a.richiamo_il) >= adesso && new Date(a.richiamo_il) < fineOggi);
  const prossimi = tutti.filter(a => new Date(a.richiamo_il) >= fineOggi);

  const elenco = (lista, rosso) => html`<ul class="lista">${lista.map(a => html`
    <${Riga} key=${a.id} azienda=${a} dettaglio=${html`<span class=${rosso ? 'rosso' : ''}><b>${stessoGiorno(a.richiamo_il, adesso) ? soloOra(a.richiamo_il) : dataOra(a.richiamo_il)}</b>${a.referente ? ` · chiedere di ${a.referente}` : ''}</span>`} />`)}</ul>`;

  return html`<main class="schermata">
    <${Intestazione} titolo="Richiami" />
    ${!scaduti.length && !oggi.length && html`<div class="vuoto">Nessun richiamo per oggi 🎉</div>`}
    ${scaduti.length > 0 && html`<h2 class="sezione rosso">⚠️ In ritardo (${scaduti.length})</h2>${elenco(scaduti, true)}`}
    ${oggi.length > 0 && html`<h2 class="sezione">Oggi (${oggi.length})</h2>${elenco(oggi)}`}
    ${prossimi.length > 0 && html`<h2 class="sezione">Prossimi giorni</h2>${elenco(prossimi)}`}
  </main>`;
}

// ---- Appuntamenti (per Alessandro) ----
export function Appuntamenti() {
  const s = useDati();
  useComuni();
  const [passati, setPassati] = useState(false);
  const oggi = inizioGiorno();
  const demo = s.aziende.filter(a => a.esito === 'demo_fissata');
  const conData = demo.filter(a => a.appuntamento_il && (passati || new Date(a.appuntamento_il) >= oggi))
    .sort((a, b) => new Date(a.appuntamento_il) - new Date(b.appuntamento_il));
  const senzaData = demo.filter(a => !a.appuntamento_il);
  const quantiPassati = demo.filter(a => a.appuntamento_il && new Date(a.appuntamento_il) < oggi).length;

  const giorni = [];
  for (const a of conData) {
    const g = inizioGiorno(a.appuntamento_il).getTime();
    let giorno = giorni.find(x => x.g === g);
    if (!giorno) giorni.push(giorno = { g, comuni: {} });
    (giorno.comuni[a.comune || 'Comune?'] ||= []).push(a);
  }

  const Voce = ({ a }) => html`<li class="appuntamento">
    <button class="riga-testo" onClick=${() => vai('/azienda/' + a.id)}>
      <span class="ora">${soloOra(a.appuntamento_il)}</span>
      <span class="riga-nome">${a.nome_azienda}</span>
      ${a.referente && html`<span class="riga-sotto">con ${a.referente}</span>`}
      ${a.appuntamento_luogo && html`<span class="riga-sotto">📍 ${a.appuntamento_luogo}</span>`}
    </button>
    <div class="azioni-appuntamento">
      <${PulsanteChiama} azienda=${a} />
      <a class="pulsante secondario" target="_blank" rel="noopener"
        href=${'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([a.appuntamento_luogo, a.comune].filter(Boolean).join(', '))}>Mappa</a>
    </div>
  </li>`;

  return html`<main class="schermata">
    <${Intestazione} titolo="Appuntamenti" />
    ${!giorni.length && !senzaData.length && html`<div class="vuoto">Nessuna demo in programma.</div>`}
    ${giorni.map(({ g, comuni: perComune }) => html`
      <h2 class="sezione">${giornoLungo(g)}</h2>
      ${comuniPronti() && html`<p class="tenue strada">🚗 circa ${oreMinuti(stradaDelGiorno(tappeDelGiorno(s.aziende, new Date(g))))} di strada in tutto, partendo da ${GIRI.partenza}</p>`}
      ${Object.entries(perComune).map(([comune, lista]) => html`
        <h3 class="sottosezione">${comune} (${lista.length})</h3>
        <ul class="lista">${lista.map(a => html`<${Voce} key=${a.id} a=${a} />`)}</ul>`)}`)}
    ${senzaData.length > 0 && html`<h2 class="sezione">Data da decidere</h2>
      <ul class="lista">${senzaData.map(a => html`<${Riga} key=${a.id} azienda=${a} />`)}</ul>`}
    ${quantiPassati > 0 && html`<button class="pulsante secondario largo" onClick=${() => setPassati(!passati)}>
      ${passati ? 'Nascondi quelle passate' : `Mostra anche quelle passate (${quantiPassati})`}</button>`}
  </main>`;
}

// ---- Numeri ----
export function Numeri() {
  const s = useDati();
  const oggi = inizioGiorno();
  const persone = [...new Set([...NOMI, ...s.storico.map(c => c.utente_nome)])];
  const conta = (lista, nome) => {
    const sue = lista.filter(c => c.utente_nome === nome);
    return [sue.length, sue.filter(c => c.esito === 'parlato_titolare').length, sue.filter(c => c.esito === 'demo_fissata').length];
  };
  const diOggi = s.storico.filter(c => new Date(c.chiamata_il) >= oggi);

  const tabella = (titolo, lista) => html`
    <h2 class="sezione">${titolo}</h2>
    <table class="numeri">
      <thead><tr><th></th><th>Chiamate</th><th>Col titolare</th><th>Demo</th></tr></thead>
      <tbody>
        ${persone.map(p => html`<tr class=${p === s.nome ? 'io' : ''}><th>${p}</th>${conta(lista, p).map(n => html`<td>${n}</td>`)}</tr>`)}
        <tr class="totale"><th>Tutti</th><td>${lista.length}</td><td>${lista.filter(c => c.esito === 'parlato_titolare').length}</td><td>${lista.filter(c => c.esito === 'demo_fissata').length}</td></tr>
      </tbody>
    </table>`;

  const daLavorare = s.aziende.filter(a => !ESITI_NASCOSTI.includes(a.esito)).length;
  return html`<main class="schermata">
    <${Intestazione} titolo="Numeri" />
    ${tabella('Oggi', diOggi)}
    ${tabella('Dall\'inizio', s.storico)}
    <h2 class="sezione">Contatti</h2>
    <div class="riquadro info">
      <div><span class="etichetta">In tutto</span> ${s.aziende.length}</div>
      <div><span class="etichetta">Da lavorare</span> ${daLavorare}</div>
      <div><span class="etichetta">Mai chiamati</span> ${s.aziende.filter(a => a.esito === 'nuovo').length}</div>
      <div><span class="etichetta">Demo fissate</span> ${s.aziende.filter(a => a.esito === 'demo_fissata').length}</div>
    </div>
    <button class="pulsante secondario largo" onClick=${() => vai('/altro')}>Altro: importa, scarica in Excel, esci</button>
  </main>`;
}
