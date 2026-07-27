# Central Browser

Un navigateur web multifonction, construit avec Electron.

## Fonctionnalités

- Onglets multiples avec rétrécissement automatique (jamais de scroll)
- Barre de titre custom (réduire/agrandir/fermer intégrés à droite des onglets)
- Navigation Précédent/Suivant/Actualiser/Stop/Accueil + barre d'adresse intelligente
- Favoris (étoile rapide + panneau complet avec recherche)
- Historique groupé par période (Aujourd'hui/Hier/Cette semaine/Plus ancien) + recherche
- Téléchargements avec progression en direct
- Nouvelle fenêtre et Navigation privée (session non persistée, thème distinct)
- Recherche dans la page, zoom, impression
- Gestionnaire de mots de passe local (détection, sauvegarde chiffrée, autofill)
- Compte Google (session persistante réelle → SSO "Se connecter avec Google" fonctionne)
- **Traducteur de page** intégré (MyMemory gratuit ou Google Cloud Translate)
- **Gestion des cookies** : navigateur de cookies par domaine + blocage des cookies tiers
- **Visionneuse PDF premium** : moteur pdf.js de Mozilla embarqué (celui de Firefox) —
  défilement continu, recherche, zoom, impression, rotation, miniatures de pages
- **Lecteur vidéo** façon VLC : playlist avec miniatures, historique de lecture, reprise
  automatique à la dernière position, Précédent/Suivant, lecture automatique de la vidéo
  suivante, prise en charge de MKV/AVI/FLV/WMV via FFmpeg
- **Lecteur audio** avec playlist et historique (même logique que le lecteur vidéo)
- **Gestionnaire PDF** : organiser, fusionner, compresser, scinder, modifier (filigrane/texte,
  pages blanches) et convertir des PDF (Word/Excel/HTML ↔ PDF)
- **Transfert de fichiers** façon Xender : détection des appareils sur le même Wi-Fi,
  appairage avec code de confirmation, envoi ultra-rapide de fichiers/dossiers en HTTP direct
  (aucune donnée ne passe par Internet), historique et suivi de progression

## Détails sur les lecteurs vidéo et audio

Les deux lecteurs (menu ⋮ → Applications → "Lecteur vidéo" / "Lecteur audio") s'ouvrent
sur un espace « playlist / historique » dans une barre latérale, avec le lecteur à gauche :

- **Playlist** : bouton "➕ Ajouter" (sélection multiple) ou glisser-déposer directement
  sur la fenêtre. Réorganisable par glisser-déposer dans la liste. Chaque élément vidéo
  affiche une **miniature** générée automatiquement (via FFmpeg).
- **Précédent / Suivant** + **lecture automatique** de l'élément suivant en fin de
  lecture (bouton 🔗 pour désactiver). Le bouton 🔁 boucle uniquement l'élément courant.
- **Historique** : chaque fichier lu apparaît avec la date relative et la progression ;
  clic pour relire, ✕ pour retirer, "Effacer l'historique" pour tout vider.
- **Reprise automatique** : la position de lecture est sauvegardée régulièrement (et à
  la fermeture) ; en rouvrant un fichier déjà commencé, la lecture reprend où elle en
  était (sauf si on est tout au début ou presque à la fin).
- **Formats étendus (MKV, AVI, FLV, WMV)** : ces conteneurs ne sont pas lus nativement
  par Chromium. Le lecteur vidéo les fait passer par **FFmpeg** (binaire embarqué via le
  paquet `ffmpeg-static`, aucune installation séparée requise) : remuxage rapide sans
  ré-encodage quand c'est possible, sinon ré-encodage complet en secours (plus lent sur
  de gros fichiers — un écran "Conversion en cours…" s'affiche). Le résultat est mis en
  cache dans le dossier de données de l'appli pour ne pas reconvertir à chaque lecture.

## Détails sur les 3 fonctionnalités précédentes

### 1. Traducteur de page
Bouton 🌐 dans la barre d'outils. Choisis une langue cible : le texte visible de la page
est extrait, envoyé au service de traduction choisi, puis réinjecté dans la page.
- **Par défaut : MyMemory**, gratuit, sans clé, mais limité à environ **5000 caractères/jour**
  par IP (les grosses pages peuvent ne pas être traduites en entier — un message te le
  signale). Tu peux ajouter ton e-mail dans Paramètres → Traduction pour multiplier ce
  quota par 10.
- **Alternative : Google Cloud Translate**, illimité mais payant et nécessite une clé API
  que tu crées toi-même sur https://console.cloud.google.com (API "Cloud Translation").
- Bouton "Afficher la page originale" pour annuler la traduction sur l'onglet courant.

### 2. Gestion des cookies
Menu ⋮ → "Gestion des cookies" (ou Paramètres → Cookies → "Gérer les cookies") :
- Liste tous les cookies de la session active, regroupés par domaine
- Suppression par domaine ou suppression globale
- Case "Bloquer les cookies tiers" : bloque réellement l'envoi/la réception de cookies
  pour les requêtes dont le domaine diffère de celui affiché dans l'onglet (même principe
  que le blocage tiers de Chrome/Firefox)

