const fs = require('fs');

const path = require('path');

const crypto = require('crypto');

const modPaths = JSON.parse(fs.readFileSync(path.join(process.cwd(),'/config/mods.json'), 'utf8'));


function strToLocaleObject(input) {
    if (typeof input === "string") {
        return {
            "en_US": input
        };
    }
    return input;
}

function generateArchiveLinks(archive_links, manifest) {
    return archive_links.map(archive_link => {
        return {
            name: archive_link.name,
            url: generateFromTemplate(archive_link.url, manifest)
        }
    });
}


function generateFromTemplate(string, keys) {
    const regexp = /{{([\w\s]+)}}/g;
    let offset = 0;
    let retStr = '';
    for (const match of string.matchAll(regexp)) {
        retStr += string.substring(offset, match.index);
        retStr += keys[match[1].trim()];
        offset = match.index + match[0].length;
    }
    if (offset < string.length) {
        retStr += string.substring(offset);
    }
    return retStr;
}


function generateReleaseChangeLog(changelogText, version)  {
    const arr = changelogText.split(/\r?\n/).map(e => e.trim());
    const releases = {};
    let current_release;
    let current_version;
    for (const item of arr) {
        if (item.startsWith("v")) {
            current_version = item.substring(1, item.length - 1);
            if (version === current_version) {
                current_release = releases[current_version] = {
                    added: [], // + 
                    changed: [], // -/+
                    deprecated: [], // --
                    removed: [], // -
                    fixes: [], // !!
                    security: [] // !
                };
                current_release.version = current_version;
            }
        } else {
            if (version === current_version) {
                if (item.startsWith("-/+")) {
                    current_release.changed.push(item.substring(3).trim());
                } else if (item.startsWith("--")) {
                    current_release.deprecated.push(item.substring(2).trim());
                } else if (item.startsWith("!!")) {
                    current_release.fixes.push(item.substring(2).trim());
                } else if (item.startsWith("+")) {
                    current_release.added.push(item.substring(1).trim());
                } else if (item.startsWith("-")) {
                    current_release.removed.push(item.substring(1).trim());
                }  else if (item.startsWith("!")) {
                    current_release.security.push(item.substring(1).trim());
                }
            }
        }
    }
    return releases[version];
}

// Modified version of script on: https://blog.abelotech.com/posts/calculate-checksum-hash-nodejs-javascript/
function calculateHash(fileName) {
    const hash = crypto.createHash('sha256');
    const ccmodFile = fs.createReadStream(fileName);

    return new Promise((resolve, reject) => {
        ccmodFile.on('data', (data) => hash.update(data, 'utf8'))
        ccmodFile.on('end', () => resolve(hash.digest('hex')))
    });
}

function findVersionInReleases(releases, version) {
    for (let i = 0; i < releases.length; i++) {
        if (releases[i].version === version) {
            return i;
        }
    }
    return -1;
}

async function run() {
    const modsFile = JSON.parse(fs.readFileSync(process.cwd() + '/mods.json', 'utf8'));
    for (const modPath of modPaths) {
        const dbIdPath = path.join(modPath, '.dbid');
        let uuid;
        try {
            uuid = fs.readFileSync(dbIdPath);
        } catch (e) {
            console.error(e);
            continue;
        }
    
        const pathToVerboseConfig = path.join(process.cwd(),`/mods/${uuid}.json`);
        let config = {};
        try {
            config = JSON.parse(fs.readFileSync(pathToVerboseConfig, 'utf8'));
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.error(e);
            }
        }
    
        // grab id, name, description from mod ccmod.json file
        // and add it to generated file entry
        const manifestPath = path.join(modPath, 'ccmod.json');
    
        let manifest;
        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch (e) {
            console.error(e);
            continue;
        }
    
        const release = {
            id: manifest.id,
            version: manifest.version || "0.0.0",
            dependencies: manifest.dependencies || {}
        };

        const version = manifest.version.replace('v', '');
        
        if (manifest.id) {
            config.id = manifest.id;
        }
    
        if (manifest.name) {
            config.name = strToLocaleObject(manifest.name);
        }
    
        if (manifest.description) {
            config.description = strToLocaleObject(manifest.description);
        }
    
        // grab tags, pages, contributors, latest-version from dbmetadata.json
        const metadataPath = path.join(modPath, 'dbmetadata.json');
    
        let metadata;
        try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));    
        } catch (e) {}
        
        if (metadata) {
            if (Array.isArray(metadata.tags)) {
                config.tags = metadata.tags;
            }
        
            if (Array.isArray(metadata.pages)) {
                config.pages = generateArchiveLinks(metadata.pages, manifest);
            }
        
            if (Array.isArray(metadata.contributors)) {
                config.contributors = metadata.contributors;
            }
        
            if (metadata["latest-version"] && typeof metadata["latest-version"]  === "object") {
                config["latest-version"] = metadata["latest-version"];
            }
    
            // generate archive_links
            release.archive_links = generateArchiveLinks(metadata.archive_links, manifest);
    
            // use "release-file" to generate ccmod hash
            // can only do it for latest verion
            if (metadata["release-file"]) {
                if (!release.hash) {
                    release.hash = {};
                }
                try {
                    release.hash['sha256'] = await calculateHash(metadata["release-file"]);
                } catch (e) {}
                
            }
        }
    
        if (!Array.isArray(config.releases)) {
            config.releases = [];
        }
    
        const versionReleaseIndex = findVersionInReleases(config.releases, version);
        if (versionReleaseIndex === -1) {
            config.releases.push(release);
        } else {
            config.releases.splice(versionReleaseIndex, 1, release);
        }
        
        const changelogPath = path.join(modPath, 'CHANGELOG');
    
        try {
            // generate release changelog from CHANGELOG
            const changelogRaw = fs.readFileSync(changelogPath, 'utf8');
            const changelogData = generateReleaseChangeLog(changelogRaw, version);
            Object.assign(release, changelogData);
        } catch (e) {}
        
        // put to explicit mods version
        modsFile[uuid] = {
            id: manifest.id,
            default: "stable",
            "lastest-version": config["latest-version"],
            dependencies: manifest.dependencies,
            archive_links: release.archive_links,
            hash: release.hash
        };

        fs.writeFileSync(pathToVerboseConfig, JSON.stringify(config));
    }
    fs.writeFileSync(process.cwd() + '/mods.json', JSON.stringify(modsFile));    
}


run()