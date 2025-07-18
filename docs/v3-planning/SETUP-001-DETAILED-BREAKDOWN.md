# SETUP-001: Initialize V3 Project Structure - Detailed Breakdown

## 🎯 **Task Overview**

**Parent Task**: SETUP-001: Initialize V3 Project Structure [P0]  
**Reference Documents**: 
- [07-clean-architecture-design.md](07-clean-architecture-design.md) - Clean Architecture Layers
- [MVP-PHASE1-IMPLEMENTATION.md](MVP-PHASE1-IMPLEMENTATION.md) - Technical Requirements
- [08-component-specifications.md](08-component-specifications.md) - Component Structure

**Success Criteria**: Clean folder structure following clean architecture, TypeScript compiles without errors, foundation ready for SETUP-002  
**Total Estimated Time**: 2-3 hours  
**Dependencies**: None (foundational task)

## 📋 **Sub-Task Breakdown**

### **SETUP-001.1: Create Clean Architecture Directory Structure** [P0]

#### **Task Description**
Create the foundational directory structure following clean architecture principles as defined in [07-clean-architecture-design.md](07-clean-architecture-design.md).

#### **Specific Actions**
- [ ] Create `src/` root directory
- [ ] Create `src/presentation/` - VS Code UI and user interactions
- [ ] Create `src/application/` - Use cases and business logic  
- [ ] Create `src/domain/` - Core entities and business rules
- [ ] Create `src/infrastructure/` - External services and data persistence
- [ ] Create `src/shared/` - Shared utilities and types
- [ ] Create `tests/` directory with matching structure
- [ ] Create `docs/` directory for code documentation

#### **Directory Structure Validation**
```
src/
├── presentation/           # Presentation Layer
│   ├── chat/              # Chat interface components
│   ├── status/            # Status bar integration
│   ├── commands/          # VS Code commands
│   └── webview/           # WebView providers
├── application/           # Application Layer
│   ├── usecases/          # Use case implementations
│   ├── services/          # Application services
│   └── orchestrators/     # User journey orchestration
├── domain/                # Domain Layer
│   ├── entities/          # Core business entities
│   ├── interfaces/        # Domain interfaces
│   └── services/          # Domain services
├── infrastructure/        # Infrastructure Layer
│   ├── ai/                # AI provider integrations
│   ├── filesystem/        # File system access
│   ├── cache/             # Caching implementations
│   └── config/            # Configuration management
├── shared/                # Shared Layer
│   ├── types/             # Shared TypeScript types
│   ├── utils/             # Utility functions
│   └── constants/         # Application constants
└── tests/                 # Test Structure
    ├── unit/              # Unit tests
    ├── integration/       # Integration tests
    └── fixtures/          # Test fixtures and mocks
```

#### **Success Criteria**
- [ ] All directories created with correct naming
- [ ] Structure matches clean architecture layers from [07-clean-architecture-design.md](07-clean-architecture-design.md)
- [ ] Test directory structure mirrors source structure
- [ ] No extraneous directories that violate clean architecture

#### **Quality Gates**
- [ ] Directory structure enables dependency inversion (infrastructure depends on domain, not vice versa)
- [ ] Presentation layer is clearly separated from business logic
- [ ] Structure supports future component specifications from [08-component-specifications.md](08-component-specifications.md)

**Priority**: P0  
**Estimated Time**: 15 minutes  
**Dependencies**: None

---

### **SETUP-001.2: Configure TypeScript for Clean Architecture** [P0]

#### **Task Description**
Set up TypeScript configuration that enforces clean architecture principles and supports VS Code extension development requirements.

#### **Specific Actions**
- [ ] Create `tsconfig.json` with strict TypeScript settings
- [ ] Configure path mapping for clean architecture layers
- [ ] Set up module resolution for VS Code extension APIs
- [ ] Configure build output directory structure
- [ ] Enable strict null checks and type checking
- [ ] Configure source maps for debugging

#### **TypeScript Configuration Requirements**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": "./src",
    "paths": {
      "@presentation/*": ["presentation/*"],
      "@application/*": ["application/*"],
      "@domain/*": ["domain/*"],
      "@infrastructure/*": ["infrastructure/*"],
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", "tests/**/*"]
}
```

#### **Success Criteria**
- [ ] TypeScript compiles without errors
- [ ] Path mapping works for all architecture layers
- [ ] Strict type checking is enabled
- [ ] VS Code extension APIs are properly typed
- [ ] Source maps are generated for debugging

#### **Quality Gates**
- [ ] Configuration enforces clean architecture boundaries
- [ ] Type safety supports user-experience-first development
- [ ] Build output is optimized for VS Code extension performance
- [ ] Configuration supports Phase 1 performance targets (< 5s startup)

**Priority**: P0  
**Estimated Time**: 30 minutes  
**Dependencies**: SETUP-001.1

---

### **SETUP-001.3: Set Up Build System for VS Code Extension** [P0]

#### **Task Description**
Configure build system optimized for VS Code extension development with performance considerations for Phase 1 targets.

#### **Specific Actions**
- [ ] Install and configure webpack for extension bundling
- [ ] Set up development and production build configurations
- [ ] Configure source map generation for debugging
- [ ] Set up watch mode for development
- [ ] Configure bundle optimization for startup performance
- [ ] Set up build scripts in package.json

#### **Build Configuration Requirements**
```javascript
// webpack.config.js
const path = require('path');

