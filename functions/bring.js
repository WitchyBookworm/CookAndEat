// Erzeugt eine Rezeptseite nach schema.org/Recipe, die der offizielle
// Bring!-Import einlesen kann. Jede offene Position wird zu einer Zutat.
// Doku: https://sites.google.com/getbring.com/bring-import-dev-guide/web-to-app-integration

export const GUELTIG_TAGE = 7;
export const BRING_DEEPLINK = 'https://api.getbring.com/rest/bringrecipes/deeplink';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const zahl = (m) => String(m).replace('.', ',');

export function zutatText(p) {
  return `${zahl(p.menge)} ${p.einheit} ${p.name}`.trim();
}

/** @param {{titel: string, positionen: Array<{name, menge, einheit}>}} exportDoc */
export function renderBringSeite(exportDoc) {
  const zutaten = exportDoc.positionen.map(zutatText);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: exportDoc.titel,
    recipeYield: '1',
    recipeIngredient: zutaten,
  };
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(exportDoc.titel)}</title>
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body>
<div itemscope itemtype="http://schema.org/Recipe">
<h1 itemprop="name">${esc(exportDoc.titel)}</h1>
<meta itemprop="recipeYield" content="1">
<ul>
${zutaten.map((z) => `<li itemprop="recipeIngredient ingredients">${esc(z)}</li>`).join('\n')}
</ul>
</div>
</body>
</html>`;
}

export function bringLink(seitenUrl) {
  const q = new URLSearchParams({ url: seitenUrl, source: 'web', baseQuantity: '1', requestedQuantity: '1' });
  return `${BRING_DEEPLINK}?${q}`;
}

export function abgelaufen(erstelltMs, jetztMs = Date.now()) {
  return jetztMs - erstelltMs > GUELTIG_TAGE * 86400000;
}
