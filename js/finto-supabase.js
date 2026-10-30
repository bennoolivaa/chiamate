// Finto Supabase con dati inventati, solo per provare l'app in locale: http://localhost:8000/?demo
import { normalizzaTelefono } from './utili.js';

const COMUNI = ['Benevento', 'Montesarchio', "Sant'Agata de' Goti", 'Telese Terme', 'San Giorgio del Sannio', 'Airola', 'Cerreto Sannita', 'Avellino', 'Caserta'];
const NOMI = ['Edil Esempio', 'Costruzioni Prova', 'Impresa Fittizia', 'Sannio Lavori Demo', 'Cantieri Finti', 'Edilizia Modello', 'Ristrutturazioni Test', 'Murature Campione'];

function seme() {
  const ora = new Date();
  const fra = (giorni, h, m = 0) => { const d = new Date(ora); d.setDate(d.getDate() + giorni); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const aziende = [];
  let id = 1;
  for (let i = 0; i < 36; i++) {
    aziende.push({
      id: id++, nome_azienda: `${NOMI[i % NOMI.length]} ${['Srl', 'Snc', 'di Rossi', 'Sas'][i % 4]} ${i + 1}`,
      telefono: normalizzaTelefono(`0824 555${String(100 + i).padStart(3, '0')}`), comune: COMUNI[i % 7],
      email: null, referente: null, esito: 'nuovo', richiamo_il: null, appuntamento_il: null, appuntamento_luogo: null,
      note: null, in_chiamata_da: null, in_chiamata_dal: null, ultimo_chiamante: null, ultima_chiamata_il: null,
      tentativi: 0, creato_da: 'Benedetto', creato_il: fra(-3, 9), aggiornato_il: fra(-3, 9),
    });
  }
  const storico = [];
  const chiamata = (a, chi, quando, esito, nota, extra = {}) => {
    storico.push({ id: storico.length + 1, azienda_id: a.id, utente_nome: chi, chiamata_il: quando, esito, nota });
    Object.assign(a, { esito, ultimo_chiamante: chi, ultima_chiamata_il: quando, tentativi: a.tentativi + 1 }, extra);
  };
  chiamata(aziende[3], 'Luca', fra(-1, 10), 'non_risponde', null);
  chiamata(aziende[4], 'Benedetto', fra(-1, 11), 'segreteria', null);
  chiamata(aziende[5], 'Luca', fra(-1, 15), 'richiamare', 'Il titolare è in cantiere, richiamare', { referente: 'Sig. Esposito', richiamo_il: fra(0, 9, 30) });
  chiamata(aziende[6], 'Benedetto', fra(0, 9), 'richiamare', 'Vuole parlarne col socio', { referente: 'Geom. Bianchi', richiamo_il: fra(0, 17, 0) });
  chiamata(aziende[7], 'Benedetto', fra(0, 9, 20), 'non_interessato', 'Usa già Excel e gli basta');
  chiamata(aziende[8], 'Luca', fra(0, 10), 'parlato_titolare', 'Interessato, manda brochure', { referente: 'Ing. Verdi' });
  chiamata(aziende[18], 'Luca', fra(-1, 16), 'richiamare', 'Ha chiesto di richiamare', { richiamo_il: fra(-1, 17) });
  chiamata(aziende[9], 'Benedetto', fra(-2, 12), 'richiamare', null, { richiamo_il: fra(2, 10) });
  chiamata(aziende[10], 'Luca', fra(0, 10, 40), 'segreteria', null);
  // appuntamenti di novembre (come nell'esempio: 17 Avellino, 18 Caserta)
  const nov = (g, h, m = 0) => new Date(2026, 10, g, h, m).toISOString();
  [[11, 'Avellino', nov(17, 9, 30)], [12, 'Avellino', nov(17, 11, 30)], [13, 'Avellino', nov(17, 15)], [14, 'Caserta', nov(18, 10)], [15, 'Caserta', nov(18, 15)], [16, 'Benevento', nov(19, 10)]]
    .forEach(([i, comune, quando]) => {
      aziende[i].comune = comune;
      chiamata(aziende[i], i % 2 ? 'Luca' : 'Benedetto', fra(-1, 9 + (i % 6)), 'demo_fissata', 'Demo confermata', { appuntamento_il: quando, appuntamento_luogo: `Via Roma ${i}, ${comune}`, referente: 'Titolare' });
    });
  aziende[17].comune = 'Atripalda';
  aziende[2].in_chiamata_da = 'Luca';
  aziende[2].in_chiamata_dal = new Date(Date.now() - 2 * 60000).toISOString();
  return { aziende, storico };
}

// I dati finti sono condivisi tra le finestre dello stesso browser: così si può provare
// con due finestre (es. Benedetto e Luca) e vedere gli aggiornamenti in tempo reale.
// Per ripartire da zero: http://localhost:8000/?demo&azzera
export function creaClientFinto() {
  if (new URLSearchParams(location.search).has('azzera')) localStorage.removeItem('demo-dati');
  const tabelle = JSON.parse(localStorage.getItem('demo-dati') || 'null') || seme();
  const canali = [];
  const nomeTabella = t => (t === 'storico_chiamate' ? 'storico' : t);
  const nuovoId = table => Math.max(999, ...tabelle[nomeTabella(table)].map(r => r.id)) + 1;
  let sessione = JSON.parse(sessionStorage.getItem('demo-sessione') || 'null');
  const ascoltatoriAuth = [];
  const altreFinestre = new BroadcastChannel('chiamate-demo');
  const salva = () => localStorage.setItem('demo-dati', JSON.stringify(tabelle));
  salva();

  function avvisaCanali(table, eventType, riga, old) {
    canali.forEach(c => c.ascolta.forEach(([filtro, cb]) => {
      if (filtro.table === table && (filtro.event === '*' || filtro.event === eventType)) cb({ eventType, new: riga, old });
    }));
  }

  function emetti(table, eventType, riga, old) {
    salva();
    altreFinestre.postMessage({ table, eventType, riga, old });
    setTimeout(() => avvisaCanali(table, eventType, riga, old), 150);
  }

  altreFinestre.onmessage = ({ data: { table, eventType, riga, old } }) => {
    const dati = tabelle[nomeTabella(table)];
    if (eventType === 'DELETE') {
      const i = dati.findIndex(r => r.id === old.id);
      if (i >= 0) dati.splice(i, 1);
    } else {
      const i = dati.findIndex(r => r.id === riga.id);
      if (i >= 0) dati[i] = riga; else dati.push(riga);
    }
    avvisaCanali(table, eventType, riga, old);
  };

  function prepara(riga) {
    if ('telefono' in riga) {
      riga.telefono = normalizzaTelefono(riga.telefono);
      if (!riga.telefono) throw { message: 'Numero di telefono non valido' };
    }
    riga.aggiornato_il = new Date().toISOString();
    return riga;
  }

  class Query {
    constructor(table) { Object.assign(this, { table, op: 'select', filtri: [], ordine: null, da: 0, a: Infinity, unica: false }); }
    select() { return this; }
    insert(righe) { this.op = 'insert'; this.righe = [].concat(righe); return this; }
    upsert(righe, opz) { this.op = 'upsert'; this.righe = [].concat(righe); this.opz = opz; return this; }
    update(campi) { this.op = 'update'; this.campi = campi; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filtri.push([c, v]); return this; }
    order(c) { this.ordine = c; return this; }
    range(da, a) { this.da = da; this.a = a; return this; }
    single() { this.unica = true; return this; }
    esegui() {
      const dati = tabelle[nomeTabella(this.table)];
      const corrisponde = r => this.filtri.every(([c, v]) => r[c] === v);
      const fine = righe => ({ data: this.unica ? righe[0] : righe, error: null });
      if (this.op === 'select') return fine(dati.filter(corrisponde).sort((x, y) => x[this.ordine] - y[this.ordine]).slice(this.da, this.a + 1));
      if (this.op === 'insert' || this.op === 'upsert') {
        const aggiunte = [];
        for (const r of this.righe) {
          const riga = prepara({ esito: 'nuovo', tentativi: 0, creato_il: new Date().toISOString(), ...r });
          if (dati.some(x => x.telefono === riga.telefono)) {
            if (this.op === 'upsert') continue;
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          riga.id = nuovoId(this.table);
          dati.push(riga); aggiunte.push(riga); emetti(this.table, 'INSERT', riga);
        }
        return fine(aggiunte);
      }
      if (this.op === 'update') {
        const cambiate = dati.filter(corrisponde).map(r => {
          const nuova = prepara({ ...r, ...this.campi });
          if (dati.some(x => x.id !== r.id && x.telefono === nuova.telefono)) throw { code: '23505', message: 'duplicate' };
          Object.assign(r, nuova); emetti(this.table, 'UPDATE', { ...r }); return { ...r };
        });
        return fine(cambiate);
      }
      if (this.op === 'delete') {
        dati.filter(corrisponde).forEach(r => {
          dati.splice(dati.indexOf(r), 1);
          tabelle.storico = tabelle.storico.filter(s => s.azienda_id !== r.id);
          emetti(this.table, "DELETE", null, { id: r.id });
        });
        return fine([]);
      }
    }
    then(ok, ko) {
      return new Promise(r => setTimeout(r, 120)).then(() => {
        try { return this.esegui(); } catch (e) { return { data: null, error: e }; }
      }).then(ok, ko);
    }
  }

  const utente = () => sessione?.user;
  const avvisaAuth = ev => ascoltatoriAuth.forEach(cb => cb(ev, sessione));

  return {
    auth: {
      onAuthStateChange(cb) { ascoltatoriAuth.push(cb); setTimeout(() => cb('INITIAL_SESSION', sessione), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        await new Promise(r => setTimeout(r, 300));
        if (password !== 'prova') return { error: { message: 'Invalid login credentials' } };
        sessione = { user: { id: 'demo-' + email, email, user_metadata: {} } };
        sessionStorage.setItem('demo-sessione', JSON.stringify(sessione));
        avvisaAuth('SIGNED_IN');
        return { error: null };
      },
      async signOut() { sessione = null; sessionStorage.removeItem('demo-sessione'); avvisaAuth('SIGNED_OUT'); return { error: null }; },
      async updateUser({ data }) {
        sessione.user.user_metadata = { ...sessione.user.user_metadata, ...data };
        sessionStorage.setItem('demo-sessione', JSON.stringify(sessione));
        return { data: { user: sessione.user }, error: null };
      },
    },
    from: table => new Query(table),
    async rpc(nome, p) {
      await new Promise(r => setTimeout(r, 150));
      if (nome === 'e_membro') return { data: !!utente(), error: null };
      const a = tabelle.aziende.find(x => x.id === p.p_azienda_id);
      if (!a) return { data: null, error: { message: 'Azienda non trovata' } };
      if (nome === 'segna_in_chiamata') {
        Object.assign(a, { in_chiamata_da: p.p_nome, in_chiamata_dal: new Date().toISOString() });
        emetti('aziende', 'UPDATE', { ...a });
        return { data: null, error: null };
      }
      if (nome === 'registra_chiamata') {
        const riga = { id: nuovoId("storico_chiamate"), azienda_id: a.id, utente_nome: p.p_nome, chiamata_il: new Date().toISOString(), esito: p.p_esito, nota: p.p_nota?.trim() || null };
        tabelle.storico.push(riga); emetti('storico_chiamate', 'INSERT', riga);
        Object.assign(a, {
          esito: p.p_esito, referente: p.p_referente?.trim() || a.referente, email: p.p_email?.trim() || a.email,
          richiamo_il: p.p_richiamo_il,
          appuntamento_il: p.p_esito === 'demo_fissata' ? p.p_appuntamento_il : a.appuntamento_il,
          appuntamento_luogo: p.p_esito === 'demo_fissata' ? (p.p_appuntamento_luogo?.trim() || null) : a.appuntamento_luogo,
          in_chiamata_da: null, in_chiamata_dal: null, ultimo_chiamante: p.p_nome,
          ultima_chiamata_il: new Date().toISOString(), tentativi: a.tentativi + 1,
        });
        emetti('aziende', 'UPDATE', { ...a });
        return { data: { ...a }, error: null };
      }
      return { data: null, error: { message: 'funzione sconosciuta' } };
    },
    functions: {
      async invoke(nome, { body }) {
        await new Promise(r => setTimeout(r, 700));
        // finta Pagine Gialle: risponde solo ai numeri che finiscono con 777
        if (!String(body.telefono).endsWith('777')) return { data: { risultati: [] }, error: null };
        return { data: { risultati: [{ nome_azienda: 'Edil Trovata Online Srl', categoria: 'Imprese edili', indirizzo: 'Via Appia 10 - 82018 San Giorgio del Sannio (BN)', comune: 'San Giorgio del Sannio', sito: 'https://esempio.it', email: '' }] }, error: null };
      },
    },
    channel() {
      const c = { ascolta: [], on(_, filtro, cb) { this.ascolta.push([filtro, cb]); return this; }, subscribe() { canali.push(this); return this; } };
      return c;
    },
    removeChannel(c) { canali.splice(canali.indexOf(c), 1); },
  };
}
