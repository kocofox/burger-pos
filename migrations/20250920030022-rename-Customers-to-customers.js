'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
    // Renombra la tabla de 'Customers' a 'customers'
    await queryInterface.renameTable('Customers', 'customers');
  },

  async down (queryInterface, Sequelize) {
    // Revierte el cambio si es necesario
    await queryInterface.renameTable('customers', 'Customers');
  }
};
