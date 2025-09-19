'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cashier_sessions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      user_id: {
        type: Sequelize.INTEGER, // CORRECCIÓN: Asegura que el tipo de dato coincida con la PK de la tabla 'users'.
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE' // Cambiado a CASCADE por coherencia con allowNull: false
      },
      start_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true // Se llena al cerrar la caja
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: true // Se llena al cerrar la caja
      },
      // No necesitamos createdAt/updatedAt porque el modelo no los tiene
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('cashier_sessions');
  }
};
