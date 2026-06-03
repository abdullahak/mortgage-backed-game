const { DatabaseSync } = require('node:sqlite');
const { getConfig } = require('./config');
const { migrate } = require('./migrations');

const DB_PATH = getConfig().dbPath;
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys
db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

migrate(db);

module.exports = db;
