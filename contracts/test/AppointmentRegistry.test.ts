import { expect } from "chai";
import { ethers } from "hardhat";
import { AppointmentRegistry, DoctorRegistry, PatientRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AppointmentRegistry", () => {
  let appointmentReg: AppointmentRegistry;
  let doctorReg: DoctorRegistry;
  let patientReg: PatientRegistry;
  let owner: HardhatEthersSigner;
  let medico: HardhatEthersSigner;
  let paciente: HardhatEthersSigner;
  let otro: HardhatEthersSigner;

  let fechaFutura: number;

  beforeEach(async () => {
    [owner, medico, paciente, otro] = await ethers.getSigners();

    const DoctorFactory = await ethers.getContractFactory("DoctorRegistry");
    doctorReg = await DoctorFactory.deploy();

    const PatientFactory = await ethers.getContractFactory("PatientRegistry");
    patientReg = await PatientFactory.deploy();

    const AppFactory = await ethers.getContractFactory("AppointmentRegistry");
    appointmentReg = await AppFactory.deploy(
      await doctorReg.getAddress(),
      await patientReg.getAddress()
    );

    await doctorReg.connect(owner).registerDoctor(medico.address, "CMP-001", "Medicina General");
    await patientReg.connect(paciente).registerPatient();

    const now = await time.latest();
    fechaFutura = now + 86400; // mañana
  });

  describe("bookAppointment", () => {
    it("paciente agenda cita con medico verificado", async () => {
      const tx = await appointmentReg.connect(paciente).bookAppointment(medico.address, fechaFutura);
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("emite evento AppointmentBooked", async () => {
      await expect(appointmentReg.connect(paciente).bookAppointment(medico.address, fechaFutura))
        .to.emit(appointmentReg, "AppointmentBooked")
        .withArgs(
          (val: string) => val !== ethers.ZeroHash,
          paciente.address,
          medico.address,
          fechaFutura
        );
    });

    it("no-paciente no puede agendar", async () => {
      await expect(appointmentReg.connect(otro).bookAppointment(medico.address, fechaFutura))
        .to.be.revertedWith("No eres paciente registrado");
    });

    it("medico no verificado no puede ser agendado", async () => {
      await expect(appointmentReg.connect(paciente).bookAppointment(otro.address, fechaFutura))
        .to.be.revertedWith("Medico no verificado");
    });

    it("fecha pasada no permitida", async () => {
      const now = await time.latest();
      await expect(appointmentReg.connect(paciente).bookAppointment(medico.address, now - 1))
        .to.be.revertedWith("Fecha debe ser futura");
    });
  });

  describe("confirmAppointment", () => {
    let appointmentId: string;

    beforeEach(async () => {
      const tx = await appointmentReg.connect(paciente).bookAppointment(medico.address, fechaFutura);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try { return appointmentReg.interface.parseLog(log as any)?.name === "AppointmentBooked"; }
        catch { return false; }
      });
      appointmentId = appointmentReg.interface.parseLog(event as any)!.args[0];
    });

    it("medico confirma cita → estado CONFIRMADA", async () => {
      await appointmentReg.connect(medico).confirmAppointment(appointmentId);
      const apt = await appointmentReg.getAppointment(appointmentId);
      expect(apt.estado).to.equal(1n); // CONFIRMADA
    });

    it("otro no puede confirmar la cita", async () => {
      await expect(appointmentReg.connect(otro).confirmAppointment(appointmentId))
        .to.be.revertedWith("Solo el medico puede confirmar");
    });
  });

  describe("getAppointmentsByPaciente", () => {
    it("filtra correctamente las citas del paciente", async () => {
      await appointmentReg.connect(paciente).bookAppointment(medico.address, fechaFutura);
      const lista = await appointmentReg.getAppointmentsByPaciente(paciente.address);
      expect(lista.length).to.equal(1);
    });

    it("retorna lista vacía para paciente sin citas", async () => {
      const lista = await appointmentReg.getAppointmentsByPaciente(otro.address);
      expect(lista.length).to.equal(0);
    });
  });
});
