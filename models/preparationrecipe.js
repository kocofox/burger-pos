'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PreparationRecipe extends Model {
    static associate(models) {
      this.belongsTo(models.Preparation, { foreignKey: 'preparation_id', as: 'preparation' });
      this.belongsTo(models.Ingredient, { foreignKey: 'ingredient_id', as: 'ingredient' });
    }
  }
  PreparationRecipe.init({
    preparation_id: { type: DataTypes.INTEGER, primaryKey: true },
    ingredient_id: { type: DataTypes.INTEGER, primaryKey: true },
    quantity_required: { type: DataTypes.DECIMAL(10, 3), allowNull: false }
  }, { sequelize, modelName: 'PreparationRecipe', tableName: 'preparation_recipes', timestamps: false });
  return PreparationRecipe;
};