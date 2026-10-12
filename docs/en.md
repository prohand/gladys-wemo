# Wemo

Control your **Belkin Wemo** devices from Gladys, on your **local network**: no
account, no cloud. Belkin shut its Wemo cloud down on January 31, 2026; local
control, the one this integration uses, keeps working.

## Supported devices

| Device                   | In Gladys                                  |
| ------------------------ | ------------------------------------------ |
| Wemo Switch, Wemo Mini   | On/off switch                              |
| Wemo Light Switch, 3-Way | On/off light                               |
| Wemo Dimmer              | On/off light + brightness (%)              |
| Wemo Insight             | On/off + power (W) + energy (kWh)          |
| Wemo Motion              | Motion sensor                              |
| Wemo Maker               | Relay + input (opening sensor, 1 = closed) |

Not supported: the Wemo Link bridge (and its bulbs) and the Wemo appliances
(coffee maker, slow cooker, humidifier…). The most recent models, made for
HomeKit only (Thread), do not speak the local Wemo protocol.

## Installation

1. Install the **Wemo** integration from the Gladys catalog (Gladys 5.1 or
   later). The install screen says it asks for an **SSDP network search**:
   that is how Gladys finds the Wemo devices for it.
2. Open the **Discovery** tab of the integration: the Wemo devices of your
   network show up. Add the ones you want.
3. That's it: their state shows in Gladys and you can control them.

The Wemo devices must already be on your Wi-Fi (set up earlier with the Wemo
app, or put back on Wi-Fi with a tool such as `pywemo`).

## Configuration

- **Wemo addresses** — optional. When a Wemo is not found automatically
  (another VLAN, a mesh Wi-Fi that filters multicast), type its IP address
  here, separated from the others by commas. The port is optional
  (`192.168.1.20:49153`): without it, the usual Wemo ports (49152 to 49156)
  are tried. Give these Wemo a **fixed IP address** (DHCP reservation).
- **Refresh interval** — how often plugs, switches and dimmers are read, in
  seconds (10 s by default). A change made from the Wemo button shows in
  Gladys within this delay.
- **Motion sensor interval** — how often motion sensors are read (2 s by
  default): the delay before a scene starts on a motion.
- **Find a silent Wemo again** — when a Wemo stops answering, run a network
  search to find it again if it changed IP address (at most once every five
  minutes).

A Wemo often changes **port** after a reboot: the integration finds it again
on its other ports by itself, checking its serial number.

## Configuration screen buttons

- **Search for Wemo devices** — runs the search and lists what was found (and
  what was not: a silent address, an unsupported device).
- **Test the connection** — reads every Wemo added to Gladys and tells whether
  it answers, with its state or the error.

## Local / unreachable badge

Each device shows a badge: **local** when it answers, **unreachable** after
three reads without an answer. The Configuration screen says "No Wemo answers"
when none answers any more.

## Scenes

In the scene editor (**Integrations** category):

**Triggers**

- **Wemo motion detected** — a Wemo Motion sees a movement (once per
  detection). Variable: `{{triggerEvent.data.device_name}}`.
- **Wemo Insight state changed** — an Insight switches on, goes to
  **standby** (the plugged appliance has finished: washing machine,
  dishwasher…) or switches off. Filter on the new state. Variables: `state`
  (`on`, `standby`, `off`), `power` (W), `device_name`. The standby threshold
  is set in the Wemo app.
- **Wemo reachable or not** — a Wemo stopped answering, or answers again.
  Variables: `status` (`offline`, `online`), `device_name`.

For a plain on/off, use the standard Gladys "Device state change" trigger.

**Actions**

- **Toggle a Wemo** — switches a Wemo off when it is on, on when it is off.
  Outputs: `toggled` (false when the device has no relay), `is_on`.
- **Read a Wemo Insight** — outputs: `reachable`, `state`, `power` (W),
  `today_energy` (kWh), to test in the following conditions.
- **Search for Wemo devices** — output: `found` (number of Wemo found).

## Dashboard

- **Wemo devices** — every Wemo at a glance: how many answer, what each one
  does (unreachable ones first), the total power of the Insights, and a
  **Search for Wemo** button.
- **Wemo Insight** — pick an Insight in the widget settings: live power and
  energy, today's consumption and running time, a 24-hour power curve and an
  on/off button.

## Troubleshooting

- **No Wemo found**: check they are on the same network as the Gladys
  machine. Otherwise, type their address in "Wemo addresses".
- **"Automatic search unavailable"**: your Gladys is too old for the network
  search, or the SSDP permission was refused at install time. Addresses typed
  by hand still work.
- **A Wemo turns unreachable now and then**: its Wi-Fi is weak, or it changed
  address. Reserve it a fixed IP address in your router.
- **Logs**: from the Gladys interface (or `docker logs`), with
  `LOG_LEVEL=debug` for the detail of every read.
