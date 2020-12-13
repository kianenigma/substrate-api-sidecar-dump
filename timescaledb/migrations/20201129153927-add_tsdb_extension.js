'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.query("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;");
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.query("DROP EXTENSION timescaledb;");
  }
};
