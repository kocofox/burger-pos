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
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users', // Nombre de la tabla de usuarios
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
      }
      // No necesitamos createdAt/updatedAt porque el modelo no los tiene
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('cashier_sessions');
  }
};
