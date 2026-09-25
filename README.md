# Phantom Cam 👻🐆

Application caméra façon Snapchat (uniquement l'onglet caméra), en thème rose façon Snap+.

## Fonctionnalités

- Caméra plein écran (avant/arrière)
- Double-tap sur l'écran pour retourner la caméra (comme Snapchat)
- Bouton de capture : appui court = photo, appui long = vidéo
- Bord de l'écran qui s'illumine en rose pendant l'enregistrement (comme Snap+)
- Souvenirs : galerie locale des photos/vidéos capturées, stockée sur l'appareil (IndexedDB)
- Thème rose, icône fantôme léopard
- Installable sur l'écran d'accueil (PWA)

## Utilisation sur mobile

Ouvre le site déployé dans Safari (iPhone) ou Chrome (Android), puis :

- **iPhone** : bouton Partager → "Sur l'écran d'accueil"
- **Android** : menu ⋮ → "Ajouter à l'écran d'accueil" / "Installer l'application"

La caméra nécessite une connexion **https://** (ou localhost) pour fonctionner — c'est le cas une fois déployé sur GitHub Pages.

## Développement local

```bash
python3 -m http.server 8123
```

Puis ouvrir `http://localhost:8123` sur le même appareil que la caméra à tester.

## Stack

Aucune dépendance : HTML/CSS/JS natif (getUserMedia, MediaRecorder, IndexedDB). Aucune build step.
