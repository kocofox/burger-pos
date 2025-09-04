'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('expenses', 'quantity', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      after: 'description' // Opcional: coloca la columna después de 'description'
    });
    await queryInterface.addColumn('expenses', 'unit', {
      type: Sequelize.STRING(50),
      allowNull: true,
      after: 'quantity' // Opcional: coloca la columna después de 'quantity'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('expenses', 'quantity');
    await queryInterface.removeColumn('expenses', 'unit');
  }
};
