'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Preparation extends Model {
    static associate(models) {
      // Una preparación tiene muchos lotes de producción.
      this.hasMany(models.PreparationLot, { foreignKey: 'preparation_id', as: 'lots' });
      // MODIFICACIÓN: La receta de una preparación ahora está compuesta por 'PreparationComponent'
      this.hasMany(models.PreparationComponent, {
        foreignKey: 'preparation_id',
        as: 'recipe'
      });
    }
  }
  Preparation.init({
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    usage_type: { type: DataTypes.ENUM('ingredient', 'dressing'), allowNull: false, defaultValue: 'ingredient' },
    unit_of_measure: { type: DataTypes.STRING, allowNull: false },
    estimated_expiry_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
    recipe_yield: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1.000 }
  }, { sequelize, modelName: 'Preparation', tableName: 'preparations', timestamps: false });
  return Preparation;
};