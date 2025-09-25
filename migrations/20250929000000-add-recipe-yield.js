'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('preparations', 'recipe_yield', {
      type: Sequelize.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 1.000
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('preparations', 'recipe_yield');
  }
};