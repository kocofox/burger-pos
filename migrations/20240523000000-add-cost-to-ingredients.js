'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('ingredients', 'cost', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      after: 'stock' // Coloca la columna después de 'stock' para un mejor orden
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('ingredients', 'cost');
  }
};