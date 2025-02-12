const { SendDiscordLog } = require('../../utils/Discord.js');
const { ParseError } = require('../../errors/Parser.js');
const SequelizeAuto = require('sequelize-auto');
const { Sequelize, Op } = require('sequelize');
const { performance } = require('perf_hooks');
const { GetORMPools } = require('../Connections.js')
const { DefineModels } = require('../orm/models/index.js')
const { Log, LogTypes } = require('../../utils/Logger.js')
const { GetKey } = require('../../language/localisation.js');
const { SetDBORM } = require('../Debug.js');

async function GenerateModels(credentials, index) {
	if (!Config.ORM) return;
	const sourceDBConfig = {
		host: credentials.host,
		dialect: "mysql",
		username: credentials.user,
		password: credentials.password,
		database: credentials.database,
		port: credentials.port
	};

	const autoOptions = {
		directory: GetResourcePath(GetCurrentResourceName()) + "/src/db/orm/models/" + index,
		lang: 'js',
		logging: false,
	};


	try {
		const start = performance.now();
		Log(LogTypes.Info, "^3" + GetKey("MappingDB"));
		const auto = new SequelizeAuto(sourceDBConfig.database, sourceDBConfig.username, sourceDBConfig.password, {
			...autoOptions,
			dialect: sourceDBConfig.dialect,
		});

		await auto.run();

		Log(LogTypes.Info, "^2" + GetKey("MappedSuccess") + " " + (performance.now() - start).toFixed(2) + "ms");
		const end = performance.now();
		if (Config.SendDatabaseMapped)
			SendDiscordLog({
				"content": null,
				"embeds": [
					{
						"title": "ORM Database Mapped",
						"description": "The database has been mapped in " + (end - start).toFixed(4) + " ms.",
						"color": 8912728
					}
				],
				"attachments": []
			})
	} catch (error) {
		Log(LogTypes.Error, "^1" + GetKey("MappedError") + ", " + error.message);
	}
}

async function RegisterORMConnection(index, credentials) {
	if (!Config.ORM) return;
	const start = performance.now();
	const sequelize = await new Sequelize(credentials.database, credentials.user, credentials.password, {
		host: credentials.host,
		dialect: "mysql",
		port: credentials.port,
		logging: false,
		pool: {
			max: Config.ConnectionsORM[1],
			min: Config.ConnectionsORM[0],
			acquire: Config.ORMConnectionTimout
		}
	});
	try {
		await sequelize.authenticate();
		const end = performance.now();
		poolsORM[index] = sequelize;
		DefineModels(sequelize, index);
		SetDBORM(index, true)
		if (Config.LogORMConnections)
			Log(LogTypes.Info, `^2ORM Database ${index} connected successfully in ${(end - start).toFixed(4)}ms`);
	} catch (e) {
		ParseError(`Can't connect to ORM database ${index}, ${e.message}.`);
	}
}

async function MapCustomOperator(operator) {
	let operatorMap = {
		"=": Op.eq,
		"!=": Op.ne,
		">=": Op.gte,
		">": Op.gt,
		"<=": Op.lte,
		"<": Op.lt,
		"!": Op.not,
		"===": Op.is,
		"in": Op.in,
		"notIn": Op.notIn,
		"like": Op.like,
		"notLike": Op.notLike,
		"iLike": Op.iLike,
		"noILike": Op.notILike,
		"startsWith": Op.startsWith,
		"endsWith": Op.endsWith,
		"substring": Op.substring,
		"regexp": Op.regexp,
		"notRegexp": Op.notRegexp,
		"iRegexp": Op.iRegexp,
		"notIRegexp": Op.notIRegexp,
		"between": Op.between,
		"notBetween": Op.notBetween,
		"overlap": Op.overlap,
		"contains": Op.contains,
		"contained": Op.contained,
		"adjacent": Op.adjacent,
		"strictLeft": Op.strictLeft,
		"strictRight": Op.strictRight,
		"noExtendRight": Op.noExtendRight,
		"noExtendLeft": Op.noExtendLeft,
		"and": Op.and,
		"or": Op.or,
		"any": Op.any,
		"all": Op.all,
		"values": Op.values,
		"col": Op.col,
		"placeholder": Op.placeholder,
		"join": Op.join,
		"match": Op.match,
	};
	return operatorMap[operator] || null;
}

async function ParseOperators(obj) {
	const keys = Object.keys(obj);
	for (const key of keys) {
		if (typeof obj[key] === 'object' && obj[key] !== null) {
			obj[key] = await ParseOperators(obj[key]);
		} else {
			if (typeof key === "string") {
				const modifiedKey = await MapCustomOperator(key);
				if (modifiedKey != null) {
					obj[modifiedKey] = obj[key];
					delete obj[key];
				}
			}
		}
	}
	return obj;
}

async function FindAll(index, model, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	ScheduleResourceTick(GetCurrentResourceName())
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].findAll(await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}

async function FindOne(index, model, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].findOne(await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function FindById(index, model, id, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof id === "function")
			callback = id;
		id = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	try {
		const result = await poolsORM[index].models[model].findByPk(id);
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function FindAndCountAll(index, model, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].findAndCountAll(await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}

async function FindOrCreate(index, model, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;

	try {
		const result = await poolsORM[index].models[model].findOrCreate(await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't find or create with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}

async function Create(index, model, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].create(await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function Modify(index, model, values, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = values;
		values = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].update(values, await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function Destroy(index, model, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].destroy(await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function Count(index, model, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].count();
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function Max(index, model, field, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = field;
		field = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].max(field, await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}

async function Min(index, model, field, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = field;
		field = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].min(field, await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function Sum(index, model, field, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = field;
		field = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].sum(field, await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function Increment(index, model, field, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = field;
		field = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].increment(field, await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}
async function Decrement(index, model, field, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = field;
		field = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	options.raw = Config.RawData;
	try {
		const result = await poolsORM[index].models[model].decrement(field, await ParseOperators(options));
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't make query with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}

async function BulkCreate(index, model, values, options, callback) {
	if (!Config.ORM) return ParseError("You're trying to execute a ORM query without ORM enabled in the config.js.")
	ScheduleResourceTick(GetCurrentResourceName())
	if (typeof index === "string") {
		if (typeof options === "function")
			callback = options;
		options = values;
		values = model;
		model = index;
		index = Config.DefaultORMDB;
	}
	if (options == null || options.length == 0) options = {};
	try {
		const result = await poolsORM[index].models[model].bulkCreate(values, options);
		if (typeof callback === "function") return callback(result);
		return result;
	} catch (e) {
		ParseError(`Can't bulk create with ORM database ${index}, ${e.message}.`);
		if (typeof callback === "function") return callback(null);
		return null;
	}
}

if (Config.ORM) {
	global.exports("FindAll", FindAll)
	global.exports("FindOne", FindOne)
	global.exports("FindById", FindById)
	global.exports("FindAndCountAll", FindAndCountAll)
	global.exports("Create", Create)
	global.exports("Modify", Modify)
	global.exports("Destroy", Destroy)
	global.exports("Count", Count)
	global.exports("Max", Max)
	global.exports("Min", Min)
	global.exports("Sum", Sum)
	global.exports("Increment", Increment)
	global.exports("Decrement", Decrement)
	global.exports("BulkCreate", BulkCreate)
	global.exports("FindOrCreate", FindOrCreate)
}

module.exports = {
	RegisterORMConnection,
	GenerateModels
}