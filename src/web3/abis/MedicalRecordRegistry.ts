// Auto-generado desde proyecto-sephiem-syscoin/contracts (zkSYS Testnet).
// Fuente de verdad del ABI. No editar a mano.
export const MedicalRecordRegistryAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_patientRegistry",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_doctorRegistry",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "recordId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "recordPrevioId",
        "type": "bytes32"
      }
    ],
    "name": "CorrectionRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "recordId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "medico",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "paciente",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum MedicalRecordRegistry.RecordType",
        "name": "tipo",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "RecordRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "recordId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum MedicalRecordRegistry.RecordStatus",
        "name": "estado",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "updatedBy",
        "type": "address"
      }
    ],
    "name": "StatusUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "doctorRegistry",
    "outputs": [
      {
        "internalType": "contract DoctorRegistry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "recordId",
        "type": "bytes32"
      }
    ],
    "name": "getRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "recordId",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "hash",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "medico",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "paciente",
            "type": "address"
          },
          {
            "internalType": "enum MedicalRecordRegistry.RecordType",
            "name": "tipo",
            "type": "uint8"
          },
          {
            "internalType": "enum MedicalRecordRegistry.RecordStatus",
            "name": "estado",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "version",
            "type": "string"
          },
          {
            "internalType": "bytes32",
            "name": "recordPrevioId",
            "type": "bytes32"
          }
        ],
        "internalType": "struct MedicalRecordRegistry.MedicalRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "medico",
        "type": "address"
      }
    ],
    "name": "getRecordsByMedico",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "paciente",
        "type": "address"
      }
    ],
    "name": "getRecordsByPaciente",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "patientRegistry",
    "outputs": [
      {
        "internalType": "contract PatientRegistry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "hashNuevo",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "recordPrevioId",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      }
    ],
    "name": "registerCorrection",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "recordId",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "hash",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "paciente",
        "type": "address"
      },
      {
        "internalType": "enum MedicalRecordRegistry.RecordType",
        "name": "tipo",
        "type": "uint8"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      }
    ],
    "name": "registerRecord",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "recordId",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "recordId",
        "type": "bytes32"
      },
      {
        "internalType": "enum MedicalRecordRegistry.RecordStatus",
        "name": "nuevoEstado",
        "type": "uint8"
      }
    ],
    "name": "updateStatus",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "recordId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "hashAVerificar",
        "type": "bytes32"
      }
    ],
    "name": "verifyIntegrity",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
