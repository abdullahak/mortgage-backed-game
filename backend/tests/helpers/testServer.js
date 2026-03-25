/**
 * testServer.js — creates a fresh in-memory server instance for each test file.
 *
 * Usage (at the top of each test file, before any requires):
 *   const { getApp, getDb, closeTestServer } = require('./helpers/testServer');
 *
 * Then in beforeAll:
 *   let app, db;
 *   beforeAll(async () => { ({ app, db } = await startTestServer()); });
 *   afterAll(async () => { await closeTestServer(); });
 */

let _server = null;
let _app = null;
let _db = null;

function startTestServer() {
    // Set env vars BEFORE any require() so db.js picks them up
    process.env.DB_PATH = ':memory:';
    process.env.JWT_SECRET = 'test-secret';

    // resetModules is set in jest.config.js, so each file gets fresh modules.
    // But within a file we can call jest.resetModules() again if needed.
    const { app, server } = require('../../server');
    const db = require('../../db');

    _app = app;
    _server = server;
    _db = db;

    return { app, server, db };
}

function closeTestServer() {
    return new Promise((resolve) => {
        if (_server && _server.listening) {
            _server.close(resolve);
        } else {
            resolve();
        }
    });
}

function getApp() { return _app; }
function getDb() { return _db; }

module.exports = { startTestServer, closeTestServer, getApp, getDb };
