'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('ingredients', 'purchase_unit', {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: 'standard_unit'
    });
    await queryInterface.addColumn('ingredients', 'purchase_to_standard_factor', {
      type: Sequelize.DECIMAL(10, 4),
      allowNull: true,
      after: 'purchase_unit'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('ingredients', 'purchase_unit');
    await queryInterface.removeColumn('ingredients', 'purchase_to_standard_factor');
  }
};