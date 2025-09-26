'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.changeColumn('ingredients', 'stock', {
      type: Sequelize.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 0.000
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.changeColumn('ingredients', 'stock', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  }
};