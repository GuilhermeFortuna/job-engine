/**
 * Self-signed TLS material for the loopback HTTPS fixture servers.
 *
 * Generated in-process at import time rather than committed. A checked-in PEM
 * private key — even a throwaway one — trips repository secret scanners and
 * invites someone to reuse it somewhere real (CROSS-009 advisory A-2).
 *
 * Generation is synchronous so the fixture servers can keep building their
 * `https.Server` in a constructor. These certificates are accepted only because
 * the fixture runners launch Electron with `--ignore-certificate-errors`;
 * nothing here is ever trusted by the product itself.
 */
import forge from "node-forge";

function generateLoopbackTls(): { key: string; cert: string } {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const attrs = [{ name: "commonName", value: "localhost" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", serverAuth: true },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
        { type: 7, ip: "::1" },
      ],
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
}

const generated = generateLoopbackTls();

export const TEST_SSL_KEY = generated.key;
export const TEST_SSL_CERT = generated.cert;
