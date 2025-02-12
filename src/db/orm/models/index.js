const fs = require('fs')
const Sequelize = require('sequelize')

function DefineModels(sequelize, index) {
    const modelsPath = GetResourcePath(GetCurrentResourceName()) + "/src/db/orm/models/" + index;
    fs.readdirSync(modelsPath)
        .filter((file) => file.endsWith('.js'))
        .forEach((file) => {
            const model = require(path.join(modelsPath, file))(sequelize, Sequelize.DataTypes);
            sequelize.models[model.name] = model;
        }
        );
}

module.exports = { DefineModels }