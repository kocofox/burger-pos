'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UnitConversion extends Model {
    static associate(models) {
      this.belongsTo(models.Ingredient, { foreignKey: 'ingredient_id' });
    }
  }
  UnitConversion.init({
    ingredient_id: { type: DataTypes.INTEGER, allowNull: false },
    recipe_unit_name: { type: DataTypes.STRING, allowNull: false },
    conversion_factor: { type: DataTypes.DECIMAL(10, 4), allowNull: false }
  }, {
    sequelize, modelName: 'UnitConversion', tableName: 'unit_conversions', timestamps: false
  });
  return UnitConversion;
};