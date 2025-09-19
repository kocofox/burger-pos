'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'role_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'roles', // Nombre de la tabla a la que se hace referencia
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL', // O 'RESTRICT' si prefieres no poder borrar roles en uso
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'role_id');
  }
};
