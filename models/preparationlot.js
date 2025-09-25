'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PreparationLot extends Model {
    static associate(models) {
      // Cada lote pertenece a una preparación.
      this.belongsTo(models.Preparation, { foreignKey: 'preparation_id', as: 'preparation' });
    }
  }
  PreparationLot.init({
    preparation_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity_produced: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    quantity_remaining: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    cost_per_unit: { type: DataTypes.DECIMAL(10, 4), allowNull: false },
    production_date: { type: DataTypes.DATE, allowNull: false },
    expiry_date: { type: DataTypes.DATE, allowNull: false }
  }, { sequelize, modelName: 'PreparationLot', tableName: 'preparation_lots', timestamps: false });
  return PreparationLot;
};