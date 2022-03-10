const path = require('path');

module.exports = {
  contracts_directory: './src/contracts',
  contracts_build_directory: './build',
  test_directory: './src/tests',

  plugins: ['solidity-coverage'],

  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*',
    },
  },

  mocha: {
    useColors: true,
    timeout: -1,
    reporter: 'eth-gas-reporter',
    reporterOptions: {
      excludeContracts: ['Migrations'],
    },
  },

  compilers: {
    solc: {
      version: '0.8.0',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        evmVersion: 'byzantium',
      },
    },
  },
};