module.exports = {
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@presentation': path.resolve(__dirname, 'src/presentation'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  }
};
```

#### **Package.json Scripts**
```json
{
  "scripts": {
    "build": "webpack --mode production",
    "build:dev": "webpack --mode development",
    "watch": "webpack --mode development --watch",
    "compile": "tsc -p ./",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js"
  }
}
```

#### **Success Criteria**
- [ ] Build system produces optimized extension bundle
- [ ] Development build includes source maps
- [ ] Watch mode works for rapid development
- [ ] Bundle size is optimized for startup performance
- [ ] Build scripts execute without errors

#### **Quality Gates**
- [ ] Bundle size supports < 5 second startup target
- [ ] Build system supports clean architecture path resolution
- [ ] Configuration enables efficient development workflow
- [ ] Production build is optimized for performance

**Priority**: P0  
**Estimated Time**: 45 minutes  
**Dependencies**: SETUP-001.2

---

### **SETUP-001.4: Create VS Code Extension Manifest** [P0]

#### **Task Description**
Create package.json with VS Code extension configuration that supports Phase 1 functionality and user-experience-first approach.

#### **Specific Actions**
- [ ] Create package.json with extension metadata
- [ ] Configure activation events for user-experience-first approach
- [ ] Define contribution points (commands, views, configuration)
- [ ] Set up extension dependencies
- [ ] Configure extension categories and keywords
- [ ] Set up publisher and repository information

#### **Extension Manifest Requirements**
```json
{
  "name": "flowcode",
  "displayName": "FlowCode - AI Coding Companion",
  "description": "Security-first, quality-aware autonomous coding agent with transparent human-in-the-loop oversight",
  "version": "3.0.0-alpha.1",
  "publisher": "flowcode",
  "engines": {
    "vscode": "^1.74.0"
  },
  "categories": [
    "AI",
    "Programming Languages",
    "Other"
  ],
  "keywords": [
    "ai",
    "coding",
    "assistant",
    "quality",
    "security",
    "autonomous"
  ],
  "activationEvents": [
    "onStartupFinished",
    "workspaceContains:**/*"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "flowcode.openChat",
        "title": "Open FlowCode Chat",
        "category": "FlowCode"
      }
    ],
    "views": {
      "explorer": [
        {
          "id": "flowcode.chatView",
          "name": "FlowCode Chat",
          "when": "flowcode.activated"
        }
      ]
    },
    "configuration": {
      "title": "FlowCode",
      "properties": {
        "flowcode.userExperience.introductionPace": {
          "type": "string",
          "enum": ["slow", "moderate", "fast"],
          "default": "moderate",
          "description": "Pace of feature introduction"
        }
      }
    }
  }
}
```

#### **Success Criteria**
- [ ] Extension manifest is valid JSON
- [ ] Activation events support user-experience-first approach
- [ ] Commands and views are properly defined
- [ ] Configuration schema supports user preferences
- [ ] Extension metadata is complete and accurate

#### **Quality Gates**
- [ ] Activation events enable 30-second time to first value
- [ ] Configuration supports progressive feature introduction
- [ ] Manifest enables all Phase 1 functionality
- [ ] Extension follows VS Code marketplace guidelines

**Priority**: P0  
**Estimated Time**: 30 minutes  
**Dependencies**: SETUP-001.3

---

### **SETUP-001.5: Create Foundation Files and Interfaces** [P0]

#### **Task Description**
Create foundational TypeScript files and interfaces that establish the clean architecture contracts.

#### **Specific Actions**
- [ ] Create `src/extension.ts` entry point
- [ ] Create core domain interfaces
- [ ] Create shared types and constants
- [ ] Create basic error handling framework
- [ ] Create logging utility
- [ ] Create configuration management interface

#### **Foundation Files to Create**

**src/extension.ts**
```typescript
import * as vscode from 'vscode';
import { Container } from '@shared/container';
import { ExtensionContext } from '@shared/types';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Initialize dependency injection container
    const container = new Container();
    
    // Initialize extension context
    const extensionContext: ExtensionContext = {
        vscodeContext: context,
        container
    };
    
    // Register for activation completion
    console.log('FlowCode V3 activated');
}

export function deactivate(): void {
    console.log('FlowCode V3 deactivated');
}
```

**src/shared/types/index.ts**
```typescript
import * as vscode from 'vscode';
import { Container } from '../container';

export interface ExtensionContext {
    vscodeContext: vscode.ExtensionContext;
    container: Container;
}

export interface UserSession {
    sessionId: string;
    startTime: Date;
    workspace?: vscode.WorkspaceFolder;
}

export interface TaskResult<T = any> {
    success: boolean;
    data?: T;
    error?: Error;
}
```

**src/shared/container/index.ts**
```typescript
export class Container {
    private services = new Map<string, any>();
    
