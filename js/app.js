import { html, render, useState, useEffect } from '../vendor/preact-htm.js';
import { NOMI } from './config.js';
import {
  stato, ascolta, avvia, accedi, esci, impostaNome, segnaInChiamata, chiamaUnAltro, chiChiama, chiamataSenzaEsito, liberaChiamata,
} from './dati.js';
import { messaggioErrore, minutiFa, dataOra, telefonoLeggibile } from './utili.js';
import { DaChiamare, Scheda, Richiami, Appuntamenti, Numeri } from './schermate.js';
import { Altro, Aggiungi, Modifica, Importa } from './altro.js';
import { Oggi, quanteCoseDaFare } from './oggi.js';

// ---- Navigazione con l'indirizzo (#/richiami ecc.), così funziona anche il tasto "indietro" ----
export function vai(percorso) { location.hash = '#' + percorso; }

// Se c'è qualcosa di non salvato, chiediamo prima di uscire dalla schermata
export const nonSalvato = { messaggio: '' };
export function puoiUscire() {
  if (!nonSalvato.messaggio) return true;
  if (!confirm(nonSalvato.messaggio)) return false;
  nonSalvato.messaggio = '';
  return true;
}
addEventListener('beforeunload', e => { if (nonSalvato.messaggio) e.preventDefault(); });
export function indietro() { history.length > 1 ? history.back() : vai('/'); }
function percorsoAttuale() { return location.hash.replace(/^#/, '') || '/'; }

export function useDati() {
  const [, aggiorna] = useState(0);
  useEffect(() => {
    const smetti = ascolta(() => aggiorna(n => n + 1));
    aggiorna(n => n + 1);  // lo stato potrebbe essere cambiato prima che ci mettessimo in ascolto
    return smetti;
  }, []);
  return stato;
}

// ---- Messaggio in basso ("Salvato ✓") ----
let mostraAvviso = () => {};
export function avviso(testo, tipo = 'ok') { mostraAvviso({ testo, tipo, id: Date.now() }); }

function Avviso() {
  const [messaggio, setMessaggio] = useState(null);
  useEffect(() => { mostraAvviso = setMessaggio; }, []);
  useEffect(() => {
    if (!messaggio) return;
    const t = setTimeout(() => setMessaggio(null), messaggio.tipo === 'errore' ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [messaggio]);
  if (!messaggio) return null;
  return html`<div class="avviso avviso-${messaggio.tipo}" role="status" onClick=${() => setMessaggio(null)}>${messaggio.testo}</div>`;
}

export function errore(e) { avviso(messaggioErrore(e), 'errore'); }

// ---- Pezzi riusati ----
export const icone = {
  telefono: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>`,
  orologio: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7z"/></svg>`,
  calendario: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"/></svg>`,
  numeri: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>`,
  casa: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg>`,
};

// Tasto "Chiama": apre il telefono e segnala agli altri "sto chiamando"
export function PulsanteChiama({ azienda, grande, poi, testo = 'Chiama' }) {
  const altro = chiamaUnAltro(azienda);
  function clic(ev) {
    if (altro && !confirm(`${altro} la sta chiamando adesso. Vuoi chiamare lo stesso?`)) { ev.preventDefault(); return; }
    segnaInChiamata(azienda.id, !!altro)
      .then(chi => { if (chi && chi !== stato.nome) avviso(`${chi} la stava già chiamando`, 'errore'); })
      .catch(() => {});
    if (poi) setTimeout(poi, 300);
  }
  return html`<a class=${grande ? 'pulsante pulsante-chiama grande' : 'tondo-chiama'} href=${'tel:' + azienda.telefono}
    onClick=${clic} aria-label=${testo + ' ' + azienda.nome_azienda}>
    ${icone.telefono}${grande ? html`<span>${altro ? 'Chiama lo stesso' : testo}</span>` : ''}
  </a>`;
}

// Su un computer (mouse o trackpad) il collegamento tel: non serve: si compone dal telefono
export const daPc = matchMedia('(hover: hover) and (pointer: fine)').matches;

// "Sto chiamando" senza far partire la chiamata: per chi lavora dal PC e compone dal telefono
export function PulsanteSegna({ azienda, poi }) {
  const altro = chiamaUnAltro(azienda);
  function clic() {
    if (altro && !confirm(`${altro} la sta chiamando adesso. Vuoi chiamare lo stesso?`)) return;
    segnaInChiamata(azienda.id, !!altro)
      .then(chi => { if (chi && chi !== stato.nome) avviso(`${chi} la stava già chiamando`, 'errore'); })
      .catch(errore);
    poi?.();
  }
  return html`<button class="pulsante pulsante-chiama grande" onClick=${clic}>${icone.telefono}<span>${altro ? 'Chiamo lo stesso' : 'Sto chiamando'}</span></button>`;
}

export function BadgeInChiamata({ azienda }) {
  const chi = chiChiama(azienda);
  if (chi) {
    return chi === stato.nome
      ? html`<span class="badge badge-io">📞 Stai chiamando tu</span>`
      : html`<span class="badge badge-in-chiamata">📞 In chiamata: ${chi}</span>`;
  }
  const senza = chiamataSenzaEsito(azienda);
  return senza ? html`<span class="badge badge-senza-esito">☎️ Chiamata da ${senza.chi} ${dataOra(senza.quando)}, esito non salvato</span>` : null;
}

export function AvvisoInChiamata({ azienda }) {
  const chi = chiChiama(azienda);
  if (chi === stato.nome) {
    return html`<div class="banner banner-io">
      📞 <b>Stai chiamando</b> · gli altri lo vedono<br />
      <span class="numero-grande">${telefonoLeggibile(azienda.telefono)}</span>
      Quando hai finito, scegli qui sotto com'è andata.
      <button class="pulsante secondario largo mt" onClick=${() => liberaChiamata(azienda.id).catch(errore)}>Non l'ho chiamato</button>
    </div>`;
  }
  if (chi) {
    const min = minutiFa(azienda.in_chiamata_dal);
    return html`<div class="banner banner-attenzione">📞 <b>${chi}</b> la sta chiamando adesso${min ? ` (da ${min} min)` : ''}. Meglio aspettare.</div>`;
  }
  const senza = chiamataSenzaEsito(azienda);
  return senza ? html`<div class="banner banner-info">☎️ <b>${senza.chi}</b> l'ha chiamata ${dataOra(senza.quando)} ma non ha salvato com'è andata.</div>` : null;
}

export function Intestazione({ titolo, conIndietro, destra }) {
  return html`<header class="intestazione">
    ${conIndietro ? html`<button class="indietro" onClick=${() => puoiUscire() && indietro()}>‹ Indietro</button>
      <button class="pulsante-home" onClick=${() => puoiUscire() && vai('/')} aria-label="Torna alla schermata Oggi">${icone.casa}<span>Home</span></button>` : html`<h1>${titolo}</h1>`}
    ${destra !== undefined ? destra : html`<button class="pulsante-altro" onClick=${() => puoiUscire() && vai('/altro')}>Altro</button>`}
  </header>
  ${conIndietro && titolo ? html`<h1 class="titolo-pagina">${titolo}</h1>` : ''}`;
}

// ---- Accesso ----
function Accesso() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vedi, setVedi] = useState(false);
  const [resta, setResta] = useState(true);
  const [attesa, setAttesa] = useState(false);
  const [problema, setProblema] = useState('');

  async function invia(ev) {
    ev.preventDefault();
    setProblema('');
    if (!email || !password) { setProblema('Scrivi email e password.'); return; }
    setAttesa(true);
    try { await accedi(email, password, resta); }
    catch (e) { setProblema(messaggioErrore(e)); }
    setAttesa(false);
  }

  return html`<main class="accesso"><div class="accesso-scheda">
    <img src="icone/icona.svg" alt="" class="logo" width="76" height="76" />
    <h1>Chiamate Aedify</h1>
    <p class="accesso-sotto">Entra con la tua email e password</p>
    <form onSubmit=${invia} class="modulo" novalidate>
      <label>Email
        <input type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false"
          placeholder="nome@esempio.it" value=${email} onInput=${e => setEmail(e.target.value)} />
      </label>
      <label>Password
        <div class="campo-password">
          <input type=${vedi ? 'text' : 'password'} name="password" autocomplete="current-password" aria-label="Password"
            value=${password} onInput=${e => setPassword(e.target.value)} />
          <button type="button" class="mostra" onClick=${() => setVedi(!vedi)}>${vedi ? 'Nascondi' : 'Mostra'}</button>
        </div>
      </label>
      <label class="spunta"><input type="checkbox" checked=${resta} onChange=${e => setResta(e.target.checked)} /> Resta collegato</label>
      ${problema && html`<p class="banner banner-errore" role="alert">${problema}</p>`}
      <button class="pulsante primario grande entra" disabled=${attesa}>${attesa ? 'Un attimo…' : 'Entra'}</button>
    </form>
    <p class="accesso-piede">Password dimenticata? Chiedila a Benedetto.</p>
  </div></main>`;
}

export function SceltaNome({ dopo }) {
  const [altro, setAltro] = useState('');
  async function scegli(nome) {
    if (!nome.trim()) return;
    try { await impostaNome(nome.trim()); dopo?.(); } catch (e) { errore(e); }
  }
  return html`<main class="accesso"><div class="accesso-scheda">
    <img src="icone/icona.svg" alt="" class="logo" width="64" height="64" />
    <h1>Chi sei?</h1>
    <p class="accesso-sotto">Serve per far sapere agli altri chi ha chiamato.</p>
    <div class="colonna">
      ${NOMI.map(n => html`<button class="pulsante primario grande" onClick=${() => scegli(n)}>${n}</button>`)}
    </div>
    <label class="mt">Un altro nome
      <div class="con-pulsante">
        <input value=${altro} onInput=${e => setAltro(e.target.value)} />
        <button class="pulsante secondario" onClick=${() => scegli(altro)}>OK</button>
      </div>
    </label>
  </div></main>`;
}

function NonAbilitato() {
  return html`<main class="accesso"><div class="accesso-scheda">
    <img src="icone/icona.svg" alt="" class="logo" width="64" height="64" />
    <h1>Account non ancora attivo</h1>
    <p class="accesso-sotto">Sei entrato, ma il tuo account non è ancora abilitato a vedere i contatti. Chiedi a Benedetto di abilitarlo, poi riapri l'app.</p>
    <button class="pulsante secondario grande largo" onClick=${esci}>Esci</button>
  </div></main>`;
}

// ---- Barra in basso ----
function Navigazione({ percorso }) {
  const s = useDati();
  const voci = [
    ['/', 'Oggi', icone.casa, quanteCoseDaFare(s)],
    ['/chiamare', 'Da chiamare', icone.telefono],
    ['/appuntamenti', 'Appuntamenti', icone.calendario],
    ['/numeri', 'Numeri', icone.numeri],
  ];
  const attiva = p => {
    if (p === '/') return percorso === '/' || percorso.startsWith('/richiami');
    if (p === '/chiamare') return ['/chiamare', '/aggiungi'].includes(percorso) || percorso.startsWith('/azienda') || percorso.startsWith('/modifica');
    return percorso.startsWith(p);
  };
  return html`<nav class="navigazione">
    ${voci.map(([p, nome, icona, numero]) => html`
      <a href=${'#' + p} class=${attiva(p) ? 'attiva' : ''} aria-current=${attiva(p) ? 'page' : undefined}
        onClick=${e => { if (!puoiUscire()) e.preventDefault(); }}>
        ${icona}${numero ? html`<span class="contatore">${numero}</span>` : ''}<span>${nome}</span>
      </a>`)}
  </nav>`;
}

function Schermata({ percorso }) {
  const [, nome, id] = percorso.split('/');
  switch (nome) {
    case 'chiamare': return html`<${DaChiamare} />`;
    case 'richiami': return html`<${Richiami} />`;
    case 'appuntamenti': return html`<${Appuntamenti} />`;
    case 'numeri': return html`<${Numeri} />`;
    case 'altro': return html`<${Altro} />`;
    case 'aggiungi': return html`<${Aggiungi} />`;
    case 'importa': return html`<${Importa} />`;
    case 'azienda': return html`<${Scheda} key=${id} id=${Number(id)} />`;
    case 'modifica': return html`<${Modifica} key=${id} id=${Number(id)} />`;
    case 'nome': return html`<${SceltaNome} dopo=${indietro} />`;
    default: return html`<${Oggi} />`;
  }
}

function App() {
  const s = useDati();
  const [percorso, setPercorso] = useState(percorsoAttuale());
  useEffect(() => {
    const posizioni = {};
    let precedente = percorsoAttuale();
    const cambio = () => {
      posizioni[precedente] = window.scrollY;
      precedente = percorsoAttuale();
      setPercorso(precedente);
      const torna = ['/', '/chiamare', '/richiami', '/appuntamenti'].includes(precedente) ? posizioni[precedente] || 0 : 0;
      requestAnimationFrame(() => window.scrollTo(0, torna));
    };
    addEventListener('hashchange', cambio);
    return () => removeEventListener('hashchange', cambio);
  }, []);

  let contenuto;
  if (!s.pronto) contenuto = html`<main class="accesso"><p class="accesso-sotto">Un attimo…</p></main>`;
  else if (!s.utente) contenuto = html`<${Accesso} />`;
  else if (!s.nome) contenuto = html`<${SceltaNome} />`;
  else if (!s.membro) contenuto = html`<${NonAbilitato} />`;
  else contenuto = html`
    ${!s.online && html`<div class="banner banner-errore fisso-alto">Manca internet: le modifiche non si salvano finché non torna.</div>`}
    <${Schermata} percorso=${percorso} />
    <${Navigazione} percorso=${percorso} />`;

  return html`${contenuto}<${Avviso} />`;
}

export async function parti(clientDiProva) {
  await avvia(clientDiProva);
  render(html`<${App} />`, document.getElementById('app'));
}
