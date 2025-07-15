import { suite, test } from 'mocha';
import { expect } from 'chai';
import { Logger, LogLevel } from '../../utils/logger';
import { TestUtils } from '../utils/testUtils';

suite('Logger Unit Tests', () => {
    let logger: Logger;

    setup(() => {
        TestUtils.setup();
        logger = Logger.getInstance();
        logger.clearLogs();
    });

    teardown(() => {
        TestUtils.teardown();
    });

    test('should create singleton instance', () => {
        const logger1 = Logger.getInstance();
        const logger2 = Logger.getInstance();
        expect(logger1).to.equal(logger2);
    });

    test('should log messages with correct level', () => {
        logger.setLogLevel(LogLevel.DEBUG);

        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warning message');
        logger.error('Error message');

        const entries = logger.getLogEntries();
        expect(entries).to.have.length(4);
        expect(entries[0].level).to.equal(LogLevel.DEBUG);
        expect(entries[1].level).to.equal(LogLevel.INFO);
        expect(entries[2].level).to.equal(LogLevel.WARN);
        expect(entries[3].level).to.equal(LogLevel.ERROR);
    });

    test('should filter logs by level', () => {
        logger.setLogLevel(LogLevel.WARN);

        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warning message');
        logger.error('Error message');

        const entries = logger.getLogEntries();
        expect(entries).to.have.length(2);
        expect(entries[0].level).to.equal(LogLevel.WARN);
        expect(entries[1].level).to.equal(LogLevel.ERROR);
    });

    test('should create context logger', () => {
        const contextLogger = logger.createContextLogger('TestContext');
        contextLogger.info('Test message');

        const entries = logger.getLogEntries();
        expect(entries).to.have.length(1);
        expect(entries[0].context).to.equal('TestContext');
        expect(entries[0].message).to.equal('Test message');
    });

    test('should clear logs', () => {
        logger.info('Test message');
        expect(logger.getLogEntries()).to.have.length(1);

        logger.clearLogs();
        expect(logger.getLogEntries()).to.have.length(0);
    });
});