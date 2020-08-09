const fs = require('fs');
const path = require('path');

const aliasFile = JSON.parse(fs.readFileSync(process.cwd() + '/alias.json', 'utf8'));

const modsFile = JSON.parse(fs.readFileSync(path.join(process.cwd(),'/mods.json'), 'utf8'));

for (const uuid in modsFile) {
    aliasFile.mods[modsFile[uuid].id] = uuid;
}

fs.writeFileSync(process.cwd() + '/alias.json', JSON.stringify(aliasFile));