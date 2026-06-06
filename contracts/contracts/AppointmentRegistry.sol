// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DoctorRegistry.sol";
import "./PatientRegistry.sol";

contract AppointmentRegistry is Ownable {
    enum AppointmentStatus { PENDIENTE, CONFIRMADA, COMPLETADA, CANCELADA }

    struct AppointmentInfo {
        bytes32 appointmentId;
        address paciente;
        address medico;
        uint256 fechaTimestamp;
        AppointmentStatus estado;
        uint256 creadoEn;
    }

    DoctorRegistry public immutable doctorRegistry;
    PatientRegistry public immutable patientRegistry;

    mapping(bytes32 => AppointmentInfo) private appointments;
    mapping(address => bytes32[]) private appointmentsByPaciente;
    mapping(address => bytes32[]) private appointmentsByMedico;

    event AppointmentBooked(
        bytes32 indexed appointmentId,
        address indexed paciente,
        address indexed medico,
        uint256 fechaTimestamp
    );
    event AppointmentStatusUpdated(bytes32 indexed appointmentId, AppointmentStatus estado);

    constructor(address _doctorRegistry, address _patientRegistry) Ownable(msg.sender) {
        doctorRegistry = DoctorRegistry(_doctorRegistry);
        patientRegistry = PatientRegistry(_patientRegistry);
    }

    function bookAppointment(
        address medico,
        uint256 fechaTimestamp
    ) external returns (bytes32 appointmentId) {
        require(patientRegistry.isPatient(msg.sender), "No eres paciente registrado");
        require(doctorRegistry.isVerified(medico), "Medico no verificado");
        require(fechaTimestamp > block.timestamp, "Fecha debe ser futura");

        appointmentId = keccak256(abi.encodePacked(msg.sender, medico, fechaTimestamp, block.timestamp));
        require(appointments[appointmentId].creadoEn == 0, "Cita ya existe");

        appointments[appointmentId] = AppointmentInfo({
            appointmentId: appointmentId,
            paciente: msg.sender,
            medico: medico,
            fechaTimestamp: fechaTimestamp,
            estado: AppointmentStatus.PENDIENTE,
            creadoEn: block.timestamp
        });

        appointmentsByPaciente[msg.sender].push(appointmentId);
        appointmentsByMedico[medico].push(appointmentId);

        emit AppointmentBooked(appointmentId, msg.sender, medico, fechaTimestamp);
    }

    function confirmAppointment(bytes32 appointmentId) external {
        AppointmentInfo storage apt = appointments[appointmentId];
        require(apt.creadoEn != 0, "Cita no existe");
        require(apt.medico == msg.sender, "Solo el medico puede confirmar");
        require(apt.estado == AppointmentStatus.PENDIENTE, "Cita no esta pendiente");

        apt.estado = AppointmentStatus.CONFIRMADA;
        emit AppointmentStatusUpdated(appointmentId, AppointmentStatus.CONFIRMADA);
    }

    function updateAppointmentStatus(bytes32 appointmentId, AppointmentStatus nuevoEstado) external {
        AppointmentInfo storage apt = appointments[appointmentId];
        require(apt.creadoEn != 0, "Cita no existe");
        require(
            apt.medico == msg.sender || apt.paciente == msg.sender || owner() == msg.sender,
            "Sin permiso"
        );
        require(apt.estado != AppointmentStatus.COMPLETADA, "Cita ya completada");
        require(apt.estado != AppointmentStatus.CANCELADA, "Cita ya cancelada");

        apt.estado = nuevoEstado;
        emit AppointmentStatusUpdated(appointmentId, nuevoEstado);
    }

    function getAppointment(bytes32 appointmentId) external view returns (AppointmentInfo memory) {
        require(appointments[appointmentId].creadoEn != 0, "Cita no existe");
        return appointments[appointmentId];
    }

    function getAppointmentsByPaciente(address paciente) external view returns (bytes32[] memory) {
        return appointmentsByPaciente[paciente];
    }

    function getAppointmentsByMedico(address medico) external view returns (bytes32[] memory) {
        return appointmentsByMedico[medico];
    }
}
