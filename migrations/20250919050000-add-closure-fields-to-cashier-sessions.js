'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Esta migración se deja vacía porque los campos ya se añadieron en la migración de creación de la tabla.
  },

  async down (queryInterface, Sequelize) {
    // No es necesario revertir nada si la migración 'up' está vacía.
  }
};