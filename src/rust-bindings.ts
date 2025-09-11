// Platform-specific binary loading
import { createRequire } from 'module';
import { join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

function loadNativeBinary() {
  const { platform, arch } = process;
  
  // Map Node.js platform/arch to our package names
  const platformMap: Record<string, string> = {
    'linux-x64': '@in-memoria/linux-x64',
    'darwin-x64': '@in-memoria/darwin-x64', 
    'darwin-arm64': '@in-memoria/darwin-arm64',
    'win32-x64': '@in-memoria/win32-x64'
  };
  
  const platformKey = `${platform}-${arch}`;
  const packageName = platformMap[platformKey];
  
  if (!packageName) {
    console.warn(`Unsupported platform: ${platform}-${arch}. Using JavaScript fallbacks.`);
    return null;
  }
  
  try {
    // Try to load from the optional dependency
    return require(packageName);
  } catch (error) {
    // Fallback to local development path
    try {
      return require('../rust-core/index.js');
    } catch (fallbackError) {
      console.warn(
        `Failed to load native binary for ${platformKey}. Using JavaScript fallbacks. ` +
        `For better performance, ensure ${packageName} is installed.`
      );
      return null;
    }
  }
}

// JavaScript fallback implementations
class FallbackSemanticAnalyzer {
  analyze() {
    console.warn('Using JavaScript fallback for SemanticAnalyzer - performance may be reduced');
    return { concepts: [], confidence: 0.5 };
  }
}

class FallbackPatternLearner {
  learn() {
    console.warn('Using JavaScript fallback for PatternLearner - performance may be reduced');
    return { patterns: [], confidence: 0.5 };
  }
}

class FallbackAstParser {
  parse() {
    console.warn('Using JavaScript fallback for AstParser - performance may be reduced');
    return { nodes: [], symbols: [] };
  }
}

const nativeModule = loadNativeBinary();

let SemanticAnalyzer: any, PatternLearner: any, AstParser: any, initCore: any;

if (nativeModule) {
  // Use native implementations
  ({ SemanticAnalyzer, PatternLearner, AstParser, initCore } = nativeModule);
} else {
  // Use JavaScript fallbacks
  SemanticAnalyzer = FallbackSemanticAnalyzer;
  PatternLearner = FallbackPatternLearner;
  AstParser = FallbackAstParser;
  initCore = () => console.warn('Using JavaScript fallbacks - native core not available');
}

// Export the classes (either native or fallback)
export { SemanticAnalyzer, PatternLearner, AstParser, initCore };

// Export class types for use in TypeScript
export type SemanticAnalyzerType = typeof SemanticAnalyzer;
export type PatternLearnerType = typeof PatternLearner;
export type AstParserType = typeof AstParser;

// Export types if available from native module (fallback types)
export interface SemanticConcept {
  id?: string;
  name: string;
  confidence?: number;
}

export interface CodebaseAnalysisResult {
  concepts: SemanticConcept[];
  confidence: number;
}

export interface Pattern {
  id?: string;
  type: string;
  confidence?: number;
}

export interface PatternAnalysisResult {
  patterns: Pattern[];
  confidence: number;
}

export interface ApproachPrediction {
  approach: string;
  confidence: number;
}

export interface LineRange {
  start: number;
  end: number;
}

export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
}

export interface ParseResult {
  nodes: AstNode[];
  symbols: Symbol[];
}

export interface AstNode {
  type: string;
  range?: LineRange;
}

export interface Symbol {
  name: string;
  type: string;
}

export interface PatternExample {
  code: string;
  explanation: string;
}