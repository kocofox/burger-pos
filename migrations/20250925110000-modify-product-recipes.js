'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Renombrar la tabla
      await queryInterface.renameTable('product_ingredients', 'product_components', { transaction });

      // Añadir la columna para el tipo de componente
      await queryInterface.addColumn('product_components', 'component_type', {
        type: Sequelize.ENUM('ingredient', 'preparation'),
        allowNull: false,
        defaultValue: 'ingredient',
        after: 'product_id'
      }, { transaction });

      // Renombrar la columna de ingredient_id a component_id
      await queryInterface.renameColumn('product_components', 'ingredient_id', 'component_id', { transaction });

      // Actualizar todas las filas existentes para que tengan el tipo 'ingredient'
      await queryInterface.sequelize.query(
        `UPDATE product_components SET component_type = 'ingredient'`,
        { transaction }
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down (queryInterface, Sequelize) {
    // Revertir los cambios en orden inverso
    await queryInterface.renameColumn('product_components', 'component_id', 'ingredient_id');
    await queryInterface.removeColumn('product_components', 'component_type');
    await queryInterface.renameTable('product_components', 'product_ingredients');
  }
};