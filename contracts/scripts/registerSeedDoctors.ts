import { ethers } from "hardhat";

const DOCTOR_REGISTRY = "0xb71a157762730C94Ea6675Ed0bDb96eA38d7451a";

const SEED_DOCTORS = [
  {
    address: "0x00000000000000000000000000000000000000e1",
    colegiatura: "LIC-PEND-001",
    especializacion: "Neurologia",
  },
  {
    address: "0x00000000000000000000000000000000000000e2",
    colegiatura: "LIC-PEND-002",
    especializacion: "Endocrinologia",
  },
  {
    address: "0x00000000000000000000000000000000000000e3",
    colegiatura: "LIC-PEND-003",
    especializacion: "Oftalmologia",
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const registry = await ethers.getContractAt("DoctorRegistry", DOCTOR_REGISTRY, deployer);

  for (const doc of SEED_DOCTORS) {
    try {
      const isVerified = await (registry as any).isVerified(doc.address);
      if (isVerified) {
        console.log(`SKIP  ${doc.address} — ya registrado`);
        continue;
      }
      const tx = await (registry as any).registerDoctor(
        doc.address,
        doc.colegiatura,
        doc.especializacion,
      );
      await tx.wait();
      console.log(`OK    ${doc.address} (${doc.especializacion}) — tx: ${tx.hash}`);
    } catch (err) {
      console.error(`FAIL  ${doc.address}:`, (err as Error).message);
    }
  }

  console.log("\nListo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
