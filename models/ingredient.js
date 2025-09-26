'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Ingredient extends Model {
    static associate(models) {
      // CORRECCIÓN: Un insumo puede ser parte de muchos componentes de producto.
      // Ya no hay una relación directa belongsToMany con Product.
      Ingredient.hasMany(models.ProductComponent, {
        foreignKey: 'component_id',
        scope: { component_type: 'ingredient' }
      });
      // Un insumo puede tener muchas conversiones de unidad.
      this.hasMany(models.UnitConversion, { foreignKey: 'ingredient_id', as: 'unit_conversions' });
    }
  }
  Ingredient.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    standard_unit: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'gr'
    },
    purchase_unit_name: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    purchase_to_standard_factor: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true
    },
    stock: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 0
    },
    cost_per_purchase_unit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    cost_per_standard_unit: {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Ingredient',
    tableName: 'ingredients',
    timestamps: false
  });
  return Ingredient;
};