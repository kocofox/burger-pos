'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // --- Corregir preparation_components ---
      // 1. Eliminar la restricción incorrecta que apunta solo a 'ingredients'
      await queryInterface.removeConstraint('preparation_components', 'preparation_components_ibfk_2', { transaction });

      // 2. Añadir las restricciones correctas
      await queryInterface.addConstraint('preparation_components', {
        fields: ['preparation_id'],
        type: 'foreign key',
        name: 'fk_prep_comp_to_prep',
        references: { table: 'preparations', field: 'id' },
        onDelete: 'CASCADE',
        transaction
      });

      // --- Corregir product_components ---
      // 1. Eliminar la restricción incorrecta que apunta solo a 'ingredients'
      await queryInterface.removeConstraint('product_components', 'product_components_ibfk_2', { transaction });

      // 2. Añadir las restricciones correctas
      await queryInterface.addConstraint('product_components', {
        fields: ['product_id'],
        type: 'foreign key',
        name: 'fk_prod_comp_to_prod',
        references: { table: 'products', field: 'id' },
        onDelete: 'CASCADE',
        transaction
      });

      await transaction.commit();
    } catch (err) {
      // Si la restricción tiene otro nombre, este log nos ayudará a encontrarlo.
      console.error('Error en la migración de corrección de constraints:', err);
      await transaction.rollback();
      throw err;
    }
  },

  async down (queryInterface, Sequelize) {
    // El 'down' es complejo y riesgoso, lo omitimos por seguridad en este caso práctico.
    // En un entorno de producción real, se construiría el reverso exacto.
  }
};