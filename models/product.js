'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      Product.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
      Product.belongsToMany(models.Ingredient, {
        through: models.ProductIngredient,
        foreignKey: 'product_id',
        otherKey: 'ingredient_id',
        as: 'ingredients'
      });
      Product.hasMany(models.OrderItem, { foreignKey: 'product_id', as: 'orderItems' });
    }
  }
  Product.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    stock_type: {
      type: DataTypes.ENUM('SIMPLE', 'COMPOUND'),
      allowNull: false,
      defaultValue: 'SIMPLE'
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100
    }
  }, {
    sequelize,
    modelName: 'Product',
    tableName: 'products',
    timestamps: false
  });
  return Product;
};