// Auto-generado desde proyecto-sephiem-syscoin/contracts (zkSYS Testnet).
// Fuente de verdad del ABI. No editar a mano.
export const AppointmentRegistryAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_doctorRegistry",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_patientRegistry",
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
        "name": "appointmentId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "paciente",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "medico",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "fechaTimestamp",
        "type": "uint256"
      }
    ],
    "name": "AppointmentBooked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "appointmentId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum AppointmentRegistry.AppointmentStatus",
        "name": "estado",
        "type": "uint8"
      }
    ],
    "name": "AppointmentStatusUpdated",
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
    "inputs": [
      {
        "internalType": "address",
        "name": "medico",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "fechaTimestamp",
        "type": "uint256"
      }
    ],
    "name": "bookAppointment",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "appointmentId",
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
        "name": "appointmentId",
        "type": "bytes32"
      }
    ],
    "name": "confirmAppointment",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
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
        "name": "appointmentId",
        "type": "bytes32"
      }
    ],
    "name": "getAppointment",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "appointmentId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "paciente",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "medico",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "fechaTimestamp",
            "type": "uint256"
          },
          {
            "internalType": "enum AppointmentRegistry.AppointmentStatus",
            "name": "estado",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "creadoEn",
            "type": "uint256"
          }
        ],
        "internalType": "struct AppointmentRegistry.AppointmentInfo",
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
    "name": "getAppointmentsByMedico",
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
    "name": "getAppointmentsByPaciente",
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
        "name": "appointmentId",
        "type": "bytes32"
      },
      {
        "internalType": "enum AppointmentRegistry.AppointmentStatus",
        "name": "nuevoEstado",
        "type": "uint8"
      }
    ],
    "name": "updateAppointmentStatus",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
