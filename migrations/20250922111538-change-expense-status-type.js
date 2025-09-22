'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Renombrar la columna existente para hacer una copia de seguridad de los datos.
      await queryInterface.renameColumn('expenses', 'status', 'status_old', { transaction });

      // 2. Añadir la nueva columna 'status' con la definición ENUM correcta.
      await queryInterface.addColumn('expenses', 'status', {
        type: Sequelize.ENUM('pending_approval', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending_approval'
      }, { transaction });

      // 3. Migrar los datos de la columna antigua a la nueva.
      // Aquí mapeamos 'pending' a 'pending_approval'.
      await queryInterface.sequelize.query(
        `UPDATE expenses SET status = CASE 
           WHEN status_old = 'pending' THEN 'pending_approval'
           WHEN status_old = 'approved' THEN 'approved'
           WHEN status_old = 'rejected' THEN 'rejected'
           ELSE 'pending_approval' -- Un valor por defecto por si hay otros estados inesperados
         END;`,
        { transaction }
      );

      // 4. Eliminar la columna antigua.
      await queryInterface.removeColumn('expenses', 'status_old', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down (queryInterface, Sequelize) {
    // La reversión sería más compleja, por ahora nos enfocamos en que 'up' funcione.
    // Se podría recrear la columna 'status' con el ENUM anterior.
    await queryInterface.removeColumn('expenses', 'status');
  }
};
