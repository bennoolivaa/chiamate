export const SUPABASE_URL = 'https://knifvycahljluhcljwdx.supabase.co';
// Chiave pubblica: può stare nel codice. Mai mettere qui la chiave "secret".
export const SUPABASE_KEY = 'sb_publishable_opoFLZ3PJTzymJ0nyhmrjQ_sbsNr00-';

export const NOMI = ['Benedetto', 'Luca', 'Alessandro'];

// Mail che si apre già compilata da "Mail da inviare". {referente} e {azienda} vengono sostituiti.
export const EMAIL = {
  oggetto: 'Aedify – il gestionale per imprese edili',
  testo: `Buongiorno {referente},

come d'accordo al telefono le scrivo per presentarle Aedify, il gestionale pensato per le imprese edili: cantieri, preventivi, ore e costi in un solo posto, anche dal telefono.

Se le fa piacere, possiamo fissare una breve dimostrazione nella sua sede, senza impegno.

Cordiali saluti`,
};

export const MINUTI_IN_CHIAMATA = 10;

// Giri di Alessandro: servono a consigliare il giorno e l'ora migliore per una nuova demo
export const GIRI = {
  partenza: 'Benevento',      // dove dorme: parte da qui la mattina e torna qui la sera
  dal: '2026-11-02',          // periodo in cui fa appuntamenti
  al: '2026-11-30',
  inizio: '09:00',            // prima demo non prima di
  fine: '19:00',              // ultima demo finita entro
  pausa: ['13:00', '14:00'],  // pranzo: niente demo in questo orario
  durataDemo: 60,             // minuti
  margine: 15,                // minuti tra una demo e il viaggio successivo
  massimoAlGiorno: 5,
  weekend: false,             // sabato e domenica esclusi
  velocita: 55,               // km/h medi
  fattoreStrada: 1.35,        // le strade non sono in linea d'aria
};

// Ordine = ordine dei pulsanti dopo la chiamata. "chiede" = cosa serve al passo 3.
export const ESITI = [
  { id: 'non_risponde', nome: 'Non risponde', colore: 'grigio' },
  { id: 'segreteria', nome: 'Segreteria', colore: 'grigio' },
  { id: 'richiamare', nome: 'Richiamare', colore: 'giallo', chiede: 'richiamo' },
  { id: 'manda_mail', nome: 'Manda mail', colore: 'azzurro', chiede: 'email' },
  { id: 'parlato_titolare', nome: 'Parlato col titolare', colore: 'blu' },
  { id: 'parlato_altri', nome: 'Parlato con altri', colore: 'viola', chiede: 'richiamo-facoltativo' },
  { id: 'non_interessato', nome: 'Non interessato', colore: 'rosso' },
  { id: 'fuori_target', nome: 'Fuori target', colore: 'marrone' },
  { id: 'demo_fissata', nome: 'Demo fissata', colore: 'verde', chiede: 'appuntamento' },
];
export const ESITO_NUOVO = { id: 'nuovo', nome: 'Nuovo', colore: 'bianco' };
export const ESITI_NASCOSTI = ['non_interessato', 'fuori_target', 'demo_fissata'];

export function esito(id) {
  return ESITI.find(e => e.id === id) || ESITO_NUOVO;
}
