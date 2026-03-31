// Lädt Windows-Zertifikate in Node.js (muss als CJS via --require geladen werden)
const { inject } = require("win-ca");
inject("+");
