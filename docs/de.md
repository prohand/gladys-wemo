# Wemo

Steuere deine **Belkin-Wemo**-Geräte über Gladys, in deinem **lokalen
Netzwerk**: kein Konto, keine Cloud. Belkin hat seine Wemo-Cloud am 31. Januar
2026 abgeschaltet; die lokale Steuerung, die diese Integration nutzt,
funktioniert weiterhin.

## Unterstützte Geräte

| Gerät                    | In Gladys                                          |
| ------------------------ | -------------------------------------------------- |
| Wemo Switch, Wemo Mini   | Ein/Aus-Schalter                                   |
| Wemo Light Switch, 3-Way | Licht ein/aus                                      |
| Wemo Dimmer              | Licht ein/aus + Helligkeit (%)                     |
| Wemo Insight             | Ein/Aus + Leistung (W) + Energie (kWh)             |
| Wemo Motion              | Bewegungsmelder                                    |
| Wemo Maker               | Relais + Eingang (Öffnungssensor, 1 = geschlossen) |

Nicht unterstützt: die Wemo-Link-Bridge (und ihre Lampen) und die
Wemo-Haushaltsgeräte (Kaffeemaschine, Slow Cooker, Luftbefeuchter…). Die
neuesten Modelle, die nur für HomeKit (Thread) gedacht sind, sprechen das lokale
Wemo-Protokoll nicht.

## Installation

1. Installiere die Integration **Wemo** aus dem Gladys-Katalog (Gladys 5.3
   oder neuer). Der Installationsbildschirm zeigt, dass sie eine
   **SSDP-Netzwerksuche** anfordert: So findet Gladys die Wemo-Geräte für sie.
2. Öffne den Tab **Entdecken** der Integration: Die Wemo-Geräte deines
   Netzwerks werden angezeigt. Klicke bei den gewünschten auf **Zu Gladys
   hinzufügen**.
3. Das war's: Ihr Status wird in Gladys angezeigt und du kannst sie steuern.

Die Wemo-Geräte müssen bereits in deinem WLAN sein (früher mit der Wemo-App
eingerichtet oder mit einem Werkzeug wie `pywemo` wieder ins WLAN gebracht).

## Konfiguration

- **Wemo-Adressen** — optional. Wenn ein Wemo nicht automatisch gefunden wird
  (anderes VLAN, ein Mesh-WLAN, das Multicast filtert), trage hier seine
  IP-Adresse ein, durch Kommas von den anderen getrennt. Der Port ist optional
  (`192.168.1.20:49153`): Ohne ihn werden die üblichen Wemo-Ports (49152 bis 49156) ausprobiert. Gib diesen Wemo eine **feste IP-Adresse**
  (DHCP-Reservierung).
- **Aktualisierungsintervall** — wie oft Steckdosen, Schalter und Dimmer
  abgefragt werden, in Sekunden (standardmäßig 10 s). Eine Änderung über die
  Taste des Wemo erscheint innerhalb dieser Zeit in Gladys.
- **Intervall der Bewegungsmelder** — wie oft Bewegungsmelder abgefragt werden
  (standardmäßig 2 s): die Verzögerung, bevor eine Szene bei einer Bewegung
  startet.
- **Stummen Wemo wiederfinden** — wenn ein Wemo nicht mehr antwortet, wird eine
  Netzwerksuche gestartet, um ihn wiederzufinden, falls er seine IP-Adresse
  geändert hat (höchstens einmal alle fünf Minuten).

Ein Wemo wechselt nach einem Neustart oft den **Port**: Die Integration findet
ihn von selbst auf seinen anderen Ports wieder und prüft dabei seine
Seriennummer.

## Schaltflächen im Tab Konfiguration

In der Karte **Aktionen** des Tabs **Konfiguration**:

- **Wemo-Geräte suchen** — startet die Suche und listet auf, was gefunden wurde
  (und was nicht: eine stumme Adresse, ein nicht unterstütztes Gerät).
- **Verbindung testen** — fragt jeden zu Gladys hinzugefügten Wemo ab und
  meldet, ob er antwortet, mit seinem Status oder dem Fehler.

## Badge Lokal / Nicht erreichbar

Jedes Gerät zeigt ein Badge: **Lokal**, wenn es antwortet, **Nicht
erreichbar** nach drei Abfragen ohne Antwort. Der Tab **Überwachung** meldet
„Kein Wemo antwortet“, wenn keiner mehr antwortet.

## Szenen

Im Szenen-Editor (Kategorie **Integrationen**):

**Auslöser**

- **Wemo-Bewegung erkannt** — ein Wemo Motion erkennt eine Bewegung (einmal pro
  Erkennung). Variable: `{{triggerEvent.data.device_name}}`.
- **Status eines Wemo Insight geändert** — ein Insight wird eingeschaltet, geht
  in den **Standby** (das angeschlossene Gerät ist fertig: Waschmaschine,
  Geschirrspüler…) oder wird ausgeschaltet. Filter auf den neuen Status.
  Variablen: `state` (`on`, `standby`, `off`), `power` (W), `device_name`. Die
  Standby-Schwelle wird in der Wemo-App eingestellt.
- **Wemo erreichbar oder nicht** — ein Wemo antwortet nicht mehr, oder wieder.
  Variablen: `status` (`offline`, `online`), `device_name`.

Für ein einfaches Ein/Aus verwende den Standard-Auslöser von Gladys
„Änderung von Gerätestatus“.

**Aktionen**

- **Wemo umschalten** — schaltet einen eingeschalteten Wemo aus und einen
  ausgeschalteten ein. Ausgaben: `toggled` (false, wenn das Gerät kein Relais
  hat), `is_on`.
- **Wemo Insight auslesen** — Ausgaben: `reachable`, `state`, `power` (W),
  `today_energy` (kWh), zum Prüfen in den folgenden Bedingungen.
- **Wemo-Geräte suchen** — Ausgabe: `found` (Anzahl der gefundenen Wemo).

## Dashboard

- **Wemo-Geräte** — alle Wemo auf einen Blick: wie viele antworten, was jeder
  gerade tut (nicht erreichbare zuerst), die Gesamtleistung der Insight und eine
  Schaltfläche **Wemo suchen**.
- **Wemo Insight** — wähle einen Insight in den Widget-Einstellungen:
  Leistung und Energie live, Verbrauch und Betriebszeit des Tages, eine
  24-Stunden-Leistungskurve und eine Ein/Aus-Schaltfläche.

## Fehlerbehebung

- **Kein Wemo gefunden**: Prüfe, ob sie sich im selben Netzwerk wie der
  Gladys-Rechner befinden. Andernfalls trage ihre Adresse unter
  „Wemo-Adressen“ ein.
- **„Automatische Suche nicht verfügbar“**: Dein Gladys ist zu alt für die
  Netzwerksuche, oder die SSDP-Berechtigung wurde bei der Installation
  verweigert. Von Hand eingetragene Adressen funktionieren weiterhin.
- **Ein Wemo wird ab und zu nicht erreichbar**: Sein WLAN ist schwach, oder er
  hat seine Adresse geändert. Reserviere ihm in deinem Router eine feste
  IP-Adresse.
- **Protokolle**: im Tab **Protokolle** der Integration (oder `docker logs`), mit
  `LOG_LEVEL=debug` für die Details jeder Abfrage.
