import { html, useState } from '../vendor/preact-htm.js';
import { ESITI_NASCOSTI, EMAIL } from './config.js';
import { chiChiama, chiamataSenzaEsito, segnaMailInviata } from './dati.js';
import { useDati, vai, avviso, errore, Intestazione, PulsanteChiama } from './app.js';
import { BadgeEsito, prossimoDopo } from './schermate.js';
import { dataOra, soloOra, inizioGiorno, stessoGiorno, scorciatoiaRichiamo } from './utili.js';

function ricorda(chiave, valore) { try { localStorage.setItem(chiave, valore); } catch (_) { /* niente */ } }
function ricordato(chiave) { try { return localStorage.getItem(chiave) || ''; } catch (_) { return ''; } }

// Mail da mandare: esito "Manda mail" e non ancora segnata come inviata dopo l'ultima chiamata
function mailDaInviare(a) {
  return a.esito === 'manda_mail'
    && (!a.mail_inviata_il || (a.ultima_chiamata_il && new Date(a.mail_inviata_il) < new Date(a.ultima_chiamata_il)));
}

// Tutte le cose da fare, già in ordine di precedenza
export function coseDaFare(s, soloMie = false) {
  const mio = a => !soloMie || a.ultimo_chiamante === s.nome || a.in_chiamata_da === s.nome;
  const fineOggi = inizioGiorno().getTime() + 86400000;
  const adesso = new Date();
  const perData = campo => (x, y) => new Date(x[campo]) - new Date(y[campo]);
  const attive = s.aziende.filter(a => !ESITI_NASCOSTI.includes(a.esito));
  return {
    senzaEsito: s.aziende.filter(a => chiamataSenzaEsito(a)?.chi === s.nome),
    inRitardo: attive.filter(a => a.richiamo_il && new Date(a.richiamo_il) < adesso && mio(a)).sort(perData('richiamo_il')),
    oggi: attive.filter(a => a.richiamo_il && new Date(a.richiamo_il) >= adesso && new Date(a.richiamo_il) < fineOggi && mio(a)).sort(perData('richiamo_il')),
    mail: s.aziende.filter(a => mailDaInviare(a) && mio(a)).sort(perData('ultima_chiamata_il')),
    demo: s.aziende.filter(a => a.esito === 'demo_fissata' && a.appuntamento_il
      && new Date(a.appuntamento_il) >= inizioGiorno() && new Date(a.appuntamento_il) < fineOggi + 86400000).sort(perData('appuntamento_il')),
  };
}

export function quanteCoseDaFare(s) {
  const c = coseDaFare(s, ricordato('soloMie') === 'si');
  return c.senzaEsito.length + c.inRitardo.length + c.oggi.length + c.mail.length;
}

function linkMail(a) {
  const compila = t => t.replaceAll('{referente}', a.referente || '').replaceAll('{azienda}', a.nome_azienda).replace(/ ,/g, ',');
  return `mailto:${encodeURIComponent(a.email || '')}?subject=${encodeURIComponent(compila(EMAIL.oggetto))}&body=${encodeURIComponent(compila(EMAIL.testo))}`;
}

function Voce({ a, rosso, dettaglio, azioni }) {
  return html`<li class=${'voce' + (rosso ? ' voce-rossa' : '')}>
    <button class="riga-testo" onClick=${() => vai('/azienda/' + a.id)}>
      <span class="riga-nome">${a.nome_azienda}</span>
      <span class="riga-sotto">${a.comune || 'Comune?'} · <${BadgeEsito} id=${a.esito} /></span>
      ${dettaglio && html`<span class=${'riga-dettaglio' + (rosso ? ' rosso' : '')}>${dettaglio}</span>`}
    </button>
    ${azioni}
  </li>`;
}

function Sezione({ titolo, quante, children }) {
  if (!quante) return null;
  return html`<h2 class="sezione">${titolo} <span class="quante">${quante}</span></h2><ul class="lista">${children}</ul>`;
}

