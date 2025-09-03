'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Sauce extends Model {
    static associate(models) {
      // define association here
    }
  }
  Sauce.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'Sauce',
    tableName: 'sauces',
    timestamps: false
  });
  return Sauce;
};