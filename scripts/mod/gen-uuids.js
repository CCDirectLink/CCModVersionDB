const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const modPaths = JSON.parse(fs.readFileSync(path.join(process.cwd(),'/config/mods.json'), 'utf8'));

for (const modPath of modPaths) {
    // if mod does not have a .dbid file then generate one
    const dbIdPath = path.join(modPath, '.dbid');
    let uuid;
    try {
        uuid = fs.readFileSync(dbIdPath);
    } catch (e) {
        if (e.code === 'ENOENT') {
            uuid = uuidv4().replace(/-/g, '');
            fs.writeFileSync(dbIdPath, uuid);
        } else {
            throw e;
        }
    }
}
