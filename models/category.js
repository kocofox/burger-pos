'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Category extends Model {
    static associate(models) {
      Category.hasMany(models.Product, { foreignKey: 'category_id', as: 'products' });
    }
  }
  Category.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    is_customizable: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    display_name: {
      type: DataTypes.STRING
    },
    display_order: {
      type: DataTypes.INTEGER,
      defaultValue: 99
    }
  }, {
    sequelize,
    modelName: 'Category',
    tableName: 'categories',
    timestamps: false
  });
  return Category;
};