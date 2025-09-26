'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Renombrar 'purchase_unit' a 'purchase_unit_name' para claridad
      await queryInterface.renameColumn('ingredients', 'purchase_unit', 'purchase_unit_name', { transaction });
      
      // Renombrar 'cost' a 'cost_per_purchase_unit'
      await queryInterface.renameColumn('ingredients', 'cost', 'cost_per_purchase_unit', { transaction });

      // Añadir la nueva columna para el costo calculado por unidad estándar
      await queryInterface.addColumn('ingredients', 'cost_per_standard_unit', {
        type: Sequelize.DECIMAL(12, 6), // Mayor precisión para costos pequeños
        allowNull: true,
        after: 'cost_per_purchase_unit'
      }, { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('ingredients', 'cost_per_standard_unit');
    await queryInterface.renameColumn('ingredients', 'cost_per_purchase_unit', 'cost');
    await queryInterface.renameColumn('ingredients', 'purchase_unit_name', 'purchase_unit');
  }
};