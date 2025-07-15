import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    // Create the mocha test with improved configuration
    const mocha = new Mocha({
        ui: 'bdd', // Use BDD style (describe/it) instead of TDD
        color: true,
        timeout: 30000, // Increased timeout for VS Code extension tests
        reporter: 'spec',
        slow: 1000,
        bail: false, // Don't stop on first failure
        grep: process.env.MOCHA_GREP || undefined,
        invert: process.env.MOCHA_INVERT === 'true'
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((resolve, reject) => {
        // Find all test files
        const testPattern = process.env.TEST_PATTERN || '**/**.test.js';

        glob(testPattern, { cwd: testsRoot }).then((files: string[]) => {
            if (files.length === 0) {
                console.warn(`No test files found matching pattern: ${testPattern}`);
                resolve();
                return;
            }

            console.log(`Found ${files.length} test files:`);
            files.forEach(file => console.log(`  - ${file}`));

            // Add files to the test suite
            files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // Run the mocha test
                mocha.run((failures: number) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        console.log('All tests passed!');
                        resolve();
                    }
                });
            } catch (err) {
                console.error('Error running tests:', err);
                reject(err);
            }
        }).catch(reject);
    });
}