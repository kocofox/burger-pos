'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. Renombrar 'Crédito' a 'Por Cobrar' si existe
    await queryInterface.sequelize.query(
      `UPDATE payment_methods SET name = 'Por Cobrar' WHERE name = 'Crédito'`
    );

    // 2. Añadir 'Tarjeta de Crédito' si no existe
    const existingCardMethod = await queryInterface.sequelize.query(
      `SELECT * FROM payment_methods WHERE name = 'Tarjeta de Crédito'`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    if (existingCardMethod.length === 0) {
      await queryInterface.bulkInsert('payment_methods', [{ name: 'Tarjeta de Crédito' }], {});
    }
  },

  async down (queryInterface, Sequelize) {
    // Revertir los cambios
    await queryInterface.sequelize.query(
      `UPDATE payment_methods SET name = 'Crédito' WHERE name = 'Por Cobrar'`
    );
    await queryInterface.bulkDelete('payment_methods', { name: 'Tarjeta de Crédito' }, {});
  }
};
