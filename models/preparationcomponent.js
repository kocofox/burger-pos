'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PreparationComponent extends Model {
    static associate(models) {
      // Asociaciones para poder incluir los nombres en las consultas
      this.belongsTo(models.Ingredient, { foreignKey: 'component_id', constraints: false, as: 'ingredient' });
      this.belongsTo(models.Preparation, { foreignKey: 'component_id', constraints: false, as: 'preparation' });
      // CORRECCIÓN: Añadir la asociación con la preparación "padre"
      this.belongsTo(models.Preparation, { foreignKey: 'preparation_id' });
    }
  }
  PreparationComponent.init({
    preparation_id: { type: DataTypes.INTEGER, primaryKey: true },
    component_id: { type: DataTypes.INTEGER, primaryKey: true },
    component_type: { type: DataTypes.ENUM('ingredient', 'preparation'), primaryKey: true },
    quantity_required: { type: DataTypes.DECIMAL(10, 3), allowNull: false }
  }, { sequelize, modelName: 'PreparationComponent', tableName: 'preparation_components', timestamps: false });
  return PreparationComponent;
};