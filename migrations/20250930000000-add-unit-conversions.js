'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. Añadir la columna de unidad estándar a los insumos
    await queryInterface.addColumn('ingredients', 'standard_unit', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'gr',
      after: 'name'
    });

    // 2. Crear la tabla para las conversiones de unidades
    await queryInterface.createTable('unit_conversions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      ingredient_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ingredients', key: 'id' }, onDelete: 'CASCADE' },
      recipe_unit_name: { type: Sequelize.STRING(50), allowNull: false }, // ej: 'cucharadita'
      conversion_factor: { type: Sequelize.DECIMAL(10, 4), allowNull: false } // ej: 5.0000 (cuántas unidades estándar son una unidad de receta)
    });

    // 3. Crear un índice para búsquedas rápidas
    await queryInterface.addIndex('unit_conversions', ['ingredient_id', 'recipe_unit_name'], {
      unique: true,
      name: 'idx_ingredient_unit_unique'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('ingredients', 'standard_unit');
    await queryInterface.dropTable('unit_conversions');
  }
};