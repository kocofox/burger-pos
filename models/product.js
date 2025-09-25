'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      Product.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
      // CORRECCIÓN: La receta de un producto ahora está compuesta por 'ProductComponent'
      Product.hasMany(models.ProductComponent, {
        foreignKey: 'product_id',
        as: 'components'
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