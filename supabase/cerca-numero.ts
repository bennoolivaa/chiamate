// Supabase Edge Function "cerca-numero": dato un numero, cerca l'azienda su Pagine Gialle / Pagine Bianche.
// Da incollare in Supabase > Edge Functions > Deploy a new function > Via Editor (nome: cerca-numero).
// Solo Benedetto, Luca e Alessandro possono usarla: chiede al database se chi chiama è nella tabella "membri".

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FONTI = [
  (n: string) => `https://www.paginegialle.it/ricerca/${n}`,
  (n: string) => `https://www.paginebianche.it/cerca-da-numero?qs=${n}`,
];

function testo(html: string) {
  return html.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function primo(html: string, classe: string) {
  const m = html.match(new RegExp(`class="[^"]*${classe}[^"]*"[^>]*>([\\s\\S]*?)</(?:h2|div|span|a)>`));
  return m ? testo(m[1]) : '';
}

export function comuneDaIndirizzo(indirizzo: string) {
  const m = indirizzo.match(/\b\d{5}\s+([^,()\d]+?)\s*(?:\([A-Z]{2}\))?\s*$/) || indirizzo.match(/([^,\-\d]+?)\s*\([A-Z]{2}\)/);
  return m ? m[1].trim() : '';
}

export function leggiRisultati(html: string) {
  const pezzi = html.split(/class="search-itm__inner"/).slice(1);
  return pezzi.map(p => {
    const indirizzo = primo(p, 'search-itm__adr');
    const sito = (p.match(/data-pag="www"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*data-pag="www"/) || []).slice(1).find(Boolean) || '';
    const email = (p.match(/mailto:([^"?]+)/) || [])[1] || '';
    return {
      nome_azienda: primo(p, 'search-itm__rag'),
      categoria: primo(p, 'search-itm__category'),
      indirizzo,
      comune: comuneDaIndirizzo(indirizzo),
      sito,
      email,
    };
  }).filter(r => r.nome_azienda).slice(0, 3);
}

async function cerca(numero: string) {
  for (const indirizzo of FONTI) {
    try {
      const risposta = await fetch(indirizzo(numero), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
          'Accept-Language': 'it-IT,it;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!risposta.ok) continue;
      const risultati = leggiRisultati(await risposta.text());
      if (risultati.length) return risultati;
    } catch (_) { /* proviamo la fonte successiva */ }
  }
  return [];
}

// Stesso controllo delle tabelle: con i dati di accesso di chi chiama, il database risponde true solo ai membri
async function eMembro(richiesta: Request) {
  try {
    const risposta = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/e_membro`, {
      method: 'POST',
      headers: {
        apikey: richiesta.headers.get('apikey') ?? '',
        Authorization: richiesta.headers.get('Authorization') ?? '',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    return risposta.ok && (await risposta.json()) === true;
  } catch (_) {
    return false;
  }
}

Deno.serve(async (richiesta: Request) => {
  if (richiesta.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!(await eMembro(richiesta))) {
    return Response.json({ risultati: [], errore: 'Serve l\'accesso' }, { status: 401, headers: CORS });
  }
  let numero = '';
  try { numero = String((await richiesta.json()).telefono || ''); } catch (_) { /* corpo vuoto */ }
  numero = numero.replace(/[^\d+]/g, '').replace(/^(\+|00)39/, '');
  if (!/^\d{6,11}$/.test(numero)) {
    return Response.json({ risultati: [] }, { headers: CORS });
  }
  return Response.json({ risultati: await cerca(numero) }, { headers: CORS });
});
