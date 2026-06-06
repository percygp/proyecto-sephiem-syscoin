// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DoctorRegistry is Ownable {
    struct DoctorInfo {
        string colegiatura;
        string especializacion;
        bool activo;
        uint256 registradoEn;
        uint256 totalAtenciones;
    }

    mapping(address => DoctorInfo) private medicos;
    address[] private listaMedicos;

    event DoctorRegistrado(address indexed medico, string especializacion, uint256 timestamp);
    event DoctorRevocado(address indexed medico);

    constructor() Ownable(msg.sender) {}

    function registerDoctor(
        address medico,
        string calldata colegiatura,
        string calldata especializacion
    ) external onlyOwner {
        require(medico != address(0), "Direccion invalida");
        require(!medicos[medico].activo, "Medico ya registrado");
        require(bytes(colegiatura).length > 0, "Colegiatura requerida");
        require(bytes(especializacion).length > 0, "Especializacion requerida");

        medicos[medico] = DoctorInfo({
            colegiatura: colegiatura,
            especializacion: especializacion,
            activo: true,
            registradoEn: block.timestamp,
            totalAtenciones: 0
        });
        listaMedicos.push(medico);
        emit DoctorRegistrado(medico, especializacion, block.timestamp);
    }

    function revokeDoctor(address medico) external onlyOwner {
        require(medicos[medico].activo, "Medico no activo");
        medicos[medico].activo = false;
        emit DoctorRevocado(medico);
    }

    function incrementarAtenciones(address medico) external {
        require(medicos[medico].activo, "Medico no activo");
        medicos[medico].totalAtenciones += 1;
    }

    function isVerified(address addr) external view returns (bool) {
        return medicos[addr].activo;
    }

    function getDoctorInfo(address addr) external view returns (DoctorInfo memory) {
        return medicos[addr];
    }

    function getAllDoctors() external view returns (address[] memory) {
        return listaMedicos;
    }
}
