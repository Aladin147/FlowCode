#!/usr/bin/env node

/**
 * FlowCode Extension Packaging Script
 * 
 * This script automates the process of packaging the FlowCode extension for distribution.
 * It performs the following steps:
 * 1. Cleans the output directory
 * 2. Compiles TypeScript code
 * 3. Runs tests (configurable)
 * 4. Updates version if needed
 * 5. Packages the extension
 * 6. Generates a release notes file
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const config = {
    packageJsonPath: path.join(__dirname, '..', 'package.json'),
    changelogPath: path.join(__dirname, '..', 'CHANGELOG.md'),
    outputDir: path.join(__dirname, '..', 'dist'),
    runTests: true,
    generateDocs: true,
    updateVersion: false,
    releaseType: 'alpha', // 'alpha', 'beta', or 'release'
};

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Main function
 */
async function main() {
    try {
        console.log('🚀 FlowCode Extension Packaging Script');
        console.log('======================================');

        // Parse command line arguments
        parseArguments();

        // Create output directory if it doesn't exist
        if (!fs.existsSync(config.outputDir)) {
            fs.mkdirSync(config.outputDir, { recursive: true });
        }

        // Read package.json
        const packageJson = JSON.parse(fs.readFileSync(config.packageJsonPath, 'utf8'));
        console.log(`Current version: ${packageJson.version}`);

        // Update version if needed
        if (config.updateVersion) {
            await updateVersion(packageJson);
        }

        // Clean output directory
        console.log('\n🧹 Cleaning output directory...');
        execSync('npm run clean', { stdio: 'inherit' });

        // Compile TypeScript
        console.log('\n🔨 Compiling TypeScript...');
        execSync('npm run compile', { stdio: 'inherit' });

        // Run tests if enabled
        if (config.runTests) {
            console.log('\n🧪 Running tests...');
            if (config.releaseType === 'release') {
                execSync('npm run test:all', { stdio: 'inherit' });
            } else {
                execSync('npm run test:unit', { stdio: 'inherit' });
            }
        }

        // Generate documentation if enabled
        if (config.generateDocs) {
            console.log('\n📚 Generating documentation...');
            try {
                execSync('npm run generate-docs', { stdio: 'inherit' });
            } catch (error) {
                console.warn('Warning: Documentation generation failed, continuing anyway...');
            }
        }

        // Package the extension
        console.log('\n📦 Packaging extension...');
        let packageCommand = 'npm run package';
        if (config.releaseType === 'alpha') {
            packageCommand = 'npm run package:alpha';
        } else if (config.releaseType === 'beta') {
            packageCommand = 'npm run package:beta';
        }
        execSync(packageCommand, { stdio: 'inherit' });

        // Move the VSIX file to the output directory
        const vsixFile = `flowcode-${packageJson.version}.vsix`;
        const vsixPath = path.join(__dirname, '..', vsixFile);
        const outputPath = path.join(config.outputDir, vsixFile);
        
        if (fs.existsSync(vsixPath)) {
            fs.copyFileSync(vsixPath, outputPath);
            console.log(`\n✅ Extension packaged successfully: ${outputPath}`);
        } else {
            console.error(`\n❌ Failed to find packaged extension: ${vsixPath}`);
        }

        // Generate release notes
        generateReleaseNotes(packageJson.version);

        console.log('\n🎉 Packaging complete!');
        console.log(`\nNext steps:`);
        console.log(`1. Test the extension: code --install-extension ${outputPath}`);
        console.log(`2. Publish to marketplace: vsce publish${config.releaseType !== 'release' ? ' --pre-release' : ''}`);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    } finally {
        rl.close();
    }
}

/**
 * Parse command line arguments
 */
function parseArguments() {
    const args = process.argv.slice(2);
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--no-tests':
                config.runTests = false;
                break;
            case '--no-docs':
                config.generateDocs = false;
                break;
            case '--update-version':
                config.updateVersion = true;
                break;
            case '--release-type':
                if (i + 1 < args.length) {
                    const type = args[++i];
                    if (['alpha', 'beta', 'release'].includes(type)) {
                        config.releaseType = type;
                    } else {
                        console.warn(`Invalid release type: ${type}. Using default: ${config.releaseType}`);
                    }
                }
                break;
            case '--output-dir':
                if (i + 1 < args.length) {
                    config.outputDir = path.resolve(args[++i]);
                }
                break;
        }
    }
}

/**
 * Update version in package.json
 */
async function updateVersion(packageJson) {
    return new Promise((resolve) => {
        const currentVersion = packageJson.version;
        let suggestedVersion;
        
        // Parse current version
        const versionParts = currentVersion.split('.');
        const major = parseInt(versionParts[0]);
        const minor = parseInt(versionParts[1]);
        const patch = parseInt(versionParts[2].split('-')[0]);
        
        // Suggest new version based on release type
        if (config.releaseType === 'alpha') {
            suggestedVersion = `${major}.${minor}.${patch}-alpha`;
        } else if (config.releaseType === 'beta') {
            suggestedVersion = `${major}.${minor}.${patch}-beta`;
        } else {
            suggestedVersion = `${major}.${minor}.${patch}`;
        }
        
        rl.question(`Enter new version (current: ${currentVersion}, suggested: ${suggestedVersion}): `, (newVersion) => {
            const version = newVersion.trim() || suggestedVersion;
            
            // Update package.json
            packageJson.version = version;
            fs.writeFileSync(config.packageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log(`Version updated to ${version}`);
            
            resolve();
        });
    });
}

/**
 * Generate release notes from CHANGELOG.md
 */
function generateReleaseNotes(version) {
    try {
        console.log('\n📝 Generating release notes...');
        
        // Read CHANGELOG.md
        const changelog = fs.readFileSync(config.changelogPath, 'utf8');
        
        // Extract release notes for the current version
        const versionRegex = new RegExp(`## \\[${version.replace(/\./g, '\\.')}\\].*?(?=## \\[|$)`, 's');
        const match = changelog.match(versionRegex);
        
        if (match) {
            const releaseNotes = match[0].trim();
            const releaseNotesPath = path.join(config.outputDir, `RELEASE_NOTES_${version}.md`);
            
            // Write release notes to file
            fs.writeFileSync(releaseNotesPath, releaseNotes);
            console.log(`Release notes generated: ${releaseNotesPath}`);
        } else {
            console.warn(`Warning: Could not find release notes for version ${version} in CHANGELOG.md`);
        }
    } catch (error) {
        console.warn(`Warning: Failed to generate release notes: ${error.message}`);
    }
}

// Run the script
main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
