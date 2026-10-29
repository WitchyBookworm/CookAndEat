// Cloud Function: liefert unter /bring/{token} die Einkaufsliste als
// Rezeptseite für den Bring!-Import. Der Token ist zufällig (nicht erratbar),
// das Export-Dokument wird nach 7 Tagen nicht mehr ausgeliefert.
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { renderBringSeite, abgelaufen } from './bring.js';

initializeApp();
const db = getFirestore();

export const bring = onRequest({ region: 'europe-west3' }, async (req, res) => {
  const token = req.path.split('/').filter(Boolean).pop()?.replace(/\.html$/, '');
  if (!token || !/^[A-Za-z0-9_-]{20,}$/.test(token)) return res.status(404).send('Nicht gefunden');
  const snap = await db.collection('bringExporte').doc(token).get();
  if (!snap.exists || abgelaufen(snap.data().erstellt.toMillis())) return res.status(404).send('Nicht gefunden oder abgelaufen');
  res.set('Cache-Control', 'private, max-age=60');
  res.type('html').send(renderBringSeite(snap.data()));
});
