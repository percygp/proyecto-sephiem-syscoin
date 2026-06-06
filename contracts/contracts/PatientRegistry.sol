// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract PatientRegistry is Ownable {
    struct PatientInfo {
        bool registrado;
        uint256 registradoEn;
    }

    mapping(address => PatientInfo) private pacientes;
    // paciente => medico => tieneAcceso
    mapping(address => mapping(address => bool)) private permisos;

    event PatientRegistered(address indexed paciente, uint256 timestamp);
    event AccessGranted(address indexed paciente, address indexed medico);
    event AccessRevoked(address indexed paciente, address indexed medico);

    constructor() Ownable(msg.sender) {}

    function registerPatient() external {
        require(!pacientes[msg.sender].registrado, "Ya registrado");
        pacientes[msg.sender] = PatientInfo({ registrado: true, registradoEn: block.timestamp });
        emit PatientRegistered(msg.sender, block.timestamp);
    }

    function grantAccess(address medico) external {
        require(pacientes[msg.sender].registrado, "No eres paciente registrado");
        require(medico != address(0), "Direccion invalida");
        permisos[msg.sender][medico] = true;
        emit AccessGranted(msg.sender, medico);
    }

    function revokeAccess(address medico) external {
        require(pacientes[msg.sender].registrado, "No eres paciente registrado");
        permisos[msg.sender][medico] = false;
        emit AccessRevoked(msg.sender, medico);
    }

    function hasAccess(address paciente, address medico) external view returns (bool) {
        return permisos[paciente][medico];
    }

    function isPatient(address addr) external view returns (bool) {
        return pacientes[addr].registrado;
    }

    function getPatientInfo(address addr) external view returns (PatientInfo memory) {
        return pacientes[addr];
    }
}