    register<T>(key: string, service: T): void {
        this.services.set(key, service);
    }
    
    resolve<T>(key: string): T {
        const service = this.services.get(key);
        if (!service) {
            throw new Error(`Service ${key} not found`);
        }
        return service;
    }
}
```

#### **Success Criteria**
- [ ] All foundation files compile without errors
- [ ] Extension entry point is properly structured
- [ ] Dependency injection container is functional
- [ ] Core interfaces support clean architecture
- [ ] Error handling framework is in place

#### **Quality Gates**
- [ ] Foundation supports user-experience-first development
- [ ] Architecture enables Phase 1 component development
- [ ] Code follows TypeScript best practices
- [ ] Foundation is extensible for future phases

**Priority**: P0  
**Estimated Time**: 45 minutes  
**Dependencies**: SETUP-001.4

---

### **SETUP-001.6: Validation and Quality Assurance** [P0]

#### **Task Description**
Validate the complete project structure and ensure all quality gates are met before proceeding to SETUP-002.

#### **Specific Actions**
- [ ] Run TypeScript compilation to verify no errors
- [ ] Test webpack build process
- [ ] Validate VS Code extension loading
- [ ] Check directory structure compliance
- [ ] Verify path mapping functionality
- [ ] Test basic dependency injection

#### **Validation Checklist**
```bash
# Compilation validation
npm run compile
# Expected: No TypeScript errors

# Build validation  
npm run build
# Expected: Successful webpack bundle creation

# Extension validation
# Load extension in VS Code development host
# Expected: Extension activates without errors
```

#### **Success Criteria**
- [ ] TypeScript compiles with zero errors
- [ ] Webpack build completes successfully
- [ ] Extension loads in VS Code without errors
- [ ] All path mappings resolve correctly
- [ ] Dependency injection container works
- [ ] Project structure matches specification

#### **Quality Gates**
- [ ] **Architecture Compliance**: Structure follows clean architecture principles
- [ ] **Performance Readiness**: Build system supports startup time targets
- [ ] **Development Readiness**: Foundation enables systematic task development
- [ ] **User Experience Readiness**: Structure supports 30-second time to first value

**Priority**: P0  
**Estimated Time**: 15 minutes  
**Dependencies**: SETUP-001.5

---

## 🔄 **Quality Gates Summary**

### **SETUP-001 Completion Criteria**
Before proceeding to SETUP-002, ALL of the following must be validated:

#### **Technical Quality Gates**
- [ ] ✅ TypeScript compiles with zero errors
- [ ] ✅ Webpack build produces optimized bundle
- [ ] ✅ VS Code extension loads and activates successfully
- [ ] ✅ All path mappings work correctly
- [ ] ✅ Dependency injection container is functional

#### **Architecture Quality Gates**
- [ ] ✅ Clean architecture layers are properly separated
- [ ] ✅ Directory structure enables dependency inversion
- [ ] ✅ Foundation supports all Phase 1 components
- [ ] ✅ Structure is extensible for future phases

#### **User Experience Quality Gates**
- [ ] ✅ Extension activation supports 30-second time to first value target
- [ ] ✅ Configuration enables progressive feature introduction
- [ ] ✅ Foundation supports user-experience-first development
- [ ] ✅ Structure enables contextual greeting system

#### **Performance Quality Gates**
- [ ] ✅ Bundle size is optimized for startup performance
- [ ] ✅ Build system supports development efficiency
- [ ] ✅ Configuration enables Phase 1 performance targets
- [ ] ✅ Memory usage foundation is established

## 🚨 **Rollback Procedures**

### **If Quality Gates Fail**

#### **TypeScript Compilation Errors**
1. Review tsconfig.json configuration
2. Check path mapping syntax
3. Verify all imports are correctly typed
4. Fix type errors before proceeding

#### **Build System Failures**
1. Verify webpack configuration
2. Check dependency installations
3. Review build script syntax
4. Test with minimal configuration first

#### **Extension Loading Failures**
1. Validate package.json manifest
2. Check activation events configuration
3. Verify entry point file exists
4. Test with minimal extension first

#### **Architecture Violations**
1. Review clean architecture principles
2. Restructure directories if needed
3. Fix dependency directions
4. Validate against reference documents

## 📊 **Success Metrics Alignment**

### **Phase 1 Success Criteria Support**
- **30-Second Time to First Value**: ✅ Extension activation and structure optimized
- **>85% Context Accuracy**: ✅ Foundation enables context assembly components
- **<3 Second Response Time**: ✅ Build system optimized for performance
- **>70% Activation Rate**: ✅ Extension manifest configured for reliable activation

### **Next Task Enablement**
This foundation enables:
- **SETUP-002**: Development tools configuration
- **ARCH-001**: Core architecture implementation
- **UI-001**: Chat interface development
- **AI-001**: AI provider integration

---

**Total Estimated Time**: 2-3 hours  
**Critical Path**: Yes (blocks all subsequent tasks)  
**Success Rate Target**: 100% (foundational task must be perfect)
