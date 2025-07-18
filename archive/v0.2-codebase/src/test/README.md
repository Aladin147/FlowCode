# FlowCode Test Suite

This directory contains the comprehensive test suite for the FlowCode extension.

## Directory Structure

```
src/test/
├── README.md                    # This file
├── runTest.ts                   # Test runner entry point
├── TestUtils.ts                 # Legacy test utilities (deprecated)
├── suite/
│   └── index.ts                 # Mocha test suite configuration
├── fixtures/                    # Test data and sample files
│   ├── sample-code.ts          # TypeScript sample for testing
│   ├── sample-code.py          # Python sample for testing
│   └── test-config.json        # Test configuration and mock data
├── utils/
│   └── testUtils.ts            # Enhanced test utilities and mocks
├── unit/                       # Unit tests for individual components
│   ├── architect-service.test.ts
│   ├── companion-guard.test.ts
│   ├── final-guard.test.ts
│   ├── graph-service.test.ts
│   ├── hotfix-service.test.ts
│   └── logger.test.ts
├── integration/                # Integration tests for workflows
│   ├── end-to-end.test.ts
│   └── flowcode-extension.integration.test.ts
├── performance/                # Performance and benchmark tests
│   └── companion-guard.benchmark.test.ts
└── security/                   # Security and vulnerability tests
    └── security-audit.test.ts
```

## Test Categories

### Unit Tests (`unit/`)
- Test individual services and utilities in isolation
- Use mocks and stubs for dependencies
- Focus on correctness and edge cases
- Target: >90% code coverage

### Integration Tests (`integration/`)
- Test complete workflows and service interactions
- Use real VS Code API where possible
- Test end-to-end functionality
- Verify proper integration between components

### Performance Tests (`performance/`)
- Benchmark critical operations (e.g., Companion Guard <500ms)
- Memory usage and startup time tests
- Load testing for concurrent operations
- Performance regression detection

### Security Tests (`security/`)
- Input validation and sanitization tests
- API key security and encryption tests
- File path traversal prevention
- Vulnerability scanning and audit tests

## Running Tests

### All Tests
```bash
npm test
```

### By Category
```bash
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:performance   # Performance tests only
npm run test:security      # Security tests only
```

### With Coverage
```bash
npm run test:coverage      # Run tests with coverage report
npm run test:coverage:report # Generate HTML coverage report
```

### Development
```bash
npm run test:watch         # Watch mode for development
```

## Test Utilities

### TestUtils (`utils/testUtils.ts`)
Enhanced test utilities providing:
- VS Code API mocking
- File system mocking
- Mock creation helpers
- Performance timing utilities
- Async testing helpers

### Fixtures (`fixtures/`)
- Sample code files for testing linting and parsing
- Mock API responses for external services
- Test configuration data
- Expected results for validation

## Writing Tests

### Unit Test Example
```typescript
import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import { TestUtils } from '../utils/testUtils';
import { YourService } from '../../services/your-service';

describe('YourService', () => {
    let sandbox: sinon.SinonSandbox;
    let service: YourService;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        TestUtils.setup();
        service = new YourService();
    });

    afterEach(() => {
        TestUtils.teardown();
        sandbox.restore();
    });

    it('should perform expected operation', async () => {
        // Test implementation
        const result = await service.performOperation();
        expect(result).to.be.true;
    });
});
```

### Performance Test Example
```typescript
import { expect } from 'chai';
import { describe, it } from 'mocha';
import { TestUtils } from '../utils/testUtils';

describe('Performance Tests', () => {
    it('should complete operation within time limit', async () => {
        const timer = TestUtils.createTimer();
        timer.start();

        // Perform operation
        await performOperation();

        const elapsed = timer.stop();
        expect(elapsed).to.be.lessThan(500); // 500ms limit
    });
});
```

## Coverage Requirements

- **Unit Tests**: >90% coverage for all services
- **Integration Tests**: Cover all major workflows
- **Performance Tests**: All critical operations benchmarked
- **Security Tests**: All input validation paths tested

## Continuous Integration

Tests are automatically run on:
- Pull requests
- Commits to main branch
- Nightly builds

Coverage reports are generated and uploaded to the CI system for tracking.