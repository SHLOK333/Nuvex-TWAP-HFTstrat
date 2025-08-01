import { spawn } from 'child_process';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

interface TWAPConfig {
    orderHash: string;
    startTime: number;
    executionWindow: number;
    partInterval: number;
    totalParts: number;
}

class TWAPAutomation {
    private config: TWAPConfig;

    constructor() {
        this.config = {
            orderHash: '0xc84131fe1e4ae81ad6e02d695e8c9e97f49766f020a5f6d7e0deece1ba00f13b',
            startTime: 1753991354,
            executionWindow: 600, // 10 minutes
            partInterval: 120,    // 2 minutes
            totalParts: 5
        };
    }

    async executeForgeScript(): Promise<void> {
        return new Promise((resolve, reject) => {
            const forge = spawn('forge', [
                'script',
                'script/ExecuteLiveTWAPPart.s.sol',
                '--rpc-url',
                'https://arb1.arbitrum.io/rpc',
                '--broadcast',
                '--verify'
            ], {
                stdio: 'inherit',
                shell: true
            });

            forge.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Forge script failed with code ${code}`));
                }
            });
        });
    }

    async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitUntilStartTime(): Promise<void> {
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime < this.config.startTime) {
            const waitTime = (this.config.startTime - currentTime) * 1000;
            console.log(`⏳ Waiting ${waitTime / 1000} seconds until execution begins...`);
            await this.sleep(waitTime);
        }
    }

    async checkStatus(): Promise<void> {
        console.log('📊 Checking TWAP status...');
        try {
            await new Promise((resolve, reject) => {
                const forge = spawn('forge', [
                    'script',
                    'script/CheckTWAPStatus.s.sol',
                    '--rpc-url',
                    'https://arb1.arbitrum.io/rpc'
                ], {
                    stdio: 'inherit',
                    shell: true
                });

                forge.on('close', (code) => {
                    if (code === 0) {
                        resolve(void 0);
                    } else {
                        reject(new Error(`Status check failed with code ${code}`));
                    }
                });
            });
        } catch (error) {
            console.log('❌ Status check failed:', error);
        }
    }

    async run(): Promise<void> {
        console.log('🚀 Starting TypeScript TWAP Automation');
        console.log(`Order Hash: ${this.config.orderHash}`);
        console.log(`Start Time: ${this.config.startTime}`);
        console.log(`Current Time: ${Math.floor(Date.now() / 1000)}`);

        // Wait for start time
        await this.waitUntilStartTime();

        // Execute all parts
        for (let part = 0; part < this.config.totalParts; part++) {
            console.log(`\n🎯 Executing TWAP Part ${part} at ${new Date().toLocaleString()}`);
            
            try {
                await this.executeForgeScript();
                console.log(`✅ Part ${part} completed successfully`);
            } catch (error) {
                console.log(`❌ Part ${part} failed:`, error);
            }

            // Check status after each execution
            await this.checkStatus();

            // Don't wait after the last part
            if (part < this.config.totalParts - 1) {
                console.log(`⏳ Waiting ${this.config.partInterval} seconds for next part...`);
                await this.sleep(this.config.partInterval * 1000);
            }
        }

        console.log('\n✅ TWAP Automation Complete!');
        console.log('Check results on Arbiscan: https://arbiscan.io/address/0xaa3b89a93560F1AC6F2cad0B1aefe75623495a7b');
    }
}

// Run the automation
const automation = new TWAPAutomation();
automation.run().catch(console.error);
