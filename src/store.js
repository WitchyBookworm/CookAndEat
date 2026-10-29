// Datenhaltung mit einheitlicher Schnittstelle:
//   get(key) · set(key, wert) · patch(key, feldpfad, wert) · watch(key, callback)
// Schlüssel sind z. B. "mitglieder", "plan_2026-11", "liste_2026-11-02".
// LocalStore speichert im Browser (Demo, ohne Teilen); FirebaseStore legt jeden
// Schlüssel als Dokument unter haushalte/{id}/daten/{key} ab und synchronisiert live.

import { firebaseConfig } from './firebase-config.js';

const FIREBASE_VERSION = '10.12.2';
const fb = (modul) => import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-${modul}.js`);

function setzePfad(obj, pfad, wert) {
  const teile = pfad.split('.');
  let o = obj;
  for (const t of teile.slice(0, -1)) o = o[t] ??= {};
  o[teile.at(-1)] = wert;
}

export class LocalStore {
  constructor(prefix = 'cookandeat:') {
    this.prefix = prefix;
    this.beobachter = new Map();
    this.modus = 'lokal';
    // Änderungen aus anderen Tabs übernehmen
    window.addEventListener('storage', (e) => {
      if (!e.key?.startsWith(this.prefix)) return;
      const key = e.key.slice(this.prefix.length);
      this.#melde(key, e.newValue ? JSON.parse(e.newValue) : null);
    });
  }

  async init() {
    return { angemeldet: true, haushaltId: 'lokal', benutzer: null };
  }

  async get(key) {
    try {
      const roh = localStorage.getItem(this.prefix + key);
      return roh ? JSON.parse(roh) : null;
    } catch {
      return null;
    }
  }

  async set(key, wert) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(wert));
    } catch (e) {
      console.error('Speichern fehlgeschlagen', e);
    }
    this.#melde(key, wert);
  }

  async patch(key, pfad, wert) {
    const doc = (await this.get(key)) ?? {};
    setzePfad(doc, pfad, wert);
    await this.set(key, doc);
  }

  watch(key, callback) {
    const liste = this.beobachter.get(key) ?? new Set();
    liste.add(callback);
    this.beobachter.set(key, liste);
    this.get(key).then(callback);
    return () => liste.delete(callback);
  }

  #melde(key, wert) {
    this.beobachter.get(key)?.forEach((cb) => cb(wert));
  }
}

export class FirebaseStore {
  constructor(config) {
    this.config = config;
    this.modus = 'firebase';
    this.haushaltId = null;
  }

  async init() {
    const [{ initializeApp }, auth, fs] = await Promise.all([fb('app'), fb('auth'), fb('firestore')]);
    this.authMod = auth;
    this.fs = fs;
    const app = initializeApp(this.config);
    this.auth = auth.getAuth(app);
    this.db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });

    const benutzer = await new Promise((resolve) => {
      const stop = auth.onAuthStateChanged(this.auth, (u) => {
        stop();
        resolve(u);
      });
    });
    if (!benutzer) return { angemeldet: false };
    this.benutzer = benutzer;
    const profil = await fs.getDoc(fs.doc(this.db, 'benutzer', benutzer.uid));
    this.haushaltId = profil.exists() ? profil.data().haushaltId : null;
    return { angemeldet: true, haushaltId: this.haushaltId, benutzer };
  }

  async anmelden() {
    const provider = new this.authMod.GoogleAuthProvider();
    await this.authMod.signInWithPopup(this.auth, provider);
  }

  async abmelden() {
    await this.authMod.signOut(this.auth);
  }

  async haushaltAnlegen(name) {
    const { fs, db, benutzer } = this;
    const ref = await fs.addDoc(fs.collection(db, 'haushalte'), { name, mitgliederUids: [benutzer.uid], erstellt: fs.serverTimestamp() });
    await fs.setDoc(fs.doc(db, 'benutzer', benutzer.uid), { haushaltId: ref.id });
    this.haushaltId = ref.id;
    return ref.id;
  }

  // Der Einladungscode ist die Haushalts-ID; die Sicherheitsregeln erlauben
  // nur, die eigene UID zur Mitgliederliste hinzuzufügen.
  async haushaltBeitreten(code) {
    const { fs, db, benutzer } = this;
    await fs.updateDoc(fs.doc(db, 'haushalte', code.trim()), { mitgliederUids: fs.arrayUnion(benutzer.uid) });
    await fs.setDoc(fs.doc(db, 'benutzer', benutzer.uid), { haushaltId: code.trim() });
    this.haushaltId = code.trim();
  }

  #ref(key) {
    return this.fs.doc(this.db, 'haushalte', this.haushaltId, 'daten', key);
  }

  async get(key) {
    const snap = await this.fs.getDoc(this.#ref(key));
    return snap.exists() ? snap.data().wert : null;
  }

  async set(key, wert) {
    await this.fs.setDoc(this.#ref(key), { wert });
  }

  async patch(key, pfad, wert) {
    await this.fs.updateDoc(this.#ref(key), { [`wert.${pfad}`]: wert });
  }

  watch(key, callback) {
    return this.fs.onSnapshot(this.#ref(key), (snap) => callback(snap.exists() ? snap.data().wert : null));
  }
}

export function erzeugeStore() {
  return firebaseConfig ? new FirebaseStore(firebaseConfig) : new LocalStore();
}
