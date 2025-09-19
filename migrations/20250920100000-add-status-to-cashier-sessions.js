'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('cashier_sessions', 'status', {
      type: Sequelize.ENUM('open', 'pending_approval', 'approved'),
      allowNull: false,
      defaultValue: 'open',
      after: 'end_time'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('cashier_sessions', 'status');
  }
};