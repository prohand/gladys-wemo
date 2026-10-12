# Wemo

Pilotez vos appareils **Belkin Wemo** depuis Gladys, en **réseau local** : pas de
compte, pas de cloud. Belkin a arrêté son cloud Wemo le 31 janvier 2026 ; le
pilotage local, celui qu'utilise cette intégration, continue de fonctionner.

## Appareils pris en charge

| Appareil                 | Dans Gladys                                       |
| ------------------------ | ------------------------------------------------- |
| Wemo Switch, Wemo Mini   | Interrupteur marche/arrêt                         |
| Wemo Light Switch, 3-Way | Lumière marche/arrêt                              |
| Wemo Dimmer              | Lumière marche/arrêt + luminosité (%)             |
| Wemo Insight             | Marche/arrêt + puissance (W) + énergie (kWh)      |
| Wemo Motion              | Détecteur de mouvement                            |
| Wemo Maker               | Relais + entrée (capteur d'ouverture, 1 = fermée) |

Non pris en charge : le pont Wemo Link (et ses ampoules) et les appareils
électroménagers Wemo (cafetière, mijoteuse, humidificateur…). Les modèles les
plus récents, prévus pour HomeKit seulement (Thread), ne parlent pas le
protocole Wemo local.

## Installation

1. Installez l'intégration **Wemo** depuis le catalogue de Gladys (Gladys 5.1
   ou plus récent). L'écran d'installation indique qu'elle demande une
   **recherche réseau SSDP** : c'est ainsi que Gladys trouve les Wemo pour elle.
2. Ouvrez l'onglet **Découverte** de l'intégration : les Wemo de votre réseau
   apparaissent. Ajoutez ceux que vous voulez.
3. C'est tout : leur état s'affiche dans Gladys et vous pouvez les piloter.

Les Wemo doivent déjà être connectés à votre Wi-Fi (configurés auparavant avec
l'application Wemo, ou remis en Wi-Fi avec un outil comme `pywemo`).

## Configuration

- **Adresses des Wemo** — facultatif. Si un Wemo n'est pas trouvé
  automatiquement (autre VLAN, Wi-Fi maillé qui filtre le multicast), saisissez
  son adresse IP ici, séparée des autres par des virgules. Le port est
  facultatif (`192.168.1.20:49153`) : sans lui, les ports Wemo habituels
  (49152 à 49156) sont essayés. Donnez une **adresse IP fixe** (bail DHCP
  réservé) à ces Wemo.
- **Intervalle de rafraîchissement** — tous les combien de secondes les prises,
  interrupteurs et variateurs sont lus (10 s par défaut). Un changement fait
  depuis le bouton du Wemo apparaît dans Gladys dans ce délai.
- **Intervalle des détecteurs** — tous les combien de secondes les détecteurs
  de mouvement sont lus (2 s par défaut) : c'est le délai avant qu'une scène
  démarre sur un mouvement.
- **Retrouver un Wemo silencieux** — quand un Wemo ne répond plus, relancer
  une recherche réseau pour le retrouver s'il a changé d'adresse IP (au plus
  une fois toutes les cinq minutes).

Un Wemo change souvent de **port** après un redémarrage : l'intégration le
retrouve seule sur ses autres ports, en vérifiant son numéro de série.

## Boutons de l'écran de configuration

- **Rechercher les Wemo** — lance la recherche et liste ce qui a été trouvé
  (et ce qui ne l'est pas : adresse muette, appareil non pris en charge).
- **Tester la connexion** — lit chaque Wemo ajouté à Gladys et indique s'il
  répond, avec son état ou l'erreur.

## Badge local / injoignable

Chaque appareil affiche un badge : **local** quand il répond, **injoignable**
après trois lectures sans réponse. L'écran de configuration indique « Aucun
Wemo ne répond » quand plus aucun ne répond.

## Scènes

Dans l'éditeur de scènes (catégorie **Intégrations**) :

**Déclencheurs**

- **Mouvement détecté (Wemo)** — un Wemo Motion voit un mouvement (une fois
  par détection). Variable : `{{triggerEvent.data.device_name}}`.
- **État d'un Wemo Insight changé** — un Insight s'allume, passe **en veille**
  (l'appareil branché a fini : machine à laver, lave-vaisselle…) ou s'éteint.
  Filtrez sur le nouvel état. Variables : `state` (`on`, `standby`, `off`),
  `power` (W), `device_name`. Le seuil de veille se règle dans l'application
  Wemo.
- **Wemo joignable ou non** — un Wemo ne répond plus, ou répond à nouveau.
  Variables : `status` (`offline`, `online`), `device_name`.

Pour un simple marche/arrêt, utilisez le déclencheur standard « Changement
d'état d'un appareil » de Gladys.

**Actions**

- **Basculer un Wemo** — éteint un Wemo allumé, allume un Wemo éteint. Sorties :
  `toggled` (faux si l'appareil n'a pas de relais), `is_on`.
- **Lire un Wemo Insight** — sorties : `reachable`, `state`, `power` (W),
  `today_energy` (kWh), à tester dans les conditions suivantes.
- **Rechercher les Wemo** — sortie : `found` (nombre de Wemo trouvés).

## Tableau de bord

- **Appareils Wemo** — tous vos Wemo d'un coup d'œil : combien répondent, ce
  que fait chacun (les injoignables en premier), la puissance totale des
  Insight, et un bouton **Chercher les Wemo**.
- **Wemo Insight** — choisissez un Insight dans les réglages du widget :
  puissance et énergie en direct, consommation et durée de marche du jour,
  courbe de puissance sur 24 h et bouton marche/arrêt.

## Dépannage

- **Aucun Wemo trouvé** : vérifiez qu'ils sont sur le même réseau que la
  machine Gladys. Sinon, saisissez leur adresse dans « Adresses des Wemo ».
- **« Recherche automatique indisponible »** : votre Gladys est trop ancien
  pour la recherche réseau, ou l'autorisation SSDP a été refusée à
  l'installation. Les adresses saisies à la main fonctionnent quand même.
- **Un Wemo passe injoignable de temps en temps** : son Wi-Fi est faible, ou
  il a changé d'adresse. Réservez-lui une adresse IP fixe dans votre box.
- **Logs** : depuis l'interface Gladys (ou `docker logs`), avec
  `LOG_LEVEL=debug` pour le détail de chaque lecture.
