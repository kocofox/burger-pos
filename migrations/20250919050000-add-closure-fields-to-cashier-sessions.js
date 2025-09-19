'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('cashier_sessions', 'end_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      after: 'start_time' // Coloca la columna después de 'start_time'
    });
    await queryInterface.addColumn('cashier_sessions', 'end_time', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'end_amount' // Coloca la columna después de 'end_amount'
    });
    // Esta migración ya no es necesaria porque los campos se añadieron en la migración de creación.
  },

  async down (queryInterface, Sequelize) {
    // La función 'down' revierte los cambios
    await queryInterface.removeColumn('cashier_sessions', 'end_amount');
    await queryInterface.removeColumn('cashier_sessions', 'end_time');
    // No es necesario revertir nada si la migración 'up' está vacía.
  }
};