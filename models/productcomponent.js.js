'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ProductIngredient extends Model {
    static associate(models) {
      ProductIngredient.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
      ProductIngredient.belongsTo(models.Ingredient, { foreignKey: 'ingredient_id', as: 'ingredient' });
    }
  }
  ProductIngredient.init({
    product_id: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    ingredient_id: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    quantity_required: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    }
  }, {
    sequelize,
    modelName: 'ProductIngredient',
    tableName: 'product_ingredients',
    timestamps: false
  });
  return ProductIngredient;
};