### 3. Visionneuse PDF premium
Tout lien ou toute adresse se terminant par `.pdf` est automatiquement ouvert dans le
vrai moteur **pdf.js** de Mozilla (celui utilisé par Firefox), embarqué localement dans
l'app — pas une simple prévisualisation basique. Fonctionnalités incluses : défilement
continu, panneau de miniatures, recherche dans le document, zoom, rotation, impression,
téléchargement. Les fichiers de plus de 45 Mo sont ouverts normalement (au-delà, le
chargement en mémoire devient trop lourd).

## Détails sur le Gestionnaire PDF

Menu ⋮ → Applications → "Gestionnaire PDF" (ou tuile "Gestionnaire PDF" sur l'onglet
Accueil) ouvre une fenêtre dédiée, module séparé comme `players/`, avec 6 outils dans
la barre latérale :

- **Organiser** : réordonne les pages par glisser-déposer, fais-les pivoter par 90°,
  supprime-en, puis enregistre un nouveau PDF.
- **Fusionner** : combine plusieurs PDF en un seul, dans l'ordre choisi.
- **Compresser** : 3 niveaux (léger/standard/fort). Utilise **Ghostscript** s'il est
  installé sur le PC pour une vraie compression des images ; sinon, repli automatique
  sur une compression plus légère via `pdf-lib` (aucune installation requise, mais gain
  plus modeste — un message te le signale).
- **Scinder** : plages personnalisées (`1-3,5,7-9`), toutes les N pages, ou une page
  par fichier — les fichiers sont créés dans le dossier de ton choix.
- **Modifier** : ajoute un texte/filigrane (taille, couleur, opacité, rotation,
  position, pages ciblées) ou insère des pages blanches à un endroit précis.
- **Convertir** : Word ↔ PDF, Excel ↔ PDF, HTML ↔ PDF.
  - **HTML → PDF** fonctionne nativement (moteur d'impression PDF d'Electron/Chromium),
    aucune installation requise.
  - **Word ↔ PDF**, **Excel ↔ PDF** et **PDF → HTML** nécessitent **LibreOffice**
    (gratuit) installé sur le PC : https://www.libreoffice.org/download — le
    Gestionnaire PDF le détecte automatiquement (voir le petit indicateur en bas de la
    barre latérale) et affiche un message clair s'il est absent.

Tout le moteur PDF (fusion, scission, organisation, filigrane, pages blanches, et le
repli de compression) repose sur `pdf-lib`, ajouté à `package.json` : pense à lancer
`npm install` après avoir récupéré ces fichiers si le dossier `node_modules` ne l'a pas
déjà.

## Détails sur le Transfert de fichiers (réseau local, façon Xender)

Menu ⋮ → Applications → « Transfert de fichiers » ouvre une fenêtre dédiée, module séparé
(`file-transfer/`, comme `players/` et `pdf-manager/`) — **aucune dépendance npm
supplémentaire**, tout repose sur les modules natifs de Node (`http`, `dgram`).

- **Détection automatique** : dès que l'appli est lancée, chaque appareil diffuse sa
  présence en UDP (broadcast) sur le réseau local et écoute celle des autres. Les deux
  appareils doivent simplement être connectés au **même réseau Wi-Fi** — aucune inscription,
  aucun compte, **aucune donnée ne transite par Internet**.
