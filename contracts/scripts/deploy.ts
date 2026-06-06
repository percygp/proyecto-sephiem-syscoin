import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeployando con: ${deployer.address}`);
  console.log(`Red: ${network.name} (Chain ID: ${(await ethers.provider.getNetwork()).chainId})\n`);

  // 1. PatientRegistry
  console.log("Deploying PatientRegistry...");
  const PatientFactory = await ethers.getContractFactory("PatientRegistry");
  const patientRegistry = await PatientFactory.deploy();
  await patientRegistry.waitForDeployment();
  const patientAddr = await patientRegistry.getAddress();
  console.log(`  PatientRegistry:       ${patientAddr}`);

  // 2. DoctorRegistry
  console.log("Deploying DoctorRegistry...");
  const DoctorFactory = await ethers.getContractFactory("DoctorRegistry");
  const doctorRegistry = await DoctorFactory.deploy();
  await doctorRegistry.waitForDeployment();
  const doctorAddr = await doctorRegistry.getAddress();
  console.log(`  DoctorRegistry:        ${doctorAddr}`);

  // 3. MedicalRecordRegistry
  console.log("Deploying MedicalRecordRegistry...");
  const RecordFactory = await ethers.getContractFactory("MedicalRecordRegistry");
  const recordRegistry = await RecordFactory.deploy(patientAddr, doctorAddr);
  await recordRegistry.waitForDeployment();
  const recordAddr = await recordRegistry.getAddress();
  console.log(`  MedicalRecordRegistry: ${recordAddr}`);

  // 4. AppointmentRegistry
  console.log("Deploying AppointmentRegistry...");
  const AppFactory = await ethers.getContractFactory("AppointmentRegistry");
  const appointmentRegistry = await AppFactory.deploy(doctorAddr, patientAddr);
  await appointmentRegistry.waitForDeployment();
  const appointmentAddr = await appointmentRegistry.getAddress();
  console.log(`  AppointmentRegistry:   ${appointmentAddr}\n`);

  // 5. Registrar médico demo
  console.log("Registrando medico demo...");
  const tx = await doctorRegistry.registerDoctor(deployer.address, "CMP-DEMO-001", "Medicina General");
  await tx.wait();
  console.log(`  Medico demo: ${deployer.address}\n`);

  // 6. Guardar deployments
  const deployments = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    timestamp: new Date().toISOString(),
    contracts: {
      PatientRegistry: patientAddr,
      DoctorRegistry: doctorAddr,
      MedicalRecordRegistry: recordAddr,
      AppointmentRegistry: appointmentAddr,
    },
  };

  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployments, null, 2));
  console.log(`Deployments guardados en: ${outFile}`);

  // 7. Links al explorer
  if (network.name === "zkTanenbaum") {
    const explorer = "https://explorer-zk.tanenbaum.io/address";
    console.log("\nLinks al explorer:");
    console.log(`  PatientRegistry:       ${explorer}/${patientAddr}`);
    console.log(`  DoctorRegistry:        ${explorer}/${doctorAddr}`);
    console.log(`  MedicalRecordRegistry: ${explorer}/${recordAddr}`);
    console.log(`  AppointmentRegistry:   ${explorer}/${appointmentAddr}`);
  }

  console.log("\nDeploy completado.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
