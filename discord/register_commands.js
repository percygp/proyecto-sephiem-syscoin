/**
 * Registra los slash commands de SEPHIEM en Discord.
 * Ejecutar UNA VEZ (o cuando cambien los comandos):
 *   node discord/register_commands.js
 *
 * Requiere en discord/.env:
 *   DISCORD_APPLICATION_ID=...
 *   DISCORD_BOT_TOKEN=...
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env manualmente (sin dependencia extra)
try {
  const envPath = resolve(__dirname, ".env");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error("⚠️  No se pudo leer discord/.env — usa variables de entorno del sistema.");
}

const APP_ID    = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error("❌ Faltan DISCORD_APPLICATION_ID o DISCORD_BOT_TOKEN en discord/.env");
  process.exit(1);
}

const commands = [
  {
    name: "salud",
    description: "Consulta al asistente SEPH-AI sobre tu salud",
    options: [
      {
        name: "pregunta",
        description: "Tu consulta de salud (ej: tengo fiebre desde ayer)",
        type: 3,       // STRING
        required: true,
      },
    ],
  },
  {
    name: "cita",
    description: "Ver tu próxima cita médica agendada en SEPHIEM",
  },
  {
    name: "checkin",
    description: "Registrar tu estado de salud de hoy",
    options: [
      {
        name: "estado",
        description: "Cómo te sientes hoy (ej: bien, con dolor de cabeza, cansado)",
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: "estado",
    description: "Verificar si tu cuenta de Discord está vinculada a SEPHIEM",
  },
  {
    name: "ayuda",
    description: "Mostrar todos los comandos disponibles del bot SEPHIEM",
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${APP_ID}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  },
);

const data = await res.json();

if (res.ok) {
  console.log(`✅ ${data.length} comandos registrados correctamente:`);
  for (const cmd of data) {
    console.log(`   /${cmd.name} — ${cmd.description}`);
  }
  console.log("\n⚠️  Los comandos globales tardan hasta 1 hora en aparecer en Discord.");
  console.log("   Para pruebas instantáneas, registra en un servidor específico (ver README).");
} else {
  console.error("❌ Error al registrar comandos:", JSON.stringify(data, null, 2));
  process.exit(1);
}