- **Connexion manuelle par IP** : si le broadcast est filtré (certains hotspots mobiles ou
  réseaux d'entreprise avec « isolation des clients »), un bouton « Connexion manuelle »
  permet de saisir directement l'adresse IP et le port affichés sur l'autre appareil.
- **Appairage** : bouton « Appairer » sur une carte d'appareil → l'autre appareil voit une
  demande avec un **code à 4 chiffres affiché des deux côtés** (repère visuel simple, comme
  un appairage Bluetooth) et Accepte/Refuse. Une fois appairé, l'appareil peut être renommé
  et configuré en « auto-accepter » (Paramètres) pour recevoir sans confirmation à chaque fois.
- **Envoi** : bouton « Envoyer des fichiers » (ou glisser-déposer sur la fenêtre, ou
  directement sur la carte d'un appareil) → sélection de fichiers **ou de dossiers entiers**
  (structure préservée) → l'autre appareil reçoit un aperçu (liste des fichiers + taille
  totale) et Accepte/Refuse avant que quoi que ce soit ne soit transféré.
- **Transfert ultra-rapide** : les fichiers sont streamés en HTTP brut entre les deux
  appareils (pas de multipart, pas d'encodage base64, pas de serveur intermédiaire) — la
  vitesse n'est limitée que par le réseau Wi-Fi local.
- **Suivi en temps réel** : progression, vitesse (Mo/s) par transfert, annulation en un clic.
- **Historique** : liste des envois/réceptions (date, appareil, taille, statut), avec accès
  direct au dossier de réception. Dossier de réception personnalisable dans Paramètres
  (par défaut : `Téléchargements/Transferts reçus/<nom de l'expéditeur>/`).

**Pare-feu Windows** : au premier lancement, Windows peut demander d'autoriser l'application
sur les réseaux privés (« Autoriser l'accès ») — nécessaire pour que la détection et la
réception fonctionnent.

**Limites connues** : pas de reprise après une coupure réseau en cours de transfert (à
relancer), et le chiffrement du canal n'est pas implémenté (comme Xender, le trafic reste en
clair sur le réseau local — à réserver à des réseaux Wi-Fi de confiance).

## 1. Tester le navigateur sur ton PC

Il te faut **Node.js** (version 18+) : https://nodejs.org

```bash
npm install
npm start
```

`npm install` télécharge aussi le binaire **FFmpeg** (via le paquet `ffmpeg-static`,
~80 Mo selon l'OS) utilisé par le lecteur vidéo pour lire les formats MKV/AVI/FLV/WMV
et générer les miniatures de la playlist — une connexion internet est donc nécessaire
lors de cette étape, mais aucune installation manuelle de FFmpeg n'est requise.

## 2. Créer le setup .exe pour Windows

```bash
npm install
npm run dist:win
```

Résultat dans `dist/` : **`Central Browser Setup 1.0.0.exe`** (installeur NSIS).

Le dossier `pdfjs/` (~8 Mo, moteur PDF) est inclus automatiquement dans le build grâce à
la config `files` de `package.json` — pas besoin de le manipuler manuellement.

Ajoute une icône dans `build/icon.ico` (256x256) si tu veux personnaliser l'icône.

## Raccourcis clavier
| Action | Raccourci |
|---|---|
| Nouvel onglet | Ctrl+T |
| Fermer l'onglet | Ctrl+W |
| Nouvelle fenêtre | Ctrl+N |
| Navigation privée | Ctrl+Shift+N |
| Barre d'adresse | Ctrl+L |
| Actualiser | Ctrl+R |
| Rechercher dans la page | Ctrl+F |
| Téléchargements | Ctrl+J |
| Favoris | Ctrl+Shift+O |
| Imprimer | Ctrl+P |
| Zoom +/-/Reset | Ctrl+ / Ctrl- / Ctrl+0 |
| Onglet suivant/précédent | Ctrl+Tab / Ctrl+Shift+Tab |

Dans les lecteurs vidéo/audio : **Espace** (lecture/pause), **N** (suivant),
**B** (précédent), **M** (muet), **←/→** (±5s), **F** (plein écran, vidéo),
**P** (image dans l'image, vidéo).

## Structure du projet

```
central-browser/
├── main.js              → processus principal (fenêtres, IPC, stockage, téléchargements,
│                           traduction, cookies, redirection PDF, playlists/historique média,
│                           conversion FFmpeg)
├── preload.js             → API exposée à la fenêtre principale
├── webview-preload.js       → injecté dans chaque page visitée (mots de passe)
├── pdfjs/                     → moteur PDF.js de Mozilla embarqué (visionneuse premium)
├── players/                     → lecteurs vidéo et audio (playlist, historique, reprise)
│   ├── video/                     → video-player.html/js/css
│   └── audio/                       → audio-player.html/js/css
├── pdf-manager/                   → Gestionnaire PDF (module séparé, comme players/)
│   ├── pdf-manager.html             → interface (organiser/fusionner/compresser/scinder/
│   │                                   modifier/convertir)
│   ├── pdf-manager.css
│   └── pdf-manager.js
├── index.html                       → interface (onglets, panneaux, menus)
├── styles.css                         → apparence façon Chrome + mode incognito
├── renderer.js                          → toute la logique front
└── package.json                           → config npm + electron-builder
```

Les données (favoris, historique, mots de passe chiffrés, réglages, téléchargements,
playlists vidéo/audio, historique de lecture) sont stockées dans
`%APPDATA%/central-browser/browser-data.json` sous Windows. Les vidéos converties par
FFmpeg et les miniatures sont mises en cache dans `%APPDATA%/central-browser/media-cache/`
et `%APPDATA%/central-browser/thumbnails/`.

## Limites connues (transparence)
- Pas de vraie synchronisation multi-appareils façon Chrome (infrastructure Google privée,
  non accessible aux navigateurs tiers) — voir la note dans les réglages du compte.
- Le blocage des cookies tiers est une heuristique par domaine (comme le "SmartBlock"
  historique des navigateurs), pas le mécanisme exact propriétaire de Chrome.
- MyMemory (traduction gratuite) a un quota quotidien bas ; les très longues pages peuvent
  être partiellement traduites.
- La conversion FFmpeg des formats MKV/AVI/FLV/WMV se fait à la demande (pas de file
  d'attente ni de barre de progression détaillée) ; sur un gros fichier nécessitant un
  ré-encodage complet (codec non copiable tel quel), cela peut prendre du temps avant que
  la lecture démarre.
- Gestionnaire PDF : les conversions Word/Excel et PDF → HTML dépendent de LibreOffice
  (non embarqué, à installer séparément) ; sans lui, seule la conversion HTML → PDF
  reste disponible (moteur natif Electron). La compression sans Ghostscript reste
  fonctionnelle mais avec un gain de taille plus faible.
