'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Ingredient extends Model {
    static associate(models) {
      Ingredient.belongsToMany(models.Product, {
        through: models.ProductIngredient,
        foreignKey: 'ingredient_id',
        otherKey: 'product_id',
        as: 'products'
      });
    }
  }
  Ingredient.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Ingredient',
    tableName: 'ingredients',
    timestamps: false
  });
  return Ingredient;
};