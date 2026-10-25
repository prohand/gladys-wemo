# Wemo

Controle sus dispositivos **Belkin Wemo** desde Gladys, en su **red local**:
sin cuenta, sin nube. Belkin cerró su nube Wemo el 31 de enero de 2026; el
control local, el que utiliza esta integración, sigue funcionando.

## Dispositivos compatibles

| Dispositivo              | En Gladys                                        |
| ------------------------ | ------------------------------------------------ |
| Wemo Switch, Wemo Mini   | Interruptor de encendido/apagado                 |
| Wemo Light Switch, 3-Way | Luz de encendido/apagado                         |
| Wemo Dimmer              | Luz de encendido/apagado + brillo (%)            |
| Wemo Insight             | Encendido/apagado + potencia (W) + energía (kWh) |
| Wemo Motion              | Detector de movimiento                           |
| Wemo Maker               | Relé + entrada (sensor de apertura, 1 = cerrado) |

No compatibles: el puente Wemo Link (y sus bombillas) y los electrodomésticos
Wemo (cafetera, olla de cocción lenta, humidificador…). Los modelos más
recientes, pensados solo para HomeKit (Thread), no hablan el protocolo Wemo
local.

## Instalación

1. Instale la integración **Wemo** desde el catálogo de Gladys (Gladys 5.3 o
   posterior). La pantalla de instalación indica que solicita una **búsqueda
   de red SSDP**: así es como Gladys encuentra los Wemo por ella.
2. Abra la pestaña **Descubrir** de la integración: aparecen los Wemo de su
   red. Pulse **Añadir a Gladys** en los que desee.
3. Eso es todo: su estado se muestra en Gladys y puede controlarlos.

Los Wemo ya deben estar en su Wi-Fi (configurados antes con la aplicación Wemo,
o devueltos al Wi-Fi con una herramienta como `pywemo`).

## Configuración

- **Direcciones de los Wemo** — opcional. Cuando un Wemo no se encuentra
  automáticamente (otra VLAN, un Wi-Fi mallado que filtra el multicast),
  introduzca aquí su dirección IP, separada de las demás por comas. El puerto
  es opcional (`192.168.1.20:49153`): sin él, se prueban los puertos habituales
  de los Wemo (del 49152 al 49156). Asigne a estos Wemo una **dirección IP
  fija** (reserva DHCP).
- **Intervalo de actualización** — frecuencia de lectura de los enchufes,
  interruptores y reguladores, en segundos (10 s por defecto). Un cambio hecho
  desde el botón del Wemo aparece en Gladys dentro de este plazo.
- **Intervalo de los detectores** — frecuencia de lectura de los detectores de
  movimiento (2 s por defecto): el retardo antes de que una escena se inicie
  con un movimiento.
- **Volver a encontrar un Wemo silencioso** — cuando un Wemo deja de responder,
  se lanza una búsqueda en la red para volver a encontrarlo si ha cambiado de
  dirección IP (como máximo una vez cada cinco minutos).

Un Wemo suele cambiar de **puerto** tras un reinicio: la integración lo vuelve
a encontrar por sí sola en sus otros puertos, comprobando su número de serie.

## Botones de la pestaña Configuración

En la tarjeta **Acciones** de la pestaña **Configuración**:

- **Buscar dispositivos Wemo** — lanza la búsqueda y enumera lo que se ha
  encontrado (y lo que no: una dirección que no responde, un dispositivo no
  compatible).
- **Probar la conexión** — lee cada Wemo añadido a Gladys e indica si responde,
  con su estado o el error.

## Distintivo Local / Inaccesible

Cada dispositivo muestra un distintivo: **Local** cuando responde,
**Inaccesible** tras tres lecturas sin respuesta. La pestaña **Supervisión**
indica «Ningún Wemo responde» cuando ya no responde ninguno.

## Escenas

En el editor de escenas (categoría **Integraciones**):

**Activadores**

- **Movimiento detectado (Wemo)** — un Wemo Motion detecta un movimiento (una
  vez por detección). Variable: `{{triggerEvent.data.device_name}}`.
- **Cambio de estado de un Wemo Insight** — un Insight se enciende, pasa a
  **reposo** (el aparato conectado ha terminado: lavadora, lavavajillas…) o se
  apaga. Filtro por el nuevo estado. Variables: `state` (`on`, `standby`,
  `off`), `power` (W), `device_name`. El umbral de reposo se ajusta en la
  aplicación Wemo.
- **Wemo accesible o no** — un Wemo ha dejado de responder, o vuelve a
  responder. Variables: `status` (`offline`, `online`), `device_name`.

Para un simple encendido/apagado, utilice el activador estándar de Gladys
«Cambio de estado del dispositivo».

**Acciones**

- **Alternar un Wemo** — apaga un Wemo encendido y enciende un Wemo apagado.
  Salidas: `toggled` (false cuando el dispositivo no tiene relé), `is_on`.
- **Leer un Wemo Insight** — salidas: `reachable`, `state`, `power` (W),
  `today_energy` (kWh), para comprobarlas en las condiciones siguientes.
- **Buscar dispositivos Wemo** — salida: `found` (número de Wemo encontrados).

## Panel

- **Dispositivos Wemo** — todos los Wemo de un vistazo: cuántos responden, qué
  hace cada uno (los inaccesibles primero), la potencia total de los Insight y
  un botón **Buscar Wemo**.
- **Wemo Insight** — elija un Insight en la configuración del widget: potencia
  y energía en directo, consumo y tiempo de funcionamiento del día, una curva
  de potencia de 24 horas y un botón de encendido/apagado.

## Solución de problemas

- **No se encuentra ningún Wemo**: compruebe que están en la misma red que el
  equipo de Gladys. Si no, introduzca su dirección en «Direcciones de los
  Wemo».
- **«Búsqueda automática no disponible»**: su Gladys es demasiado antiguo para
  la búsqueda de red, o se rechazó el permiso SSDP durante la instalación. Las
  direcciones introducidas a mano siguen funcionando.
- **Un Wemo se vuelve inaccesible de vez en cuando**: su Wi-Fi es débil, o ha
  cambiado de dirección. Resérvele una dirección IP fija en su router.
- **Registros**: en la pestaña **Registros** de la integración (o `docker logs`), con
  `LOG_LEVEL=debug` para el detalle de cada lectura.
