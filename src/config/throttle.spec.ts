import { IP_HEADERS, resolveClientIp } from './throttle';

describe('resolveClientIp', () => {
  const SECRET = 'proxy-secret';

  it("garde l'IP transmise par le proxy Next quand le secret est valide", () => {
    const req = {
      ip: '10.0.0.1',
      headers: { [IP_HEADERS.CLIENT_IP]: '41.82.1.2', [IP_HEADERS.PROXY_SECRET]: SECRET },
    };
    expect(resolveClientIp(req, SECRET)).toBe('41.82.1.2');
  });

  it("ignore l'IP transmise si le secret est faux, absent ou non configuré", () => {
    const forged = { ip: '41.82.1.2', headers: { [IP_HEADERS.CLIENT_IP]: '1.1.1.1' } };
    expect(resolveClientIp(forged, SECRET)).toBe('41.82.1.2');
    expect(
      resolveClientIp(
        { ...forged, headers: { ...forged.headers, [IP_HEADERS.PROXY_SECRET]: 'faux' } },
        SECRET,
      ),
    ).toBe('41.82.1.2');
    expect(
      resolveClientIp(
        { ...forged, headers: { ...forged.headers, [IP_HEADERS.PROXY_SECRET]: SECRET } },
        undefined,
      ),
    ).toBe('41.82.1.2');
  });

  it("n'utilise jamais X-Forwarded-For directement (req.ip, calculée par Express)", () => {
    const req = { ip: '41.82.1.2', headers: { 'x-forwarded-for': '6.6.6.6, 41.82.1.2' } };
    expect(resolveClientIp(req, SECRET)).toBe('41.82.1.2');
  });
});
