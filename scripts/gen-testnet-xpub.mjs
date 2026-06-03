/**
 * Script local de UN SOLO USO — genera una semilla BIP39 testnet desechable y
 * deriva el xpub al nivel que consume convex/payments/hdwallet.ts.
 *
 * SOLO TESTNET (Syscoin Tanenbaum, chainId 5700). Monedas sin valor.
 *
 * Path del nodo cuyo xpub se guarda en HD_XPUB_TESTNET:  m/44'/57'/1'/0
 *   (nivel "change/external" — el código hace root.deriveChild(index) => .../{index})
 *
 * Salida:
 *   - stdout: SOLO el xpub (clave pública, OK exponer)
 *   - .secrets/hd-testnet-seed.txt: la mnemonic (gitignored, NUNCA versionar)
 *
 * NO subir la mnemonic a env ni a git. Solo el xpub va al deployment.
 *
 * Uso:  node scripts/gen-testnet-xpub.mjs
 */
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

// Path testnet que espera hdwallet.ts (account 1' + change 0)
const PATH = "m/44'/57'/1'/0";
const SEED_FILE = ".secrets/hd-testnet-seed.txt";

// Fail-fast: nunca sobrescribir una seed ya generada (desalinearía el xpub desplegado).
if (existsSync(SEED_FILE)) {
  console.error(
    `ERROR: ${SEED_FILE} ya existe. Borra el archivo a mano si realmente quieres regenerar la seed (esto invalida el xpub desplegado).`,
  );
  process.exit(1);
}

const mnemonic = generateMnemonic(wordlist, 256); // 24 palabras
const seed = mnemonicToSeedSync(mnemonic);
const root = HDKey.fromMasterSeed(seed);
const node = root.derive(PATH);
const xpub = node.publicExtendedKey;

// Guardar mnemonic SOLO localmente (gitignored)
mkdirSync(".secrets", { recursive: true });
writeFileSync(
  SEED_FILE,
  `# Sephiem HD testnet seed (Syscoin Tanenbaum, chainId 5700) — DESECHABLE\n` +
    `# Path xpub: ${PATH}\n` +
    `# Generado: ${new Date().toISOString()}\n` +
    `# NUNCA versionar ni subir a env. Solo el xpub va al deployment.\n` +
    `MNEMONIC="${mnemonic}"\n`,
  { mode: 0o600 },
);

// stdout: SOLO el xpub
process.stdout.write(xpub + "\n");
