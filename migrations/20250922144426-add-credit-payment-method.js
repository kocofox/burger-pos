'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Busca si ya existe el método de pago 'Crédito'
    const existingMethod = await queryInterface.sequelize.query(
      `SELECT * FROM payment_methods WHERE name = 'Crédito'`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Si no existe, lo inserta.
    if (existingMethod.length === 0) {
      await queryInterface.bulkInsert('payment_methods', [{ name: 'Crédito' }], {});
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('payment_methods', { name: 'Crédito' }, {});
  }
};