export function Oggi() {
  const s = useDati();
  const [soloMie, setSoloMie] = useState(ricordato('soloMie') === 'si');
  const c = coseDaFare(s, soloMie);
  const totale = c.senzaEsito.length + c.inRitardo.length + c.oggi.length + c.mail.length;
  const diOggi = s.storico.filter(x => x.utente_nome === s.nome && new Date(x.chiamata_il) >= inizioGiorno());
  const daChiamare = s.aziende.filter(a => a.esito === 'nuovo' && !a.in_chiamata_dal).length;
  const chi = a => a.ultimo_chiamante && a.ultimo_chiamante !== s.nome ? ` · da ${a.ultimo_chiamante}` : '';

  function scegli(valore) { setSoloMie(valore); ricorda('soloMie', valore ? 'si' : 'no'); }

  function inizia() {
    const primo = prossimoDopo(null);
    if (primo) vai('/azienda/' + primo.id); else avviso('Non ci sono numeri da chiamare: aggiungine uno.');
  }

  async function mailInviata(a) {
    try {
      await segnaMailInviata(a.id);
      avviso(`Fatto ✓ Te la ripropongo da richiamare ${dataOra(scorciatoiaRichiamo('tre'))}`);
    } catch (e) { errore(e); }
  }

  const giorno = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

  return html`<main class="schermata">
    <${Intestazione} titolo=${`Ciao ${s.nome}`} />
    <p class="data-oggi">${giorno[0].toUpperCase() + giorno.slice(1)}</p>

    <div class="colonna azioni-oggi">
      <button class="pulsante pulsante-chiama grande" onClick=${inizia}>Inizia a chiamare ›</button>
      <button class="pulsante secondario grande" onClick=${() => vai('/aggiungi')}>＋ Aggiungi un numero</button>
    </div>

    <div class="riquadro miei-numeri">
      <div><b>${diOggi.length}</b><span>chiamate oggi</span></div>
      <div><b>${diOggi.filter(x => x.esito === 'parlato_titolare').length}</b><span>col titolare</span></div>
      <div><b>${diOggi.filter(x => x.esito === 'demo_fissata').length}</b><span>demo</span></div>
      <div><b>${daChiamare}</b><span>mai chiamati</span></div>
    </div>

    <div class="intestazione-lista">
      <h2>Da fare ${totale ? html`<span class="quante">${totale}</span>` : ''}</h2>
      <div class="scelta-doppia" role="group" aria-label="Di chi">
        <button class=${!soloMie ? 'attivo' : ''} aria-pressed=${!soloMie} onClick=${() => scegli(false)}>Tutti</button>
        <button class=${soloMie ? 'attivo' : ''} aria-pressed=${soloMie} onClick=${() => scegli(true)}>Solo miei</button>
      </div>
    </div>

    ${!totale && html`<div class="vuoto">Niente in sospeso 💪<br />Tocca "Inizia a chiamare".</div>`}

    <${Sezione} titolo="⚠️ Scrivi com'è andata" quante=${c.senzaEsito.length}>
      ${c.senzaEsito.map(a => html`<${Voce} key=${a.id} a=${a} rosso
        dettaglio=${`L'hai chiamata ${dataOra(a.in_chiamata_dal)} ma non hai salvato l'esito`}
        azioni=${html`<button class="pulsante primario" onClick=${() => vai('/azienda/' + a.id)}>Scrivi</button>`} />`)}
    <//>

    <${Sezione} titolo="📞 Richiamare in ritardo" quante=${c.inRitardo.length}>
      ${c.inRitardo.map(a => html`<${Voce} key=${a.id} a=${a} rosso
        dettaglio=${`Era per ${dataOra(a.richiamo_il)}${a.referente ? ` · chiedere di ${a.referente}` : ''}${chi(a)}`}
        azioni=${chiChiama(a) && chiChiama(a) !== s.nome ? html`<span class="badge badge-in-chiamata">📞 ${chiChiama(a)}</span>` : html`<${PulsanteChiama} azienda=${a} poi=${() => vai('/azienda/' + a.id)} />`} />`)}
    <//>

    <${Sezione} titolo="📞 Richiamare oggi" quante=${c.oggi.length}>
      ${c.oggi.map(a => html`<${Voce} key=${a.id} a=${a}
        dettaglio=${`Alle ${soloOra(a.richiamo_il)}${a.referente ? ` · chiedere di ${a.referente}` : ''}${chi(a)}`}
        azioni=${html`<${PulsanteChiama} azienda=${a} poi=${() => vai('/azienda/' + a.id)} />`} />`)}
    <//>

    <${Sezione} titolo="✉️ Mail da inviare" quante=${c.mail.length}>
      ${c.mail.map(a => html`<li class="voce voce-mail">
        <button class="riga-testo" onClick=${() => vai('/azienda/' + a.id)}>
          <span class="riga-nome">${a.nome_azienda}</span>
          <span class="riga-sotto">${a.email || 'Email da chiedere'}${a.referente ? ` · ${a.referente}` : ''}</span>
          <span class="riga-dettaglio">Chiesta ${dataOra(a.ultima_chiamata_il)}${chi(a)}</span>
        </button>
        <div class="azioni-mail">
          <a class="pulsante secondario" href=${linkMail(a)}>✉️ Scrivi la mail</a>
          <button class="pulsante primario" onClick=${() => mailInviata(a)}>Mail inviata ✓</button>
        </div>
      </li>`)}
    <//>

    <${Sezione} titolo="📅 Demo oggi e domani" quante=${c.demo.length}>
      ${c.demo.map(a => html`<${Voce} key=${a.id} a=${a}
        dettaglio=${`${stessoGiorno(a.appuntamento_il, new Date()) ? 'Oggi' : 'Domani'} alle ${soloOra(a.appuntamento_il)}${a.appuntamento_luogo ? ` · ${a.appuntamento_luogo}` : ''}`}
        azioni=${html`<a class="pulsante secondario" target="_blank" rel="noopener"
          href=${'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([a.appuntamento_luogo, a.comune].filter(Boolean).join(', '))}>Mappa</a>`} />`)}
    <//>

    <button class="pulsante secondario largo mt-grande" onClick=${() => vai('/richiami')}>Tutti i richiami, anche dei prossimi giorni</button>
  </main>`;
}
