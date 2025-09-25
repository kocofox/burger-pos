'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. Tabla para definir las Preparaciones
    await queryInterface.createTable('preparations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      unit_of_measure: { type: Sequelize.STRING(50), allowNull: false }, // Ej: 'Litros', 'Kilos', 'Unidades'
      estimated_expiry_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 }
    });

    // 2. Tabla para las recetas de las Preparaciones (qué insumos usan)
    await queryInterface.createTable('preparation_recipes', {
      preparation_id: { type: Sequelize.INTEGER, primaryKey: true, references: { model: 'preparations', key: 'id' }, onDelete: 'CASCADE' },
      ingredient_id: { type: Sequelize.INTEGER, primaryKey: true, references: { model: 'ingredients', key: 'id' }, onDelete: 'CASCADE' },
      quantity_required: { type: Sequelize.DECIMAL(10, 3), allowNull: false } // Permitir decimales para recetas precisas
    });

    // 3. Tabla para registrar los Lotes de producción
    await queryInterface.createTable('preparation_lots', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      preparation_id: { type: Sequelize.INTEGER, references: { model: 'preparations', key: 'id' }, onDelete: 'CASCADE' },
      quantity_produced: { type: Sequelize.DECIMAL(10, 3), allowNull: false },
      quantity_remaining: { type: Sequelize.DECIMAL(10, 3), allowNull: false },
      cost_per_unit: { type: Sequelize.DECIMAL(10, 4), allowNull: false },
      production_date: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      expiry_date: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('preparation_lots');
    await queryInterface.dropTable('preparation_recipes');
    await queryInterface.dropTable('preparations');
  }
};