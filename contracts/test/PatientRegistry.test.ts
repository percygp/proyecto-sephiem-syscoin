import { expect } from "chai";
import { ethers } from "hardhat";
import { PatientRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("PatientRegistry", () => {
  let registry: PatientRegistry;
  let owner: HardhatEthersSigner;
  let paciente: HardhatEthersSigner;
  let medico: HardhatEthersSigner;
  let otro: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, paciente, medico, otro] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PatientRegistry");
    registry = await Factory.deploy();
  });

  describe("registerPatient", () => {
    it("registra al llamante como paciente", async () => {
      await registry.connect(paciente).registerPatient();
      expect(await registry.isPatient(paciente.address)).to.be.true;
    });

    it("emite evento PatientRegistered", async () => {
      await expect(registry.connect(paciente).registerPatient())
        .to.emit(registry, "PatientRegistered")
        .withArgs(paciente.address, await ethers.provider.getBlock("latest").then(b => b!.timestamp + 1));
    });

    it("no permite registro doble", async () => {
      await registry.connect(paciente).registerPatient();
      await expect(registry.connect(paciente).registerPatient()).to.be.revertedWith("Ya registrado");
    });
  });

  describe("grantAccess / revokeAccess", () => {
    beforeEach(async () => {
      await registry.connect(paciente).registerPatient();
    });

    it("paciente otorga acceso a medico", async () => {
      await registry.connect(paciente).grantAccess(medico.address);
      expect(await registry.hasAccess(paciente.address, medico.address)).to.be.true;
    });

    it("emite evento AccessGranted", async () => {
      await expect(registry.connect(paciente).grantAccess(medico.address))
        .to.emit(registry, "AccessGranted")
        .withArgs(paciente.address, medico.address);
    });

    it("paciente revoca acceso", async () => {
      await registry.connect(paciente).grantAccess(medico.address);
      await registry.connect(paciente).revokeAccess(medico.address);
      expect(await registry.hasAccess(paciente.address, medico.address)).to.be.false;
    });

    it("emite evento AccessRevoked", async () => {
      await registry.connect(paciente).grantAccess(medico.address);
      await expect(registry.connect(paciente).revokeAccess(medico.address))
        .to.emit(registry, "AccessRevoked")
        .withArgs(paciente.address, medico.address);
    });

    it("tercero no puede otorgar acceso en nombre de otro", async () => {
      await expect(registry.connect(otro).grantAccess(medico.address))
        .to.be.revertedWith("No eres paciente registrado");
    });

    it("no paciente no puede revocar acceso", async () => {
      await expect(registry.connect(otro).revokeAccess(medico.address))
        .to.be.revertedWith("No eres paciente registrado");
    });
  });

  describe("hasAccess", () => {
    it("retorna false si no se otorgó acceso", async () => {
      await registry.connect(paciente).registerPatient();
      expect(await registry.hasAccess(paciente.address, medico.address)).to.be.false;
    });
  });
});
