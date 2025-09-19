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
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: 'users', // Asegura que el nombre de la tabla sea 'users' en minúsculas.
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
