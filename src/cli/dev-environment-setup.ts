#!/usr/bin/env node
/**
 * Development Environment Setup Tool
 * Sets up local Qdrant binary for development when Docker is not available
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { platform, arch } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface QdrantRelease {
  version: string;
  downloadUrl: string;
  filename: string;
}

export class DevEnvironmentSetup {
  private qdrantDir: string;
  private qdrantBinary: string;
  private configFile: string;

  constructor() {
    this.qdrantDir = join(process.cwd(), '.in-memoria', 'qdrant');
    this.qdrantBinary = join(this.qdrantDir, 'qdrant');
    this.configFile = join(this.qdrantDir, 'config.yaml');
  }

  async setup(): Promise<void> {
    console.log('🔧 Setting up In-Memoria development environment...\n');

    try {
      await this.checkPrerequisites();
      await this.setupQdrant();
      this.createStartScripts();
      await this.testSetup();
      
      console.log('\n✅ Development environment setup complete!');
      console.log('\n📋 Next steps:');
      console.log('   1. Start Qdrant: npm run dev:qdrant');
      console.log('   2. Set environment: export IN_MEMORIA_VECTOR_TYPE=qdrant');
      console.log('   3. Start In-Memoria: npm run dev\n');
    } catch (error) {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    }
  }

  private async checkPrerequisites(): Promise<void> {
    console.log('🔍 Checking prerequisites...');

    // Check if we're in the right directory
    if (!existsSync('package.json')) {
      throw new Error('Please run this from the In-Memoria project root directory');
    }

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required. Current version: ${nodeVersion}`);
    }

    // Check if Docker is available (optional)
    try {
      execSync('docker --version', { stdio: 'ignore' });
      console.log('   ℹ️  Docker detected - you can also use docker-compose for development');
    } catch {
      console.log('   ℹ️  Docker not available - using local binary setup');
    }

    console.log('   ✅ Prerequisites OK\n');
  }

  private async setupQdrant(): Promise<void> {
    console.log('📦 Setting up Qdrant...');

    // Create directories
    if (!existsSync(this.qdrantDir)) {
      mkdirSync(this.qdrantDir, { recursive: true });
    }

    // Check if already installed
    if (existsSync(this.qdrantBinary)) {
      console.log('   ℹ️  Qdrant binary already exists, checking version...');
      
      try {
        const output = execSync(`"${this.qdrantBinary}" --version`, { encoding: 'utf8' });
        console.log(`   ✅ Current version: ${output.trim()}`);
        
        // Create config if missing
        if (!existsSync(this.configFile)) {
          this.createQdrantConfig();
        }
        return;
      } catch {
        console.log('   ⚠️  Existing binary seems corrupted, re-downloading...');
      }
    }

    // Download Qdrant
    const release = this.getQdrantRelease();
    console.log(`   📥 Downloading Qdrant ${release.version}...`);
    
    await this.downloadQdrant(release);
    this.createQdrantConfig();
    
    console.log('   ✅ Qdrant setup complete\n');
  }

  private getQdrantRelease(): QdrantRelease {
    const currentPlatform = platform();
    const currentArch = arch();

    // Map Node.js platform/arch to Qdrant release names
    let platformString: string;
    let archString: string;

    switch (currentPlatform) {
      case 'linux':
        platformString = 'unknown-linux-gnu';
        break;
      case 'darwin':
        platformString = 'apple-darwin';
        break;
      case 'win32':
        platformString = 'pc-windows-msvc';
        break;
      default:
        throw new Error(`Unsupported platform: ${currentPlatform}`);
    }

    switch (currentArch) {
      case 'x64':
        archString = 'x86_64';
        break;
      case 'arm64':
        archString = 'aarch64';
        break;
      default:
        throw new Error(`Unsupported architecture: ${currentArch}`);
    }

    const version = '1.7.0'; // Update this as needed
    const filename = `qdrant-${archString}-${platformString}`;
    const downloadUrl = `https://github.com/qdrant/qdrant/releases/download/v${version}/${filename}.tar.gz`;

    return {
      version,
      downloadUrl,
      filename
    };
  }

  private async downloadQdrant(release: QdrantRelease): Promise<void> {
    const tempFile = join(this.qdrantDir, 'qdrant.tar.gz');

    try {
      // Download using curl or fetch
      if (await this.hasCommand('curl')) {
        execSync(`curl -L "${release.downloadUrl}" -o "${tempFile}"`, { stdio: 'inherit' });
      } else {
        // Fallback to Node.js fetch (Node 18+)
        const response = await fetch(release.downloadUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }
        
        const buffer = await response.arrayBuffer();
        writeFileSync(tempFile, Buffer.from(buffer));
      }

      // Extract
      if (await this.hasCommand('tar')) {
        execSync(`tar -xzf "${tempFile}" -C "${this.qdrantDir}" --strip-components=1`, { stdio: 'inherit' });
      } else {
        throw new Error('tar command not found. Please install tar or use Docker instead.');
      }

      // Make executable
      chmodSync(this.qdrantBinary, 0o755);

      // Cleanup
      if (existsSync(tempFile)) {
        execSync(`rm "${tempFile}"`);
      }

    } catch (error) {
      throw new Error(`Failed to download Qdrant: ${error}`);
    }
  }

  private createQdrantConfig(): void {
    const config = `
# Qdrant configuration for In-Memoria development
storage:
  storage_path: ${join(this.qdrantDir, 'storage')}

service:
  http_port: 6333
  grpc_port: 6334
  host: 127.0.0.1

cluster:
  enabled: false

telemetry_disabled: true

log_level: INFO
`.trim();

    writeFileSync(this.configFile, config);
    console.log(`   ✅ Created config file: ${this.configFile}`);
  }

  private createStartScripts(): void {
    console.log('📝 Creating helper scripts...');

    // Create start script
    const startScript = `#!/bin/bash
echo "🚀 Starting Qdrant for In-Memoria development..."
cd "${this.qdrantDir}"
"${this.qdrantBinary}" --config-path "${this.configFile}"
`;

    const startScriptPath = join(this.qdrantDir, 'start-qdrant.sh');
    writeFileSync(startScriptPath, startScript);
    chmodSync(startScriptPath, 0o755);

    // Create stop script
    const stopScript = `#!/bin/bash
echo "🛑 Stopping Qdrant..."
pkill -f qdrant || echo "Qdrant not running"
`;

    const stopScriptPath = join(this.qdrantDir, 'stop-qdrant.sh');
    writeFileSync(stopScriptPath, stopScript);
    chmodSync(stopScriptPath, 0o755);

    // Update package.json scripts
    this.updatePackageScripts();

    console.log('   ✅ Helper scripts created\n');
  }

  private updatePackageScripts(): void {
    const packageJsonPath = join(process.cwd(), 'package.json');
    
    if (!existsSync(packageJsonPath)) {
      return;
    }

    try {
      const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf8'));
      
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }

      // Add development scripts
      packageJson.scripts['dev:qdrant'] = `${join(this.qdrantDir, 'start-qdrant.sh')}`;
      packageJson.scripts['dev:qdrant:stop'] = `${join(this.qdrantDir, 'stop-qdrant.sh')}`;
      packageJson.scripts['dev:setup'] = 'node src/cli/dev-environment-setup.js';

      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('   ✅ Updated package.json scripts');
    } catch (error) {
      console.warn('   ⚠️  Could not update package.json scripts:', error);
    }
  }

  private async testSetup(): Promise<void> {
    console.log('🧪 Testing setup...');

    // Test Qdrant binary
    try {
      const output = execSync(`"${this.qdrantBinary}" --version`, { encoding: 'utf8' });
      console.log(`   ✅ Qdrant binary works: ${output.trim()}`);
    } catch (error) {
      throw new Error(`Qdrant binary test failed: ${error}`);
    }

    // Test config file
    if (!existsSync(this.configFile)) {
      throw new Error('Config file was not created');
    }
    console.log('   ✅ Config file exists');

    console.log('   ✅ All tests passed\n');
  }

  private async hasCommand(command: string): Promise<boolean> {
    try {
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async startQdrant(): Promise<void> {
    console.log('🚀 Starting Qdrant...');

    if (!existsSync(this.qdrantBinary)) {
      throw new Error('Qdrant not installed. Run setup first.');
    }

    const process = spawn(this.qdrantBinary, ['--config-path', this.configFile], {
      cwd: this.qdrantDir,
      stdio: 'inherit'
    });

    process.on('error', (error) => {
      console.error('Failed to start Qdrant:', error);
    });

    process.on('exit', (code) => {
      console.log(`Qdrant exited with code ${code}`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping Qdrant...');
      process.kill();
    });
  }

  async stopQdrant(): Promise<void> {
    console.log('🛑 Stopping Qdrant...');
    
    try {
      execSync('pkill -f qdrant', { stdio: 'ignore' });
      console.log('   ✅ Qdrant stopped');
    } catch {
      console.log('   ℹ️  Qdrant was not running');
    }
  }

  printStatus(): void {
    console.log('📊 Development Environment Status:\n');

    // Check Qdrant installation
    if (existsSync(this.qdrantBinary)) {
      try {
        const output = execSync(`"${this.qdrantBinary}" --version`, { encoding: 'utf8' });
        console.log(`   ✅ Qdrant installed: ${output.trim()}`);
      } catch {
        console.log('   ❌ Qdrant binary corrupted');
      }
    } else {
      console.log('   ❌ Qdrant not installed');
    }

    // Check if running
    try {
      execSync('curl -s http://localhost:6333/collections >/dev/null 2>&1');
      console.log('   ✅ Qdrant running on port 6333');
    } catch {
      console.log('   ⚠️  Qdrant not running');
    }

    // Check config
    if (existsSync(this.configFile)) {
      console.log('   ✅ Config file exists');
    } else {
      console.log('   ❌ Config file missing');
    }

    console.log('\n💡 Commands:');
    console.log('   Setup:  npm run dev:setup');
    console.log('   Start:  npm run dev:qdrant');
    console.log('   Stop:   npm run dev:qdrant:stop');
    console.log('   Status: npm run dev:status\n');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new DevEnvironmentSetup();
  const command = process.argv[2];

  switch (command) {
    case 'setup':
      setup.setup();
      break;
    case 'start':
      setup.startQdrant();
      break;
    case 'stop':
      setup.stopQdrant();
      break;
    case 'status':
      setup.printStatus();
      break;
    default:
      console.log('Usage: node dev-environment-setup.js [setup|start|stop|status]');
      process.exit(1);
  }
}
