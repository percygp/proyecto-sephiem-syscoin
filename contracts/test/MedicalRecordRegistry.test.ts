import { expect } from "chai";
import { ethers } from "hardhat";
import {
  PatientRegistry,
  DoctorRegistry,
  MedicalRecordRegistry,
} from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("MedicalRecordRegistry", () => {
  let patientReg: PatientRegistry;
  let doctorReg: DoctorRegistry;
  let recordReg: MedicalRecordRegistry;
  let owner: HardhatEthersSigner;
  let medico: HardhatEthersSigner;
  let paciente: HardhatEthersSigner;
  let otro: HardhatEthersSigner;

  const HASH_DOC = ethers.keccak256(ethers.toUtf8Bytes("contenido del documento"));
  const HASH_ALT = ethers.keccak256(ethers.toUtf8Bytes("contenido alterado"));
  const TIPO_RECETA = 1; // RECETA
  const VERSION = "1.0";

  beforeEach(async () => {
    [owner, medico, paciente, otro] = await ethers.getSigners();

    const PatientFactory = await ethers.getContractFactory("PatientRegistry");
    patientReg = await PatientFactory.deploy();

    const DoctorFactory = await ethers.getContractFactory("DoctorRegistry");
    doctorReg = await DoctorFactory.deploy();

    const RecordFactory = await ethers.getContractFactory("MedicalRecordRegistry");
    recordReg = await RecordFactory.deploy(
      await patientReg.getAddress(),
      await doctorReg.getAddress()
    );

    // Setup: registrar médico y paciente, otorgar acceso
    await doctorReg.connect(owner).registerDoctor(medico.address, "CMP-001", "Medicina General");
    await patientReg.connect(paciente).registerPatient();
    await patientReg.connect(paciente).grantAccess(medico.address);
  });

  describe("registerRecord", () => {
    it("medico verificado con acceso registra documento exitosamente", async () => {
      const tx = await recordReg.connect(medico).registerRecord(HASH_DOC, paciente.address, TIPO_RECETA, VERSION);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("emite evento RecordRegistered", async () => {
      await expect(recordReg.connect(medico).registerRecord(HASH_DOC, paciente.address, TIPO_RECETA, VERSION))
        .to.emit(recordReg, "RecordRegistered");
    });

    it("medico no verificado no puede registrar", async () => {
      await expect(
        recordReg.connect(otro).registerRecord(HASH_DOC, paciente.address, TIPO_RECETA, VERSION)
      ).to.be.revertedWith("No eres medico verificado");
    });

    it("medico sin acceso del paciente no puede registrar", async () => {
      // Registrar otro medico pero sin que el paciente le dé acceso
      await doctorReg.connect(owner).registerDoctor(otro.address, "CMP-002", "Cardiología");
      await expect(
        recordReg.connect(otro).registerRecord(HASH_DOC, paciente.address, TIPO_RECETA, VERSION)
      ).to.be.revertedWith("Sin permiso del paciente");
    });

    it("paciente no registrado no puede ser referenciado", async () => {
      await expect(
        recordReg.connect(medico).registerRecord(HASH_DOC, otro.address, TIPO_RECETA, VERSION)
      ).to.be.revertedWith("Paciente no registrado");
    });
  });

  describe("verifyIntegrity", () => {
    let recordId: string;

    beforeEach(async () => {
      const tx = await recordReg.connect(medico).registerRecord(HASH_DOC, paciente.address, TIPO_RECETA, VERSION);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          return recordReg.interface.parseLog(log as any)?.name === "RecordRegistered";
        } catch { return false; }
      });
      recordId = recordReg.interface.parseLog(event as any)!.args[0];
    });

    it("retorna true con el hash original", async () => {
      expect(await recordReg.verifyIntegrity(recordId, HASH_DOC)).to.be.true;
    });

    it("retorna false con hash alterado", async () => {
      expect(await recordReg.verifyIntegrity(recordId, HASH_ALT)).to.be.false;
    });
  });

  describe("updateStatus", () => {
    let recordId: string;

    beforeEach(async () => {
      const tx = await recordReg.connect(medico).registerRecord(HASH_DOC, paciente.address, TIPO_RECETA, VERSION);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try { return recordReg.interface.parseLog(log as any)?.name === "RecordRegistered"; }
        catch { return false; }
      });
      recordId = recordReg.interface.parseLog(event as any)!.args[0];
    });

    it("medico emisor puede anular el documento", async () => {
      await recordReg.connect(medico).updateStatus(recordId, 1); // ANULADO
      const record = await recordReg.getRecord(recordId);
      expect(record.estado).to.equal(1n);
    });

    it("tercero no puede cambiar estado", async () => {
      await expect(recordReg.connect(otro).updateStatus(recordId, 1))
        .to.be.revertedWith("Sin permiso");
    });
  });

  describe("registerCorrection", () => {
    let recordPrevioId: string;

    beforeEach(async () => {
      const tx = await recordReg.connect(medico).registerRecord(HASH_DOC, paciente.address, TIPO_RECETA, VERSION);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try { return recordReg.interface.parseLog(log as any)?.name === "RecordRegistered"; }
        catch { return false; }
      });
      recordPrevioId = recordReg.interface.parseLog(event as any)!.args[0];
    });

    it("registra corrección vinculada al documento previo", async () => {
      const HASH_CORR = ethers.keccak256(ethers.toUtf8Bytes("documento corregido"));
      const tx = await recordReg.connect(medico).registerCorrection(HASH_CORR, recordPrevioId, "1.1");
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("el documento previo queda en estado CORREGIDO", async () => {
      const HASH_CORR = ethers.keccak256(ethers.toUtf8Bytes("documento corregido v2"));
      await recordReg.connect(medico).registerCorrection(HASH_CORR, recordPrevioId, "1.1");
      const previo = await recordReg.getRecord(recordPrevioId);
      expect(previo.estado).to.equal(2n); // CORREGIDO
    });

    it("solo el medico emisor puede corregir", async () => {
      await doctorReg.connect(owner).registerDoctor(otro.address, "CMP-003", "Pediatría");
      await patientReg.connect(paciente).grantAccess(otro.address);
      const HASH_CORR = ethers.keccak256(ethers.toUtf8Bytes("intento de correccion"));
      await expect(recordReg.connect(otro).registerCorrection(HASH_CORR, recordPrevioId, "1.1"))
        .to.be.revertedWith("Solo el medico emisor puede corregir");
    });
  });

  describe("getRecordsByPaciente", () => {
    it("retorna solo los documentos del paciente", async () => {
      await recordReg.connect(medico).registerRecord(HASH_DOC, paciente.address, TIPO_RECETA, VERSION);
      const lista = await recordReg.getRecordsByPaciente(paciente.address);
      expect(lista.length).to.equal(1);
    });
  });
});
