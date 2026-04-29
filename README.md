# 🐔 FermeTrack — Guide de Déploiement Complet

Application web PWA de gestion avicole — Togo  
Stack : React + Vite + Supabase + Vercel

---

## ÉTAPE 1 — Créer votre projet Supabase

1. Allez sur https://supabase.com et créez un compte gratuit
2. Cliquez **New Project**
3. Donnez un nom : `fermetrack`
4. Choisissez un mot de passe fort pour la base de données
5. Région : choisissez **West EU (Ireland)** ou la plus proche disponible
6. Cliquez **Create new project** — attendez ~2 minutes

### Récupérer vos clés API

Dans votre projet Supabase :
- Allez dans **Project Settings** (icône engrenage) → **API**
- Copiez `Project URL` → c'est votre `VITE_SUPABASE_URL`
- Copiez `anon` `public` key → c'est votre `VITE_SUPABASE_ANON_KEY`

---

## ÉTAPE 2 — Créer la base de données

1. Dans Supabase, allez dans **SQL Editor** (icône base de données)
2. Cliquez **New query**
3. Copiez-collez **tout le contenu** du fichier `supabase_schema.sql`
4. Cliquez **Run** (ou Ctrl+Entrée)
5. Vérifiez qu'il n'y a pas d'erreur rouge en bas

### Configurer le Storage (pour les photos)

1. Dans Supabase, allez dans **Storage**
2. Cliquez **New bucket**
3. Nom : `photos`
4. Cochez **Public bucket** ✓
5. Cliquez **Save**

### Créer votre premier utilisateur admin

1. Dans Supabase, allez dans **Authentication** → **Users**
2. Cliquez **Add user** → **Create new user**
3. Entrez votre email et mot de passe
4. Notez l'UUID généré (ex: `a1b2c3d4-...`)
5. Allez dans **SQL Editor** et exécutez :

```sql
INSERT INTO profils (id, nom, prenom, email, role, actif)
VALUES (
  'VOTRE-UUID-ICI',        -- remplacez par l'UUID copié
  'VOTRE_NOM',
  'VOTRE_PRENOM',
  'votre@email.com',
  'admin',
  true
);
```

---

## ÉTAPE 3 — Configurer les notifications push (optionnel)

### Générer les clés VAPID

```bash
npx web-push generate-vapid-keys
```

Cela affiche :
```
Public Key: BNxxxxxxxx...
Private Key: xxxxxxxxx...
```

Gardez la **Public Key** pour le frontend (`.env`).  
La **Private Key** est pour un backend serveur si vous ajoutez l'envoi de push côté serveur plus tard.

---

## ÉTAPE 4 — Configuration locale

### Installer les dépendances

Vous devez avoir Node.js 18+ installé.

```bash
cd ferme-app
npm install
```

### Créer votre fichier .env

```bash
cp .env.example .env
```

Éditez `.env` avec vos vraies valeurs :
```
VITE_SUPABASE_URL=https://VOTRE-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_VAPID_PUBLIC_KEY=BNxxxxxxxx...  (optionnel)
```

### Lancer en développement

```bash
npm run dev
```

Ouvrez http://localhost:5173 — connectez-vous avec les identifiants créés à l'étape 2.

---

## ÉTAPE 5 — Déployer sur Vercel

### Méthode recommandée : Via GitHub

1. Poussez votre code sur GitHub :
```bash
git init
git add .
git commit -m "Initial FermeTrack"
git remote add origin https://github.com/VOUS/ferme-app.git
git push -u origin main
```

2. Allez sur https://vercel.com et connectez-vous avec GitHub
3. Cliquez **Add New** → **Project**
4. Sélectionnez votre repo `ferme-app`
5. Dans **Environment Variables**, ajoutez :
   - `VITE_SUPABASE_URL` = votre URL Supabase
   - `VITE_SUPABASE_ANON_KEY` = votre clé anon
   - `VITE_VAPID_PUBLIC_KEY` = votre clé VAPID (si utilisée)
6. Cliquez **Deploy**

Vercel vous donne une URL comme : `https://ferme-app-xyz.vercel.app`

### Méthode directe : Via CLI Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

Répondez aux questions et entrez vos variables d'environnement quand demandé.

---

## ÉTAPE 6 — Installer l'app sur mobile (PWA)

### Sur Android (Chrome)
1. Ouvrez votre URL Vercel dans Chrome
2. Un bandeau apparaît en bas : **"Installer FermeTrack"**
3. Ou : menu Chrome → **Ajouter à l'écran d'accueil**
4. L'app apparaît sur votre écran comme une vraie app

### Sur iPhone (Safari)
1. Ouvrez votre URL dans Safari
2. Appuyez sur l'icône **Partager** (carré avec flèche)
3. Sélectionnez **Sur l'écran d'accueil**
4. Confirmez

---

## ÉTAPE 7 — Ajouter les icônes PWA

Créez deux images PNG :
- `public/pwa-192x192.png` — 192×192 pixels (logo de l'app)
- `public/pwa-512x512.png` — 512×512 pixels (logo haute résolution)

Vous pouvez utiliser n'importe quel outil (Canva, GIMP, etc.) avec l'emoji 🐔 ou votre logo de ferme.

---

## Résumé des URLs importantes

| Service | URL |
|---------|-----|
| Votre app | https://ferme-app-xyz.vercel.app |
| Tableau de bord Supabase | https://app.supabase.com |
| Logs et erreurs | Vercel Dashboard → Functions |
| Données brutes | Supabase → Table Editor |

---

## Problèmes fréquents

**L'app ne se connecte pas**
→ Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans Vercel

**"Profil introuvable" après login**
→ L'utilisateur existe dans Auth mais pas dans la table `profils` — relancez le SQL d'insertion du profil

**Photos ne se sauvegardent pas**
→ Vérifiez que le bucket `photos` est bien **public** dans Supabase Storage

**Notifications push ne fonctionnent pas**
→ Vérifiez VITE_VAPID_PUBLIC_KEY — sans cette clé les notifs locales fonctionnent quand l'app est ouverte, mais pas les push en arrière-plan

**Build échoue sur Vercel**
→ Vérifiez que Node.js est en version 18+ dans les settings Vercel (Settings → General → Node.js Version)

---

## Sécurité — points importants

- Ne committez JAMAIS votre fichier `.env` sur Git
- Le `.gitignore` doit contenir `.env`
- La clé `anon` Supabase est publique (c'est normal) — les RLS protègent les données
- Changez les mots de passe régulièrement
- Activez l'authentification 2FA sur votre compte Supabase

---

*FermeTrack v1.0 — Développé pour la filière avicole togolaise*
