'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('expenses', 'payment_status', {
      type: Sequelize.ENUM('paid', 'unpaid'),
      allowNull: false,
      defaultValue: 'paid',
      after: 'status' // Colocar después de la columna de aprobación
    });
    await queryInterface.addColumn('expenses', 'payment_method', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'payment_status'
    });
    await queryInterface.addColumn('expenses', 'supplier', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'payment_method'
    });
    await queryInterface.addColumn('expenses', 'voucher_ref', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'supplier'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('expenses', 'payment_status');
    await queryInterface.removeColumn('expenses', 'payment_method');
    await queryInterface.removeColumn('expenses', 'supplier');
    await queryInterface.removeColumn('expenses', 'voucher_ref');
  }
};
