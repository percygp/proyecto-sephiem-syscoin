import { expect } from "chai";
import { ethers } from "hardhat";
import { DoctorRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("DoctorRegistry", () => {
  let registry: DoctorRegistry;
  let owner: HardhatEthersSigner;
  let medico: HardhatEthersSigner;
  let otro: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, medico, otro] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DoctorRegistry");
    registry = await Factory.deploy();
  });

  describe("registerDoctor", () => {
    it("owner registra medico correctamente", async () => {
      await registry.connect(owner).registerDoctor(medico.address, "CMP-12345", "Medicina General");
      expect(await registry.isVerified(medico.address)).to.be.true;
    });

    it("emite evento DoctorRegistrado", async () => {
      await expect(registry.connect(owner).registerDoctor(medico.address, "CMP-12345", "Medicina General"))
        .to.emit(registry, "DoctorRegistrado")
        .withArgs(medico.address, "Medicina General", await ethers.provider.getBlock("latest").then(b => b!.timestamp + 1));
    });

    it("getDoctorInfo retorna datos correctos", async () => {
      await registry.connect(owner).registerDoctor(medico.address, "CMP-12345", "Cardiología");
      const info = await registry.getDoctorInfo(medico.address);
      expect(info.colegiatura).to.equal("CMP-12345");
      expect(info.especializacion).to.equal("Cardiología");
      expect(info.activo).to.be.true;
      expect(info.totalAtenciones).to.equal(0n);
    });

    it("no-owner no puede registrar medico", async () => {
      await expect(
        registry.connect(otro).registerDoctor(medico.address, "CMP-12345", "Medicina General")
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("no permite registro doble", async () => {
      await registry.connect(owner).registerDoctor(medico.address, "CMP-12345", "Medicina General");
      await expect(
        registry.connect(owner).registerDoctor(medico.address, "CMP-12345", "Medicina General")
      ).to.be.revertedWith("Medico ya registrado");
    });

    it("rechaza direccion cero", async () => {
      await expect(
        registry.connect(owner).registerDoctor(ethers.ZeroAddress, "CMP-12345", "Medicina General")
      ).to.be.revertedWith("Direccion invalida");
    });
  });

  describe("revokeDoctor", () => {
    beforeEach(async () => {
      await registry.connect(owner).registerDoctor(medico.address, "CMP-12345", "Medicina General");
    });

    it("owner revoca medico → isVerified false", async () => {
      await registry.connect(owner).revokeDoctor(medico.address);
      expect(await registry.isVerified(medico.address)).to.be.false;
    });

    it("emite evento DoctorRevocado", async () => {
      await expect(registry.connect(owner).revokeDoctor(medico.address))
        .to.emit(registry, "DoctorRevocado")
        .withArgs(medico.address);
    });

    it("no-owner no puede revocar", async () => {
      await expect(registry.connect(otro).revokeDoctor(medico.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("getAllDoctors", () => {
    it("retorna lista de medicos registrados", async () => {
      await registry.connect(owner).registerDoctor(medico.address, "CMP-1", "Medicina General");
      await registry.connect(owner).registerDoctor(otro.address, "CMP-2", "Pediatría");
      const lista = await registry.getAllDoctors();
      expect(lista.length).to.equal(2);
      expect(lista).to.include(medico.address);
      expect(lista).to.include(otro.address);
    });
  });
});
