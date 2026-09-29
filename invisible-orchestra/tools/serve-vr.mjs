#!/usr/bin/env node
/**
 * Serve the built exhibit over HTTPS on the local network, for a headset.
 *
 * WebXR only runs in a secure context, and a Quest browser cannot open a
 * file from a laptop's disk, so this serves dist/ over TLS with a
 * self-signed certificate (made with openssl on first run). On the headset,
 * open the printed https URL, accept the certificate warning once, then
 * press "Enter VR".
 *
 *   node tools/serve-vr.mjs            # https://<your LAN IP>:8443/
 *   PORT=9443 node tools/serve-vr.mjs
 */
import { createServer } from 'node:https';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const certDir = join(root, '.cert');
const key = join(certDir, 'key.pem'), cert = join(certDir, 'cert.pem');
if (!existsSync(key) || !existsSync(cert)) {
  mkdirSync(certDir, { recursive: true });
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${key}" -out "${cert}" -days 365 -subj "/CN=invisible-orchestra.local"`, { stdio: 'ignore' });
}
const page = join(dist, 'invisible-orchestra.html');
if (!existsSync(page)) { console.error('Build first: npm run build'); process.exit(1); }
const port = Number(process.env.PORT || 8443);
createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(readFileSync(page));
}).listen(port, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('The Invisible Orchestra, for a headset:');
  for (const ip of ips) console.log(`  https://${ip}:${port}/`);
  console.log('Accept the self-signed certificate once on the headset, then press "Enter VR".');
});
