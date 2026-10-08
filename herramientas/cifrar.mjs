// Cifra datos.json -> datos.enc.json con una clave (AES-GCM 256, PBKDF2-SHA256).
// Uso: node herramientas/cifrar.mjs datos.json datos.enc.json "clave"
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
const [, , ent, sal, clave] = process.argv;
if (!clave) { console.error("Uso: node cifrar.mjs datos.json datos.enc.json \"clave\""); process.exit(1); }
const iter = 250000;
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const datos = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, readFileSync(ent)));
const b64 = (u) => Buffer.from(u).toString("base64");
writeFileSync(sal, JSON.stringify({ alg: "AES-GCM/PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), datos: b64(datos) }));
console.log("Listo:", sal);
