// -----------------------------------------------------------------------------
// A fake LAN of Wemo devices, served through a fake `fetch`.
//
// Each device answers setup.xml and the SOAP calls the integration makes,
// from a small mutable state the tests drive: switch it, move it to another
// port, make it refuse connections or time out.
// -----------------------------------------------------------------------------

const DEVICE_TYPES = {
  switch: 'urn:Belkin:device:controllee:1',
  lightswitch: 'urn:Belkin:device:lightswitch:1',
  dimmer: 'urn:Belkin:device:dimmer:1',
  insight: 'urn:Belkin:device:insight:1',
  motion: 'urn:Belkin:device:sensor:1',
  maker: 'urn:Belkin:device:Maker:1',
  bridge: 'urn:Belkin:device:bridge:1',
};

const soap = (action, inner) =>
  '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
  `<u:${action}Response xmlns:u="urn:Belkin:service:basicevent:1">${inner}</u:${action}Response>` +
  '</s:Body></s:Envelope>';

const response = (status, text) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => text,
});

/**
 * @param {Array<object>} devices initial devices: { kind, serial, name, host, port, ...state }
 */
export function createFakeWemoNetwork(devices = []) {
  const requests = [];
  const list = devices.map((device) => ({
    state: 0,
    brightness: 50,
    insight: { state: 0, powerMw: 0, todayMwMin: 0, totalMwMin: 0, onToday: 0 },
    attributes: { Switch: '0', Sensor: '1', SensorPresent: '1' },
    failure: undefined, // 'refuse' | 'timeout'
    ...device,
  }));

  function find(host, port) {
    return list.find((device) => device.host === host && device.port === port);
  }

  async function fetch(url, init = {}) {
    const { hostname, port, pathname } = new URL(url);
    const device = find(hostname, Number(port));
    const body = String(init.body ?? '');
    requests.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body });
    if (!device || device.failure === 'refuse') {
      throw new TypeError('fetch failed');
    }
    if (device.failure === 'timeout') {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    }
    if (pathname === '/setup.xml') {
      return response(
        200,
        '<?xml version="1.0"?><root xmlns="urn:Belkin:device-1-0"><device>' +
          `<deviceType>${DEVICE_TYPES[device.kind]}</deviceType>` +
          `<friendlyName>${device.name}</friendlyName>` +
          '<manufacturer>Belkin International Inc.</manufacturer>' +
          `<modelName>${device.model ?? 'Socket'}</modelName>` +
          `<serialNumber>${device.serial}</serialNumber>` +
          `<UDN>uuid:Socket-1_0-${device.serial}</UDN>` +
          '<macAddress>149182B2C5F0</macAddress>' +
          '<firmwareVersion>WeMo_WW_2.00.11532.PVT-OWRT-SNSV2</firmwareVersion>' +
          '</device></root>',
      );
    }
    const action = /#(\w+)"$/.exec(init.headers?.SOAPACTION ?? '')?.[1];
    switch (action) {
      case 'GetBinaryState': {
        const state =
          device.kind === 'insight' ? `${device.insight.state}|1611105078|0` : device.state;
        const extra =
          device.kind === 'dimmer' ? `<brightness>${device.brightness}</brightness>` : '';
        return response(200, soap(action, `<BinaryState>${state}</BinaryState>${extra}`));
      }
      case 'SetBinaryState': {
        const wanted = Number(/<BinaryState>(\d)<\/BinaryState>/.exec(body)?.[1]);
        const brightness = /<brightness>(\d+)<\/brightness>/.exec(body)?.[1];
        const unchanged =
          (device.kind === 'insight' ? Number(device.insight.state !== 0) : device.state) ===
            wanted && brightness === undefined;
        if (device.kind === 'insight') {
          device.insight.state = wanted;
        } else if (device.kind === 'maker') {
          device.attributes.Switch = String(wanted);
        } else {
          device.state = wanted;
        }
        if (brightness !== undefined) {
          device.brightness = Number(brightness);
        }
        // A real Wemo answers "Error" when it was already in that state.
        return response(
          200,
          soap(action, `<BinaryState>${unchanged ? 'Error' : wanted}</BinaryState>`),
        );
      }
      case 'GetInsightParams': {
        const i = device.insight;
        const params = `${i.state}|1611105078|0|${i.onToday}|1230|1209600|10|${i.powerMw}|${i.todayMwMin}|${i.totalMwMin}|8000`;
        return response(200, soap(action, `<InsightParams>${params}</InsightParams>`));
      }
      case 'GetAttributes': {
        const escaped = Object.entries(device.attributes)
          .map(
            ([name, value]) =>
              `&lt;attribute&gt;&lt;name&gt;${name}&lt;/name&gt;&lt;value&gt;${value}&lt;/value&gt;&lt;/attribute&gt;`,
          )
          .join('');
        return response(200, soap(action, `<attributeList>${escaped}</attributeList>`));
      }
      default:
        return response(
          500,
          '<s:Envelope><s:Body><s:Fault><faultstring>UPnPError</faultstring>' +
            '<detail><UPnPError><errorCode>401</errorCode><errorDescription>Invalid Action</errorDescription></UPnPError></detail>' +
            '</s:Fault></s:Body></s:Envelope>',
        );
    }
  }

  return {
    fetch,
    requests,
    devices: list,
    device: (serial) => list.find((device) => device.serial === serial),
    /** What the core's SSDP scan would relay for the current devices. */
    ssdpAnswers() {
      return list.map((device) => ({
        source_ip: device.host,
        source_port: 1900,
        headers:
          'HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=86400\r\n' +
          `LOCATION: http://${device.host}:${device.port}/setup.xml\r\n` +
          'SERVER: Unspecified, UPnP/1.0, Unspecified\r\n' +
          'ST: urn:Belkin:service:basicevent:1\r\n' +
          `USN: uuid:Socket-1_0-${device.serial}::urn:Belkin:service:basicevent:1\r\n` +
          'X-User-Agent: redsonic\r\n',
      }));
    },
  };
}
