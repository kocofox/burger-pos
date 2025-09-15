'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'customer_id', {
      type: Sequelize.INTEGER,
      references: {
        model: 'Customers', // Nombre de la tabla de clientes
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL', // Si un cliente se elimina, sus pedidos no se borran, solo se desvinculan.
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('orders', 'customer_id');
  }
};