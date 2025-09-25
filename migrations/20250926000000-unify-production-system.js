'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. Añadir la columna para el tipo de uso a las preparaciones
    await queryInterface.addColumn('preparations', 'usage_type', {
      type: Sequelize.ENUM('ingredient', 'dressing'),
      allowNull: false,
      defaultValue: 'ingredient',
      after: 'name'
    });

    // 2. Eliminar la tabla 'sauces' que ya no se necesita
    await queryInterface.dropTable('sauces');
  },

  async down (queryInterface, Sequelize) {
    // Revertir los cambios: eliminar la columna y recrear la tabla de salsas
    await queryInterface.removeColumn('preparations', 'usage_type');

    await queryInterface.createTable('sauces', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false, unique: true }
    });
  }
};