// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./PatientRegistry.sol";
import "./DoctorRegistry.sol";

contract MedicalRecordRegistry is Ownable {
    enum RecordType { RECOMENDACION, RECETA, RESULTADO, CONSTANCIA, CONSENTIMIENTO }
    enum RecordStatus { ACTIVO, ANULADO, CORREGIDO }

    struct MedicalRecord {
        bytes32 recordId;
        bytes32 hash;
        address medico;
        address paciente;
        RecordType tipo;
        RecordStatus estado;
        uint256 timestamp;
        string version;
        bytes32 recordPrevioId;
    }

    PatientRegistry public immutable patientRegistry;
    DoctorRegistry public immutable doctorRegistry;

    mapping(bytes32 => MedicalRecord) private records;
    mapping(address => bytes32[]) private recordsByPaciente;
    mapping(address => bytes32[]) private recordsByMedico;

    event RecordRegistered(
        bytes32 indexed recordId,
        address indexed medico,
        address indexed paciente,
        RecordType tipo,
        uint256 timestamp
    );
    event StatusUpdated(bytes32 indexed recordId, RecordStatus estado, address updatedBy);
    event CorrectionRegistered(bytes32 indexed recordId, bytes32 indexed recordPrevioId);

    constructor(address _patientRegistry, address _doctorRegistry) Ownable(msg.sender) {
        patientRegistry = PatientRegistry(_patientRegistry);
        doctorRegistry = DoctorRegistry(_doctorRegistry);
    }

    function registerRecord(
        bytes32 hash,
        address paciente,
        RecordType tipo,
        string calldata version
    ) external returns (bytes32 recordId) {
        require(doctorRegistry.isVerified(msg.sender), "No eres medico verificado");
        require(patientRegistry.isPatient(paciente), "Paciente no registrado");
        require(patientRegistry.hasAccess(paciente, msg.sender), "Sin permiso del paciente");
        require(hash != bytes32(0), "Hash invalido");

        recordId = keccak256(abi.encodePacked(hash, msg.sender, paciente, block.timestamp));
        require(records[recordId].timestamp == 0, "Record ya existe");

        records[recordId] = MedicalRecord({
            recordId: recordId,
            hash: hash,
            medico: msg.sender,
            paciente: paciente,
            tipo: tipo,
            estado: RecordStatus.ACTIVO,
            timestamp: block.timestamp,
            version: version,
            recordPrevioId: bytes32(0)
        });

        recordsByPaciente[paciente].push(recordId);
        recordsByMedico[msg.sender].push(recordId);

        emit RecordRegistered(recordId, msg.sender, paciente, tipo, block.timestamp);
    }

    function updateStatus(bytes32 recordId, RecordStatus nuevoEstado) external {
        MedicalRecord storage record = records[recordId];
        require(record.timestamp != 0, "Record no existe");
        require(record.medico == msg.sender || owner() == msg.sender, "Sin permiso");
        require(record.estado != nuevoEstado, "Estado igual al actual");

        record.estado = nuevoEstado;
        emit StatusUpdated(recordId, nuevoEstado, msg.sender);
    }

    function registerCorrection(
        bytes32 hashNuevo,
        bytes32 recordPrevioId,
        string calldata version
    ) external returns (bytes32 recordId) {
        MedicalRecord storage previo = records[recordPrevioId];
        require(previo.timestamp != 0, "Record previo no existe");
        require(previo.medico == msg.sender, "Solo el medico emisor puede corregir");
        require(hashNuevo != bytes32(0), "Hash invalido");

        address paciente = previo.paciente;
        require(patientRegistry.hasAccess(paciente, msg.sender), "Sin permiso del paciente");

        recordId = keccak256(abi.encodePacked(hashNuevo, msg.sender, paciente, block.timestamp));
        require(records[recordId].timestamp == 0, "Record ya existe");

        records[recordId] = MedicalRecord({
            recordId: recordId,
            hash: hashNuevo,
            medico: msg.sender,
            paciente: paciente,
            tipo: previo.tipo,
            estado: RecordStatus.ACTIVO,
            timestamp: block.timestamp,
            version: version,
            recordPrevioId: recordPrevioId
        });

        previo.estado = RecordStatus.CORREGIDO;

        recordsByPaciente[paciente].push(recordId);
        recordsByMedico[msg.sender].push(recordId);

        emit CorrectionRegistered(recordId, recordPrevioId);
        emit RecordRegistered(recordId, msg.sender, paciente, previo.tipo, block.timestamp);
    }

    function getRecord(bytes32 recordId) external view returns (MedicalRecord memory) {
        require(records[recordId].timestamp != 0, "Record no existe");
        return records[recordId];
    }

    function verifyIntegrity(bytes32 recordId, bytes32 hashAVerificar) external view returns (bool) {
        return records[recordId].hash == hashAVerificar;
    }

    function getRecordsByPaciente(address paciente) external view returns (bytes32[] memory) {
        return recordsByPaciente[paciente];
    }

    function getRecordsByMedico(address medico) external view returns (bytes32[] memory) {
        return recordsByMedico[medico];
    }
}
