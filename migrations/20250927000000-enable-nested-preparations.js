'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Renombrar la tabla para mayor claridad
      await queryInterface.renameTable('preparation_recipes', 'preparation_components', { transaction });

      // Añadir la columna para el tipo de componente
      await queryInterface.addColumn('preparation_components', 'component_type', {
        type: Sequelize.ENUM('ingredient', 'preparation'),
        allowNull: false,
        defaultValue: 'ingredient',
        after: 'preparation_id'
      }, { transaction });

      // Renombrar la columna de ingredient_id a component_id
      await queryInterface.renameColumn('preparation_components', 'ingredient_id', 'component_id', { transaction });

      // Actualizar todas las filas existentes para que tengan el tipo 'ingredient'
      await queryInterface.sequelize.query(
        `UPDATE preparation_components SET component_type = 'ingredient'`,
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
    await queryInterface.renameColumn('preparation_components', 'component_id', 'ingredient_id');
    await queryInterface.removeColumn('preparation_components', 'component_type');
    await queryInterface.renameTable('preparation_components', 'preparation_recipes');
  }
};