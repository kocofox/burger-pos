'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ProductComponent extends Model {
    static associate(models) {
      // Asociaciones para poder incluir los nombres en las consultas
      this.belongsTo(models.Ingredient, { foreignKey: 'component_id', constraints: false, as: 'ingredient' });
      this.belongsTo(models.Preparation, { foreignKey: 'component_id', constraints: false, as: 'preparation' });
      this.belongsTo(models.Product, { foreignKey: 'product_id' });
    }
  }
  ProductComponent.init({
    product_id: { type: DataTypes.INTEGER, primaryKey: true },
    component_id: { type: DataTypes.INTEGER, primaryKey: true },
    component_type: { type: DataTypes.ENUM('ingredient', 'preparation'), primaryKey: true },
    quantity_required: { type: DataTypes.DECIMAL(10, 3), allowNull: false }
  }, {
    sequelize,
    modelName: 'ProductComponent',
    tableName: 'product_components',
    timestamps: false
  });
  return ProductComponent;
};